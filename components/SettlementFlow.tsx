import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Calculator,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Lightbulb,
  Plus,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Expense, TripMember, SettlementBatch, FrozenSettlementResult } from "../types";
import { grossPositionFor } from '../services/grossPositions';
import { buildMinimumSettlementTransfers } from "../services/minimumSettlement";
import {
  buildCompletedSettlementBatch,
  buildSettlementTargets,
  createOnceGuard,
  createSettlementDraft,
  reconcileSelectedTargets,
  resolveBatchTargets,
} from "../services/settlementTargets";
import {
  calculateOutstandingDebts,
  collectSettledPairs,
  projectBatchSettlement,
} from "../services/settlementConsumption";
import { normalizeOwnerMemberId } from "../services/memberIdentity";
import { getOpenDisputes } from "../services/expenseDisputes";
import {
  buildViewerBalanceRows,
  countPayable,
  countReceivable,
  sumPayable,
  sumReceivable,
} from "../services/viewerBalances";
import { getCategoryIcon } from "../constants";
import MemberSettlementDetail from "./MemberSettlementDetail";
import {
  EXPENSE_SELECTION_MODES,
  DateFilter,
  ExpenseSelectionMode,
  collectExpenseCategories,
  filterExpensesForSelection,
  groupExpensesByDate,
  resolveDateRange,
  summarizeSelection,
  toDateKey,
} from "../services/settlementSelection";

type Props = {
  expenses: Expense[];
  outstandingExpenses: Expense[];
  members: TripMember[];
  batches: SettlementBatch[];
  tripId: string;
  onSaveBatch: (batch: SettlementBatch) => void;
  onUpdateBatch: (batchId: string, frozenResult?: FrozenSettlementResult) => void;
  onDeleteBatch: (batchId: string) => void;
  onClose: () => void;
  /** Opens the dispute thread for an expense. Omit to render the list flat. */
  onOpenDisputes?: (expense: Expense) => void;
  /**
   * Whose seat the balances are read from. Defaults to the trip owner, which
   * is the historical behaviour; pass the real viewer so a member is not told
   * they are owed money they actually owe.
   */
  viewerMemberId?: string;
  /** Named on 成員結算明細, so a shared screenshot carries its own context. */
  tripName?: string;
  tripDateRange?: string;
  tripCoverImage?: string;
};
const money = (n: number) => `NT$ ${Math.round(Math.abs(n)).toLocaleString()}`;
const avatar = (name: string) => (
  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 font-black text-violet-700">
    {name.slice(0, 1)}
  </span>
);

/**
 * Who pays whom, as a picture.
 *
 * "應付 NT$ 3,250" still makes the reader work out the direction from the row
 * above it. Two faces and an arrow say it without being read.
 */
const transferFlow = (fromName: string, toName: string) => (
  <span className="flex shrink-0 items-center gap-1.5">
    <span className="flex flex-col items-center gap-1">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-xs font-black text-violet-700">
        {fromName.slice(0, 1)}
      </span>
      <span className="max-w-[4.5rem] truncate text-[10px] font-bold text-slate-500">
        {fromName}
      </span>
    </span>
    <ArrowRight size={16} className="mb-4 text-slate-300" />
    <span className="flex flex-col items-center gap-1">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-500">
        {toName.slice(0, 1)}
      </span>
      <span className="max-w-[4.5rem] truncate text-[10px] font-bold text-slate-500">
        {toName}
      </span>
    </span>
  </span>
);

const SettlementFlow: React.FC<Props> = ({
  expenses,
  outstandingExpenses,
  members,
  batches,
  tripId,
  onSaveBatch,
  onUpdateBatch,
  onDeleteBatch,
  onClose,
  onOpenDisputes,
  viewerMemberId,
  tripName,
  tripDateRange,
  tripCoverImage,
}) => {
  const [screen, setScreen] = useState<"overview" | "create" | "confirm" | "member" | "minimum">(
    "overview",
  );
  const [activeTab, setActiveTab] = useState<"create" | "settled">("create");
  const [title, setTitle] = useState("Day 1");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [confirmSettle, setConfirmSettle] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  // The three tabs are ways to FIND expenses. `selectedIds` stays canonical
  // across all of them, so switching tabs never loses or duplicates a choice.
  const [selectionMode, setSelectionMode] = useState<ExpenseSelectionMode>("date");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  // A settlement starts from a narrow, useful window rather than the whole
  // ledger; the quick filters widen it on demand. DURING is the case the ticket
  // specified; every other phase keeps the same pre-existing 今天 default.
  const [dateFilter, setDateFilter] = useState<DateFilter>({ kind: "today" });
  const owner = members.find((member) => member.type === "owner");
  const ownerId = owner?.id;
  // Settlement eligibility is per Expense x Member obligation, not per Expense.
  // A hotel shared by owner + Gina + V may be settled with Gina now and V later,
  // so an expense stays selectable until every participant is settled.
  const eligible = outstandingExpenses;
  const selectedExpenses = expenses.filter((expense) =>
    selectedIds.includes(expense.id),
  );
  // Settlement targets come from the selected expenses only, never from the
  // trip roster: a member who is in no selected expense has nothing to settle.
  // The owner is the implicit counterparty and is never a selectable target.
  const availableTargets = useMemo(() => {
    const settledPairs = collectSettledPairs(batches, ownerId);
    // A member already settled for every selected expense has nothing left to
    // settle, so they are not offered again.
    return buildSettlementTargets(selectedExpenses, members, ownerId).filter((member) =>
      selectedExpenses.some(
        (expense) => !settledPairs.has(`${expense.id}\u0000${member.id}`),
      ),
    );
  }, [selectedExpenses, members, ownerId, batches]);
  const availableTargetKey = availableTargets.map((member) => member.id).join("|");

  // Deselecting an expense must drop its members from the selection too, so a
  // stale target can never survive into the batch or the confirmation preview.
  useEffect(() => {
    const availableIds = availableTargetKey ? availableTargetKey.split("|") : [];
    setSelectedMembers((previous) => {
      const next = reconcileSelectedTargets(previous, availableIds);
      const unchanged =
        next.length === previous.length && next.every((id, index) => id === previous[index]);
      return unchanged ? previous : next;
    });
  }, [availableTargetKey]);

  const selectedTargetIds = selectedMembers.filter((id) =>
    availableTargets.some((member) => member.id === id),
  );
  const selectedTargetsData = availableTargets.filter((member) =>
    selectedTargetIds.includes(member.id),
  );
  const selectedBatch = selectedBatchId
    ? batches.find((batch) => batch.id === selectedBatchId)
    : undefined;
  // What the confirmation screen may settle: the persisted batch's own targets
  // when a batch is open, never the live selection. Display, frozen result and
  // action must all name the same batch.
  const confirmTargetsData = selectedBatch
    ? resolveBatchTargets(selectedBatch, members, ownerId)
    : selectedTargetsData;
  // Outstanding overview uses settled-pair accounting, so a hotel settled with
  // Gina still shows V's remaining share.
  const overviewDebts = useMemo(
    () => calculateOutstandingDebts(outstandingExpenses, members, batches),
    [outstandingExpenses, members, batches],
  );
  // A settled batch renders the result frozen when it was settled, so a later
  // calculator change cannot rewrite agreed history. Legacy batches saved
  // before freezing existed carry no frozen result and keep recomputing.
  const frozenResult =
    selectedBatch?.status === "settled" ? selectedBatch.frozenResult : undefined;
  // Batch-scoped: the confirmation answers "what does THIS settlement cover",
  // not "what is outstanding globally". A member who is not a target of this
  // batch never appears here, and their share stays outstanding elsewhere.
  const confirmTargetIds = confirmTargetsData.map((member) => member.id);
  const liveDebts = useMemo(
    () => projectBatchSettlement(selectedExpenses, members, confirmTargetIds, ownerId),
    [selectedExpenses, members, confirmTargetIds.join("|"), ownerId],
  );
  const debts = frozenResult ? frozenResult.balances : liveDebts;
  const relative = (Object.entries(debts) as [string, number][])
    .filter(([id, amount]) => id !== ownerId && Math.abs(amount) > 0.5)
    .map(([id, amount]) => ({
      member: members.find((member) => member.id === id),
      amount,
    }))
    .filter((item) => item.member);
  // Expenses still carrying an unanswered question. Display only: these stay
  // in every total and in the minimum-transfer plan, exactly as before.
  const disputedExpenses = expenses
    .map((expense) => ({ expense, disputes: getOpenDisputes(expense) }))
    .filter((entry) => entry.disputes.length > 0);

  // Who the balances are shown to. Stored balances are absolute net amounts per
  // member, which only read as "owes me" from the owner's seat; the service
  // turns them around for anyone else.
  const viewerId = ownerId
    ? normalizeOwnerMemberId(viewerMemberId || ownerId, ownerId)
    : viewerMemberId;
  const viewerIsOwner = !viewerId || viewerId === ownerId;
  const minimumTransfers = buildMinimumSettlementTransfers(overviewDebts);
  const overviewRows = buildViewerBalanceRows({
    debts: overviewDebts,
    members,
    ownerMemberId: ownerId,
    viewerMemberId: viewerId,
  });

  const viewerName =
    members.find((member) => member.id === viewerId)?.name || "我";
  /*
    What each side of the trip comes to, before they cancel out.

    「結算前 是不是要將目前累積下來的帳先顯示？」 — the two cards used to show the
    net position, so a reader who had fronted meals and been fronted others saw
    應收 15,108 and 應付 0. That is the truth about the payment that closes the
    trip, and it is not the truth about the trip; the money they owe had been
    subtracted into nothing before it reached the screen.

    The net answer is still here, underneath: the member rows and 最簡結算方式
    say what actually has to be transferred, which is a different question and
    now has its own place to be asked.
  */
  const gross = grossPositionFor({
    expenses: outstandingExpenses,
    viewerMemberId: viewerId,
    ownerMemberId: ownerId,
  });
  const receivable = gross.receivable;
  const payable = gross.payable;
  // Counts drive the subtitle under each figure; a number alone does not say
  // how many people it involves.
  const receivableCount = gross.owingMemberCount;
  const payableCount = gross.owedMemberCount;
  /** The single figure that closes it, once the two sides are set against each other. */
  const netToViewer = sumReceivable(overviewRows) - sumPayable(overviewRows);
  const memberDetail = members.find((member) => member.id === selectedMemberId);
  const memberExpenses = memberDetail
    ? outstandingExpenses.filter((expense) => {
        const ids = new Set<string>([
          expense.payerId,
          ...Object.keys(expense.payerAllocations || {}),
          ...(expense.beneficiaries || []),
          ...Object.keys(expense.splitAllocations || {}),
        ]);
        // One owner-identity policy everywhere: any legacy or foreign owner
        // alias resolves before comparison, matching the target/selection logic.
        return [...ids].some(
          (id) =>
            (ownerId ? normalizeOwnerMemberId(id, ownerId) : id) === memberDetail.id,
        );
      })
    : [];
  const memberDetailDebts = memberDetail
    ? calculateOutstandingDebts(memberExpenses, members, batches)
    : {};
  // From the owner's seat a member's own net balance reads directly as
  // "owes me". A different viewer needs the pairwise amount between the two of
  // them, not this member's balance with everyone.
  const memberNet = memberDetail
    ? viewerIsOwner
      ? memberDetailDebts[memberDetail.id] || 0
      : overviewRows.find((row) => row.member.id === memberDetail.id)?.amount || 0
    : 0;
  const ownerNet = ownerId ? memberDetailDebts[ownerId] || 0 : 0;
  const liveTotal = selectedExpenses.reduce(
    (sum, expense) => sum + expense.twdAmount,
    0,
  );
  const total = frozenResult ? frozenResult.total : liveTotal;
  const startDate = selectedExpenses.map((expense) => expense.date).sort()[0];
  const endDate = selectedExpenses
    .map((expense) => expense.date)
    .sort()
    .at(-1);
  const expenseCategories = collectExpenseCategories(eligible);
  const today = toDateKey(new Date());
  const dateRange = resolveDateRange(dateFilter, today);
  const visibleExpenses = filterExpensesForSelection(
    eligible,
    selectionMode,
    activeCategory,
    dateRange,
  );
  const dateGroups = groupExpensesByDate(visibleExpenses);
  // Headings only earn their space when more than one date is on screen.
  const showDateHeadings = selectionMode === "date" && dateGroups.length > 1;
  // Always the canonical selection, never the visible list.
  const selectionSummary = summarizeSelection(eligible, selectedIds);
  // A batch needs a name, at least one expense, and at least one counterparty.
  const canProceed =
    title.trim().length > 0 && selectedIds.length > 0 && selectedTargetIds.length > 0;
  const expenseRow = (expense: Expense) => (
    <button
      key={expense.id}
      type="button"
      onClick={() => toggleExpense(expense.id)}
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${selectedIds.includes(expense.id) ? "border-violet-500 bg-violet-50" : "border-gray-100 bg-white"}`}
    >
      <span className="text-violet-600">
        {selectedIds.includes(expense.id) ? <Check size={18} /> : "□"}
      </span>
      <span className="flex-1">
        <b>{expense.description}</b>
        <small className="block text-gray-400">
          {expense.date} ·{" "}
          {expense.splitMethod === "EQUAL"
            ? `${expense.beneficiaries.length} 人平均`
            : expense.splitMethod}
        </small>
      </span>
      <b>{money(expense.twdAmount)}</b>
    </button>
  );
  const toggleExpense = (id: string) =>
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  // ROOT CAUSE FIX: "+ 新增結算" used to keep `selectedBatchId` from a batch
  // opened earlier. The confirm screen then DISPLAYED the new selection while
  // its 標記為已結算 button acted on that stale batch — so choosing Jin could
  // settle Gina. A new settlement now always starts from a clean draft.
  // One tap, one batch: claimed synchronously so a double tap cannot create two.
  const completeGuardRef = useRef(createOnceGuard());
  const [isCompleting, setIsCompleting] = useState(false);
  const startNewSettlement = () => {
    completeGuardRef.current = createOnceGuard();
    setIsCompleting(false);
    const draft = createSettlementDraft();
    setSelectedBatchId(draft.selectedBatchId);
    setSelectedIds(draft.selectedExpenseIds);
    setSelectedMembers(draft.selectedTargetIds);
    setConfirmSettle(false);
    setConfirmDelete(false);
    setScreen("create");
  };
  // One tap from the minimum-transfer plan to the confirmation screen: select
  // every outstanding expense and everyone who owes something on them, then
  // hand over to the existing confirm step. It skips the manual picking, not
  // the confirmation — money is still only recorded when the user accepts.
  const startOneTapSettlement = () => {
    const expenseIds = eligible.map((expense) => expense.id);
    if (!expenseIds.length) return;
    const targets = buildSettlementTargets(eligible, members, ownerId);
    if (!targets.length) return;

    completeGuardRef.current = createOnceGuard();
    setIsCompleting(false);
    setSelectedBatchId(null);
    setSelectedIds(expenseIds);
    setSelectedMembers(targets.map((member) => member.id));
    setConfirmSettle(false);
    setConfirmDelete(false);
    setScreen("confirm");
  };

  // A new settlement is created AND completed in one action: no intermediate
  // open batch, no second visit. Existing open batches keep their own manual
  // completion path.
  const completeNewSettlement = () => {
    if (!selectedIds.length || !selectedTargetIds.length) return;
    const accepted = completeGuardRef.current(() => {
      setIsCompleting(true);
      const now = new Date().toISOString();
      onSaveBatch(
        buildCompletedSettlementBatch({
          id: `settlement-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          tripId,
          title,
          expenseIds: selectedIds,
          targetIds: selectedTargetIds,
          startDate,
          endDate,
          balances: liveDebts,
          total: liveTotal,
          now,
        }),
      );
      const draft = createSettlementDraft();
      setSelectedBatchId(draft.selectedBatchId);
      setSelectedIds(draft.selectedExpenseIds);
      setSelectedMembers(draft.selectedTargetIds);
      setConfirmSettle(false);
      setActiveTab("settled");
      setScreen("overview");
      setIsCompleting(false);
    });
    if (!accepted) return;
  };
  const openBatches = batches.filter((batch) => batch.status === "open");
  const settledBatches = batches.filter((batch) => batch.status === "settled");
  if (screen === "overview")
    return (
      <section className="space-y-4 rounded-[28px] bg-gray-50 p-4 text-[#11183d]">
        <>
          <header className="flex items-center gap-2">
            <button onClick={onClose} aria-label="返回" className="rounded-full p-2 text-[#11183d] hover:bg-white">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-2xl font-black tracking-tight">分帳結算</h1>
          </header>
        </>
        <div className="grid grid-cols-2 rounded-2xl bg-white p-1.5 text-center text-sm font-black shadow-[0_6px_18px_rgba(17,24,61,.05)]">
          <button
            onClick={() => setActiveTab("create")}
            className={`rounded-xl py-2.5 transition-colors ${activeTab === "create" ? "bg-[#f1ecff] text-violet-700" : "text-slate-400"}`}
          >
            建立結算
          </button>
          <button
            onClick={() => setActiveTab("settled")}
            className={`rounded-xl py-2.5 transition-colors ${activeTab === "settled" ? "bg-[#f1ecff] text-violet-700" : "text-slate-400"}`}
          >
            已結算
          </button>
        </div>
        {activeTab === "create" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-start gap-2 rounded-2xl bg-[#eef7f2] p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[#11183d]">應收</p>
                  <p className="mt-1.5 text-2xl font-black text-emerald-700">{money(receivable)}</p>
                  <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                    {receivableCount > 0 ? `${receivableCount} 位成員欠款給你` : "目前沒有人欠你款項"}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <ArrowDown size={16} />
                </span>
              </div>
              <div className="flex items-start gap-2 rounded-2xl bg-slate-100/70 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[#11183d]">應付</p>
                  <p className="mt-1.5 text-2xl font-black text-[#11183d]">{money(payable)}</p>
                  <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                    {payable > 0 ? `你欠 ${payableCount} 位成員款項` : "你目前不需要支付任何款項"}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                  <ArrowUp size={16} />
                </span>
              </div>
            </div>
            {/*
              And what it comes to. Two gross figures answer 「what has this trip
              cost between us」; this answers 「what do we actually transfer」,
              which is the question the rows below are about.
            */}
            {(receivable > 0 || payable > 0) && (
              <div
                data-testid="settlement-net"
                className="mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-100"
              >
                <span className="text-[11px] font-black text-slate-500">
                  {netToViewer >= 0 ? "兩邊相抵後，應向成員收取" : "兩邊相抵後，你需要支付"}
                </span>
                <span className={`text-base font-black ${netToViewer >= 0 ? "text-emerald-700" : "text-[#11183d]"}`}>
                  {money(Math.abs(netToViewer))}
                </span>
              </div>
            )}
            {disputedExpenses.length > 0 && (
              // Surfaced before the member rows, because this is information
              // you want *before* agreeing to a number. The amounts below still
              // include these expenses — an unanswered question is not a
              // decision, so nothing is excluded from the calculation here.
              <div className="rounded-2xl bg-[#f3f0ff] p-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-violet-600 shadow-sm">
                    <Lightbulb size={16} />
                  </span>
                  <h2 className="font-black text-[#11183d]">
                    有 {disputedExpenses.length} 筆帳目尚有疑問
                  </h2>
                </div>
                <p className="ml-10 mt-1 text-xs font-medium leading-relaxed text-slate-500">
                  這些款項仍計入下方金額，建議先回答疑問再結算。
                </p>
                <div className="mt-3 space-y-2">
                  {disputedExpenses.map(({ expense, disputes }) => {
                    const CategoryIcon = getCategoryIcon(expense.category);
                    return (
                    <button
                      key={expense.id}
                      type="button"
                      onClick={() => onOpenDisputes?.(expense)}
                      disabled={!onOpenDisputes}
                      className="flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left shadow-sm transition-colors enabled:hover:bg-violet-50/40 disabled:cursor-default"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-500">
                        <CategoryIcon size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-[#11183d]">
                          {expense.description || "這筆支出"}
                        </div>
                        <div className="mt-0.5 truncate text-xs font-medium text-slate-400">
                          {disputes
                            .map(
                              (dispute) =>
                                `${members.find((m) => m.id === dispute.raisedByMemberId)?.name || "旅伴"} 提出疑問`,
                            )
                            .join("、")}
                        </div>
                      </div>
                      <strong className="shrink-0 whitespace-nowrap text-sm font-black text-[#11183d]">
                        {money(expense.twdAmount)}
                      </strong>
                      {onOpenDisputes && (
                        <ChevronRight size={16} className="shrink-0 text-slate-300" />
                      )}
                    </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between pt-1"><h2 className="text-lg font-black tracking-tight">成員結算</h2></div>
            <div className="space-y-2">
              {overviewRows.map(({ member, amount }) => {
                  const id = member.id;
                  return (
                    <button
                      key={id}
                      onClick={() => { setSelectedMemberId(id); setScreen("member"); }}
                      className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_6px_18px_rgba(17,24,61,.05)]"
                    >
                      {/* amount > 0: the viewer pays out, so the arrow leaves them. */}
                      {amount > 0
                        ? transferFlow(viewerName, member.name)
                        : transferFlow(member.name, viewerName)}
                      <span className="min-w-0 flex-1 text-right">
                        <span
                          className={`block whitespace-nowrap font-black ${
                            amount < 0 ? "text-emerald-600" : "text-red-500"
                          }`}
                        >
                          {money(amount)}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-bold text-slate-400">
                          {amount < 0 ? "應收" : "應付"}
                        </span>
                      </span>
                      <ChevronRight className="shrink-0 text-slate-300" size={18} />
                    </button>
                  );
                })}
              {!overviewRows.length && (
                <p className="rounded-2xl bg-white p-5 text-center text-sm font-bold text-slate-400 shadow-[0_6px_18px_rgba(17,24,61,.05)]">
                  目前沒有需要結算的款項
                </p>
              )}
            </div>
            <button onClick={() => setScreen("minimum")} className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-[0_6px_18px_rgba(17,24,61,.05)]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f1ecff] text-violet-600">
                <Calculator size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block font-black text-[#11183d]">最簡結算方式</b>
                <small className="text-xs font-medium text-slate-400">只需要 {minimumTransfers.length} 筆付款即可結清</small>
              </span>
              <ChevronRight size={18} className="shrink-0 text-slate-300" />
            </button>
            <div>
              <div className="mb-2 flex items-center justify-between pt-1">
                <h2 className="text-lg font-black tracking-tight">目前開放的結算</h2>
                <button
                  type="button"
                  onClick={startNewSettlement}
                  className="flex items-center gap-1 text-sm font-black text-violet-600"
                >
                  <Plus size={16} /> 新增結算
                </button>
              </div>
              {openBatches.length ? (
                openBatches.map((batch) => (
                  <button
                    key={batch.id}
                    onClick={() => {
                      setSelectedBatchId(batch.id);
                      setSelectedIds(batch.expenseIds);
                      setSelectedMembers(batch.memberIds);
                      setTitle(batch.title);
                      setScreen("confirm");
                    }}
                    className="mb-2 flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm"
                  >
                    {avatar(batch.title)}
                    <span className="flex-1">
                      <b>{batch.title}</b>
                      <small className="block text-gray-400">
                        {batch.startDate || "未指定日期"}
                      </small>
                    </span>
                    <b>
                      {money(
                        expenses
                          .filter((e) => batch.expenseIds.includes(e.id))
                          .reduce((s, e) => s + e.twdAmount, 0),
                      )}
                    </b>
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
                      未結算
                    </span>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl bg-white p-8 text-center shadow-[0_6px_18px_rgba(17,24,61,.05)]">
                  <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-300">
                    <FileText size={20} />
                  </span>
                  <p className="mt-3 text-sm font-bold text-slate-400">目前沒有需要結算的款項</p>
                  <p className="mt-1 text-xs font-medium text-slate-300">建立結算後，這裡會顯示待處理的項目。</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div>
            <h2 className="mb-3 pt-1 text-lg font-black tracking-tight">已結算紀錄</h2>
            {settledBatches.length ? (
              <div className="space-y-2">
                {settledBatches.map((batch) => (
                  <button
                    key={batch.id}
                    onClick={() => {
                      setSelectedBatchId(batch.id);
                      setSelectedIds(batch.expenseIds);
                      setSelectedMembers(batch.memberIds);
                      setTitle(batch.title);
                      setScreen("confirm");
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-[0_6px_18px_rgba(17,24,61,.05)]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                      <Check size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate font-black text-[#11183d]">{batch.title}</b>
                      <small className="mt-0.5 block truncate text-xs font-medium text-slate-400">
                        {batch.startDate || "未指定日期"}
                        {batch.settledAt
                          ? ` · 於 ${new Date(batch.settledAt).toLocaleDateString("zh-TW")} 結清`
                          : ""}
                      </small>
                    </span>
                    <span className="shrink-0 text-right">
                      <b className="block whitespace-nowrap font-black text-[#11183d]">
                        {money(
                          expenses
                            .filter((e) => batch.expenseIds.includes(e.id))
                            .reduce((s, e) => s + e.twdAmount, 0),
                        )}
                      </b>
                      <span className="mt-0.5 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                        已結算
                      </span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-slate-300" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-white p-8 text-center shadow-[0_6px_18px_rgba(17,24,61,.05)]">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-300">
                  <Check size={20} />
                </span>
                <p className="mt-3 text-sm font-bold text-slate-400">尚無已結算紀錄</p>
                <p className="mt-1 text-xs font-medium text-slate-300">
                  完成結算後，這裡會保留當時的金額與日期。
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    );
  /*
    成員結算明細, rebuilt to the design the Founder sent.

    It used to open on one member at a time, which is the shape that lets two
    travellers read two mirror-image screens and disagree about who owes whom.
    One table naming everybody, with the bills that produced it underneath,
    cannot be read two ways.
  */
  if (screen === "member")
    return (
      <MemberSettlementDetail
        tripName={tripName || "這趟旅程"}
        dateRange={tripDateRange || ""}
        coverImage={tripCoverImage}
        expenses={expenses}
        members={members}
        ownerMemberId={ownerId}
        onBack={() => setScreen("overview")}
        onClose={onClose}
        onOpenExpense={onOpenDisputes}
      />
    );

  if (screen === "minimum")
    return (
      <section className="space-y-4 rounded-[28px] bg-gray-50 p-5 text-[#11183d]">
        <header className="flex items-center gap-2">
          <button onClick={() => setScreen("overview")} aria-label="返回" className="rounded-full p-2 hover:bg-white">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-black tracking-tight">最簡結算方式</h1>
        </header>

        <div className="rounded-2xl bg-[#f3f0ff] p-5">
          <p className="text-2xl font-black tracking-tight">
            只需要 {minimumTransfers.length} 筆付款即可結清
          </p>
          <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
            系統已自動抵銷彼此欠款，以下是最簡單的結算方式。
          </p>
        </div>

        <div className="space-y-2">
          {minimumTransfers.map((transfer) => {
            const from = members.find((m) => m.id === transfer.fromMemberId);
            const to = members.find((m) => m.id === transfer.toMemberId);
            return (
              <div
                key={`${transfer.fromMemberId}-${transfer.toMemberId}`}
                className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_6px_18px_rgba(17,24,61,.05)]"
              >
                {avatar(from?.name || "?")}
                <b className="truncate font-black">{from?.name}</b>
                <ArrowRight size={16} className="shrink-0 text-slate-300" />
                {avatar(to?.name || "?")}
                <b className="min-w-0 flex-1 truncate font-black">{to?.name}</b>
                <strong className="shrink-0 whitespace-nowrap font-black text-violet-600">
                  {money(transfer.amount)}
                </strong>
              </div>
            );
          })}
          {!minimumTransfers.length && (
            <p className="rounded-2xl bg-white p-5 text-center text-sm font-bold text-slate-400 shadow-[0_6px_18px_rgba(17,24,61,.05)]">
              目前沒有需要結算的款項
            </p>
          )}
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_6px_18px_rgba(17,24,61,.05)]">
          <h2 className="text-lg font-black tracking-tight">結算後各成員餘額</h2>
          <p className="mt-1 text-xs font-medium text-slate-400">
            完成上述付款後，每個人都不再有欠款。
          </p>
          <div className="mt-3 divide-y divide-slate-100">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-3">
                {avatar(m.name)}
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{m.name}</span>
                <b className="shrink-0 text-sm font-black text-slate-400">NT$ 0</b>
              </div>
            ))}
          </div>
        </div>

        {/* Acting on the plan without going back: this screen says what to
            settle, so it is also where settling can start. Selection becomes
            one tap; the existing confirm step still gates the write. */}
        <button
          type="button"
          onClick={startOneTapSettlement}
          disabled={!eligible.length || !minimumTransfers.length}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-4 text-sm font-black text-white shadow-[0_10px_24px_rgba(124,58,237,.3)] transition-colors hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          <Zap size={18} /> 一鍵結算
        </button>
      </section>
    );
  if (screen === "create")
    return (
      <section className="flex flex-col rounded-[28px] bg-white p-5 text-[#11183d]">
        <header className="flex items-center justify-between">
          <button onClick={() => setScreen("overview")}>
            <ArrowLeft />
          </button>
          <h1 className="text-lg font-black">新增結算</h1>
          <button onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="mt-6 space-y-6 overflow-y-auto">
          <div>
            <h2 className="font-black">
              <i className="mr-2 rounded-full bg-violet-600 px-2 py-1 text-white">
                1
              </i>
              結算名稱
            </h2>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-3"
            />
          </div>
          <div>
            <h2 className="font-black">
              <i className="mr-2 rounded-full bg-violet-600 px-2 py-1 text-white">
                2
              </i>
              選擇支出
            </h2>
            <div className="relative z-10 mt-3 grid grid-cols-3 rounded-xl bg-gray-100 p-1 text-center text-xs font-bold">
              {EXPENSE_SELECTION_MODES.map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={selectionMode === mode}
                  onClick={() => setSelectionMode(mode)}
                  className={`rounded-lg py-2 ${selectionMode === mode ? "bg-white text-violet-700 shadow-sm" : "text-gray-500"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {selectionMode === "date" && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {([
                    { kind: "today", label: "今天" },
                    { kind: "recent3", label: "最近 3 天" },
                    { kind: "all", label: "全部" },
                  ] as const).map(({ kind, label }) => (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={dateFilter.kind === kind}
                      onClick={() => setDateFilter({ kind })}
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${dateFilter.kind === kind ? "border-violet-500 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-500"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] font-bold text-gray-500">
                    開始日期
                    <input
                      type="date"
                      value={dateFilter.kind === "custom" ? dateFilter.start || "" : ""}
                      onChange={(event) =>
                        setDateFilter((current) => ({
                          kind: "custom",
                          start: event.target.value,
                          end: current.kind === "custom" ? current.end : undefined,
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-normal text-[#11183d]"
                    />
                  </label>
                  <label className="text-[11px] font-bold text-gray-500">
                    結束日期
                    <input
                      type="date"
                      value={dateFilter.kind === "custom" ? dateFilter.end || "" : ""}
                      onChange={(event) =>
                        setDateFilter((current) => ({
                          kind: "custom",
                          start: current.kind === "custom" ? current.start : undefined,
                          end: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-normal text-[#11183d]"
                    />
                  </label>
                </div>
              </div>
            )}
            <p className="mt-3 text-xs text-gray-500">
              已選擇 {selectionSummary.count} 筆支出・{money(selectionSummary.total)}
            </p>
            {selectionMode === "category" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveCategory(null)}
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${activeCategory === null ? "border-violet-500 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-500"}`}
                >
                  全部
                </button>
                {expenseCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${activeCategory === category ? "border-violet-500 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-500"}`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 space-y-2">
              {visibleExpenses.length === 0 &&
                (selectionMode === "date" ? (
                  <div className="rounded-xl bg-gray-50 p-4 text-center">
                    <p className="text-xs text-gray-400">這段期間沒有可結算的支出</p>
                    <div className="mt-3 flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDateFilter({ kind: "recent3" })}
                        className="rounded-full border border-violet-200 px-3 py-1 text-xs font-bold text-violet-700"
                      >
                        查看最近 3 天
                      </button>
                      <button
                        type="button"
                        onClick={() => setDateFilter({ kind: "all" })}
                        className="rounded-full border border-violet-200 px-3 py-1 text-xs font-bold text-violet-700"
                      >
                        查看全部
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-xl bg-gray-50 p-4 text-center text-xs text-gray-400">
                    沒有符合的支出
                  </p>
                ))}
              {selectionMode === "date"
                ? dateGroups.map((group) => (
                    <div key={group.date} className="space-y-2">
                      {showDateHeadings && (
                        <p className="pt-1 text-xs font-bold text-gray-400">
                          {group.date || "未指定日期"}
                        </p>
                      )}
                      {group.expenses.map((expense) => expenseRow(expense))}
                    </div>
                  ))
                : visibleExpenses.map((expense) => expenseRow(expense))}
            </div>
          </div>
          <div>
            <h2 className="font-black">
              <i className="mr-2 rounded-full bg-violet-600 px-2 py-1 text-white">
                3
              </i>
              選擇結算對象{" "}
              <button
                onClick={() =>
                  setSelectedMembers(availableTargets.map((member) => member.id))
                }
                className="float-right text-sm text-violet-700"
              >
                全選
              </button>
            </h2>
            <p className="mt-2 text-xs text-gray-500">
              選擇這次要和哪些人結清
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {availableTargets.map((member) => (
                <button
                  key={member.id}
                  onClick={() =>
                    setSelectedMembers((ids) =>
                      ids.includes(member.id)
                        ? ids.filter((id) => id !== member.id)
                        : [...ids, member.id],
                    )
                  }
                  className={`flex items-center gap-2 rounded-xl border p-3 ${selectedMembers.includes(member.id) ? "border-violet-500 bg-violet-50" : "border-gray-200"}`}
                >
                  {selectedMembers.includes(member.id) ? (
                    <Check size={16} className="text-violet-600" />
                  ) : (
                    "□"
                  )}
                  {avatar(member.name)}
                  <span className="font-bold">{member.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        {selectedIds.length > 0 && availableTargets.length === 0 && (
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-700">
            這些支出沒有可結算的其他成員
          </p>
        )}
        <button
          type="button"
          disabled={!canProceed}
          onClick={() => setScreen("confirm")}
          className="mt-auto rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 py-4 font-black text-white disabled:opacity-40"
        >
          下一步：查看結算結果
        </button>
      </section>
    );
  return (
    <section className="flex flex-col rounded-[28px] bg-gray-50 p-5 text-[#11183d]">
      <header className="flex items-center justify-between">
        <button onClick={() => setScreen("create")}>
          <ArrowLeft />
        </button>
        <h1 className="text-lg font-black">確認結算</h1>
        <button onClick={onClose}>
          <X />
        </button>
      </header>
      <div className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-black">{title}</h2>
            <p className="text-xs text-gray-400">{startDate || "未指定日期"}</p>
          </div>
          <button
            onClick={() => setScreen("create")}
            className="text-sm font-bold text-violet-700"
          >
            編輯
          </button>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <p>
            包含支出{" "}
            <b className="float-right">
              {selectedExpenses.length} 筆・{money(total)}
            </b>
          </p>
          <p>
            結算期間{" "}
            <b className="float-right">
              {startDate || "-"} – {endDate || "-"}
            </b>
          </p>
          <p>
            結算對象{" "}
            <b className="float-right">
              {confirmTargetsData.map((member) => member.name).join("・") || "-"}
            </b>
          </p>
          {selectedBatch?.status === "settled" && (
            <p>
              結算日期{" "}
              <b className="float-right">
                {selectedBatch.settledAt
                  ? new Date(selectedBatch.settledAt).toLocaleDateString(
                      "zh-TW",
                    )
                  : "-"}
              </b>
            </p>
          )}
        </div>
      </div>
      <div className="mt-5">
        <h2 className="font-black">結算結果（相對於我）</h2>
        <div className="mt-2 rounded-2xl bg-emerald-50 p-4">
          <p className="text-sm font-bold">我應收</p>
          <p className="text-3xl font-black text-emerald-600">
            {money(
              relative
                .filter((item) => (item.amount as number) < 0)
                .reduce(
                  (sum, item) => sum + Math.abs(item.amount as number),
                  0,
                ),
            )}
          </p>
        </div>
        <div className="mt-2 space-y-2">
          {relative.map(({ member, amount }) => (
            <div
              key={member!.id}
              className="flex items-center gap-3 rounded-xl bg-white p-3"
            >
              {avatar(member!.name)}
              <span className="flex-1 font-bold">{member!.name}</span>
              <b className={amount < 0 ? "text-emerald-600" : "text-red-500"}>
                {amount < 0
                  ? `應收 ${money(amount)}`
                  : `應付 ${money(amount)}`}
              </b>
              <ChevronRight size={16} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 flex-1">
        <h2 className="mb-2 font-black">
          支出明細（{selectedExpenses.length}）
        </h2>
        {selectedExpenses.map((expense) => (
          <div
            key={expense.id}
            className="flex justify-between border-b border-gray-200 py-3 text-sm"
          >
            <span>
              <b>{expense.description}</b>
              <small className="ml-2 text-gray-400">{expense.date}</small>
            </span>
            <b>{money(expense.twdAmount)}</b>
          </div>
        ))}
      </div>
      {selectedBatch && (
        <>
          <button
            onClick={() => setConfirmDelete(true)}
            className="mt-4 self-center px-4 py-2 text-sm font-bold text-red-500"
          >
            刪除結算
          </button>
          {confirmDelete && (
            <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-4">
              <p className="font-black">刪除這筆結算？</p>
              <p className="mt-1 text-xs text-gray-600">
                {selectedBatch.status === "settled"
                  ? "刪除後，此批支出將重新計入目前未結算金額。"
                  : "刪除後，支出會重新回到可建立結算的清單中。"}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-xl bg-white py-3 text-sm font-bold"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    onDeleteBatch(selectedBatch.id);
                    setConfirmDelete(false);
                    setSelectedBatchId(null);
                    setScreen("overview");
                    setActiveTab(selectedBatch.status === "settled" ? "settled" : "create");
                  }}
                  className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-bold text-white"
                >
                  刪除
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {selectedBatch?.status === "open" ? (
        <>
          {confirmSettle && (
            <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <p className="font-black">確認這批帳款已完成結算？</p>
              <p className="mt-1 text-xs text-gray-500">
                標記後，這批支出將不再計入目前未結算金額。
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setConfirmSettle(false)}
                  className="flex-1 rounded-xl bg-white py-3 text-sm font-bold"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    // Capture what was actually agreed, from the live figures
                    // on screen at this moment.
                    onUpdateBatch(selectedBatch.id, {
                      balances: { ...liveDebts },
                      total: liveTotal,
                      computedAt: new Date().toISOString(),
                    });
                    setConfirmSettle(false);
                  }}
                  className="flex-1 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white"
                >
                  確認已結算
                </button>
              </div>
            </div>
          )}{" "}
          {!confirmSettle && (
            <button
              onClick={() => setConfirmSettle(true)}
              className="mt-5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 py-4 font-black text-white"
            >
              標記為已結算
            </button>
          )}
        </>
      ) : selectedBatch?.status === "settled" ? (
        <div className="mt-5 rounded-2xl bg-emerald-50 py-4 text-center font-black text-emerald-700">
          已結算
        </div>
      ) : (
        <button
          type="button"
          disabled={isCompleting || !selectedIds.length || !selectedTargetIds.length}
          onClick={completeNewSettlement}
          className="mt-5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 py-4 font-black text-white disabled:opacity-40"
        >
          完成結算
        </button>
      )}
    </section>
  );
};
export default SettlementFlow;
