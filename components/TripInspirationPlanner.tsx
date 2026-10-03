import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, MapPin, Sparkles, Check, AlertTriangle, ArrowRight, Clock3, RotateCcw, CalendarDays, CheckCircle2, Wand2, MoveRight, Trash2, Plus, PencilLine } from 'lucide-react';
import { CommunityPost, ExperienceNoteType, ItineraryItem, SavedTravelInspiration } from '../types';
import ScreenshotItineraryIntake from './ScreenshotItineraryIntake';
import type { ItinerarySlice } from '../services/itineraryImageSlices';
import { selectedInspirationsToItineraryItems } from '../services/inspirationToItinerary';
import { PlacePreview, previewPlaceResolution } from '../services/itineraryPlaceEnrichment';
import {
  analyzeExistingItinerary,
  buildExistingItinerarySnapshot,
  buildItineraryAdjustmentInput,
  generateItineraryAdjustment,
  ItineraryAdjustmentMode,
  ItineraryAdjustmentProposal,
  ItineraryAdjustmentRequestError,
  PINNED_CONFLICT_WARNING,
} from '../services/itineraryAdjustment';
import {
  buildTripPlanningInput,
  buildTripPlanningSelection,
  selectPlannedInspirationGroupIds,
  selectTripInspirationGroups,
  TripDestinationContext,
} from '../services/tripInspirationSelection';
import {
  enumerateTripDates,
  generateTripInspirationProposal,
  ItineraryProposalRequestError,
  TripInspirationProposal,
} from '../services/itineraryPlanningService';
import { ItineraryAcceptanceMode } from '../services/itineraryAcceptance';

export interface ProposalAcceptanceResult {
  ok: boolean;
  /** Shown to the user when the write failed; the proposal stays on screen. */
  error?: string;
  addedCount?: number;
  skippedDuplicateCount?: number;
}

export interface AdjustmentApplyResult {
  ok: boolean;
  /** Shown to the user when the write failed; the diff stays on screen for retry. */
  error?: string;
  addedCount?: number;
  movedCount?: number;
  updatedCount?: number;
  removedCount?: number;
  /** Changes dropped at apply time because the target is pinned right now. */
  pinnedConflictCount?: number;
}

interface Props {
  /** The single existing saved-inspiration store. Read-only here. */
  inspirations: SavedTravelInspiration[];
  communityPosts: CommunityPost[];
  trip: TripDestinationContext & { startDate?: string; endDate?: string };
  selectedGroupIds: string[];
  onSelectionChange: (groupIds: string[]) => void;
  onExploreCommunity: () => void;
  /**
   * The official itinerary as it stands. An empty list keeps the creation flow;
   * anything in it switches the planner into AI 行程調整模式, where the AI reads
   * this plan instead of planning as though the trip were blank.
   */
  existingItinerary: ItineraryItem[];
  /** Writes the proposal through the existing official itinerary path. */
  onAcceptProposal: (proposal: TripInspirationProposal, mode: ItineraryAcceptanceMode) => Promise<ProposalAcceptanceResult>;
  /** Applies a confirmed adjustment diff. Never called before the user confirms. */
  onApplyAdjustment: (proposal: ItineraryAdjustmentProposal) => Promise<AdjustmentApplyResult>;
  /** Returns the user to the normal itinerary view after a successful write. */
  onProposalAccepted: () => void;
  /**
   * Hands the `add` suggestions to the itinerary timeline, where each one shows
   * as a green proposal card the traveller ticks to accept. Nothing is written
   * here: this only moves the pending suggestions to where the plan is read.
   */
  onProposeToItinerary?: (proposal: ItineraryAdjustmentProposal) => void;
  /**
   * Appends cards the traveller picked out of a screenshot. Omit to hide the
   * upload block entirely — nothing here writes without a destination for it.
   */
  onAddItineraryItems?: (items: ItineraryItem[]) => void;
  /**
   * Saves a screenshot's places into the trip's collection, returning how many
   * were kept. They then appear in the picker above like any saved inspiration,
   * and 補充行程 fits them around the itinerary that already exists.
   */
  onSaveScreenshotPlaces?: (slices: ItinerarySlice[]) => Promise<number> | number;
  /**
   * Removes saved places from the trip's collection.
   *
   * 「另外要可以刪除」. A want-to-go list is a list of maybes, and the answer to a
   * maybe is often no — a place read wrong out of a screenshot, a restaurant
   * the group talked themselves out of. Without this the only way off the list
   * was to never have put it on.
   *
   * Takes every inspiration folded into the place, because the row is one
   * place: deleting what the row shows while leaving the other traveller's save
   * of the same restaurant behind would make it reappear on the next sync.
   */
  onRemoveInspirations?: (inspirationIds: string[]) => void;
}

const ADJUSTMENT_MODES: Array<{ mode: ItineraryAdjustmentMode; label: string; subtitle: string }> = [
  { mode: 'add', label: '補充行程', subtitle: '保留目前安排，幫我找適合的空檔加入新景點' },
  { mode: 'fill', label: '把空白的日子排滿', subtitle: '航班、住宿與我固定的項目都不動，其他日子幫我排成完整的一天' },
  { mode: 'reorder', label: '重新安排路線', subtitle: '保留目前想去的景點，調整日期、時間與順序，讓動線更順' },
  { mode: 'replan', label: '重新規劃', subtitle: '參考目前行程、收藏靈感與我的偏好，提出一份新的完整版本' },
];

const NOTE_TYPE_LABELS: Partial<Record<ExperienceNoteType, string>> = {
  recommendation: '推薦',
  warning: '注意',
  timing: '時間',
  queue: '排隊',
  packing: '攜帶',
  facility: '設施',
  price: '價格',
  order: '點餐',
  transport: '交通',
  practical: '實用',
};

const formatDayLabel = (date: string, index: number): string => {
  const parsed = new Date(`${date}T00:00:00Z`);
  const monthDay = Number.isFinite(parsed.getTime()) ? `${parsed.getUTCMonth() + 1}/${String(parsed.getUTCDate()).padStart(2, '0')}` : date;
  return `Day ${index + 1} · ${monthDay}`;
};

const formatDayHeading = (date?: string): string => {
  if (!date) return '未指定日期';
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) ? `${parsed.getUTCMonth() + 1}/${String(parsed.getUTCDate()).padStart(2, '0')}` : date;
};

const TripInspirationPlanner: React.FC<Props> = ({ inspirations, communityPosts, trip, selectedGroupIds, onSelectionChange, onExploreCommunity, existingItinerary, onAcceptProposal, onApplyAdjustment, onProposalAccepted, onProposeToItinerary, onAddItineraryItems, onSaveScreenshotPlaces, onRemoveInspirations }) => {
  const [proposal, setProposal] = useState<TripInspirationProposal | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Trip-wide guidance for the planner. Deliberately outside every reset path: a
  // regenerate, a failed call or a changed selection must not make the user retype it.
  const [planningPreferences, setPlanningPreferences] = useState('');
  const [isMergeChoiceOpen, setIsMergeChoiceOpen] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [acceptedSummary, setAcceptedSummary] = useState<{ addedCount: number; skippedDuplicateCount: number } | null>(null);
  // Place enrichment runs during acceptance, so the write is no longer instant.
  const [isAccepting, setIsAccepting] = useState(false);
  // The group whose 「已在行程中」 explanation is currently showing, if any.
  const [plannedNoticeGroupId, setPlannedNoticeGroupId] = useState<string | null>(null);
  /** Groups whose full note list the traveller asked to see. */
  const [expandedNoteGroupIds, setExpandedNoteGroupIds] = useState<string[]>([]);
  /**
   * The place waiting for its delete to be confirmed.
   *
   * Asked rather than undone: this list is shared, so a mis-tap removes a place
   * off the other traveller's screen too, and the notes that came with it are
   * not re-derivable without the original screenshot.
   */
  const [removingGroupId, setRemovingGroupId] = useState<string | null>(null);

  // AI 行程調整模式 — only reachable when the trip already has an itinerary.
  const [adjustmentMode, setAdjustmentMode] = useState<ItineraryAdjustmentMode | null>(null);
  const [adjustment, setAdjustment] = useState<ItineraryAdjustmentProposal | null>(null);
  // What the apply step would resolve each suggested place to, looked up while
  // the traveller is deciding rather than after they have accepted.
  const [placePreviews, setPlacePreviews] = useState<Map<string, PlacePreview>>(new Map());
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedSummary, setAppliedSummary] = useState<AdjustmentApplyResult | null>(null);
  // Set when the `add` suggestions were handed to the itinerary timeline, so the
  // traveller is told where they went instead of watching the panel go empty.
  const [forwardedCount, setForwardedCount] = useState(0);
  /** The day a manual add drops the chosen places onto, and what it just added. */
  const [manualAddDate, setManualAddDate] = useState('');
  const [manualAddedCount, setManualAddedCount] = useState(0);

  const hasExistingItinerary = existingItinerary.length > 0;
  /** The days a screenshot's places can be dropped onto. */
  const tripDates = useMemo(
    () => enumerateTripDates(trip.startDate, trip.endDate),
    [trip.startDate, trip.endDate],
  );
  const existingById = useMemo(
    () => new Map(existingItinerary.map(item => [item.id, item])),
    [existingItinerary],
  );

  /**
   * What the AI is about to be told, shown before it is asked anything.
   *
   * The analysis was computed and sent and never displayed, so 「AI 會先讀過
   * 目前 N 個項目」 was a claim the traveller had to take on faith — and a
   * number that counts a flight and a check-in as a planned day tells them
   * nothing about the days that are actually blank.
   *
   * Built from the same snapshot the request is built from, so this cannot
   * describe a plan different from the one the model receives.
   */
  const itineraryReadBack = useMemo(() => {
    if (existingItinerary.length === 0) return null;
    const snapshot = buildExistingItinerarySnapshot(existingItinerary);
    const analysis = analyzeExistingItinerary(snapshot, {
      startDate: trip.startDate,
      endDate: trip.endDate,
    });
    return {
      anchorCount: snapshot.filter(item => item.locked || item.fixedEvent || item.accommodation).length,
      plannedCount: snapshot.filter(item => !item.locked && !item.fixedEvent && !item.accommodation).length,
      unplannedDates: analysis.unplannedDates,
    };
  }, [existingItinerary, trip.startDate, trip.endDate]);

  const groups = useMemo(() => selectTripInspirationGroups(inspirations, trip), [inspirations, trip]);
  const groupIds = useMemo(() => new Set(groups.map(group => group.id)), [groups]);
  // Places already in the official itinerary. Compared against the canonical trip
  // itinerary — not a pending proposal, not the local selection, and never a name.
  const plannedGroupIds = useMemo(
    () => selectPlannedInspirationGroupIds(groups, existingItinerary),
    [groups, existingItinerary],
  );
  // A trip switch can leave ids behind; only ids that still exist count as selected.
  // A place that is already planned never counts either, so it cannot reach the
  // 已選 X / Y tally or the AI input through a stale id.
  const selected = useMemo(
    () => selectedGroupIds.filter(id => groupIds.has(id) && !plannedGroupIds.has(id)),
    [selectedGroupIds, groupIds, plannedGroupIds],
  );
  const selectableCount = groups.length - plannedGroupIds.size;

  // Bumped whenever the inputs change, so a slow in-flight request that lands after
  // the user moved on cannot repopulate the preview with a stale proposal.
  const requestRef = useRef(0);

  const discardPendingProposal = () => {
    requestRef.current += 1;
    setProposal(null);
    setError(null);
    setIsGenerating(false);
    setIsMergeChoiceOpen(false);
    setAcceptError(null);
    setAcceptedSummary(null);
  };

  // The proposal is a snapshot of one destination/date/selection combination. If
  // any of those move underneath it, drop it rather than leave stale figures up.
  //
  // Compared by content, never by object identity. `trip` and `groups` are
  // rebuilt whenever the app learns something about the trip — coordinates and
  // a place id resolve asynchronously — and depending on the objects meant a
  // lookup landing a moment after a proposal rendered threw that proposal away
  // with the accept button already under the traveller's finger. Learning where
  // 東京 is is not choosing somewhere else.
  //
  // Coordinates and the resolved place id are deliberately absent below: they
  // describe the same destination in more detail, so they must not invalidate
  // anything. The destination, the dates and which places were chosen are what
  // the figures on screen were actually computed from.
  const proposalContextFingerprint = [
    trip.destination || '',
    trip.destinationCountry || '',
    trip.travelCountry || '',
    trip.startDate || '',
    trip.endDate || '',
    groups.map(group => group.id).join(','),
  ].join('|');
  useEffect(() => { discardPendingProposal(); }, [proposalContextFingerprint]);

  // A diff is written against specific itinerary item ids and their current times.
  // If the itinerary changes underneath it — a hand edit, or the apply that just
  // succeeded — the preview's "原本：" values are no longer true, so it goes away.
  // Deliberately narrower than discardPendingProposal: the applied summary is the
  // result of that very change and must survive it.
  //
  // Sorted, so the order the list arrives in is not mistaken for a change.
  // A cloud re-read replaces the itinerary with the server's copy every twenty
  // seconds, and Postgres returns rows in whatever order it likes — which moves
  // after any write. The same three items in a different order flipped this
  // string, so the preview was torn down seconds after it appeared, with the
  // traveller's finger on the way to 套用. Nothing had changed but the order.
  const itineraryFingerprint = existingItinerary
    .map(entry => `${entry.id}:${entry.date || ''}:${entry.time || ''}`)
    .sort()
    .join('|');
  useEffect(() => {
    setAdjustment(null);
    setAdjustmentError(null);
  }, [itineraryFingerprint]);

  const creatorById = useMemo(() => {
    const map = new Map<string, { name: string; avatar?: string }>();
    communityPosts.forEach(post => map.set(post.creatorId, { name: post.authorName, avatar: post.authorAvatar }));
    return map;
  }, [communityPosts]);

  const toggleGroup = (groupId: string) => {
    // Tapping an already-planned place is a no-op beyond a quiet explanation. It
    // never enters the selection, so it cannot be planned into the trip twice.
    if (plannedGroupIds.has(groupId)) {
      setPlannedNoticeGroupId(groupId);
      return;
    }
    setPlannedNoticeGroupId(null);
    // A failed or stale proposal must never take the user's selection down with it.
    discardPendingProposal();
    onSelectionChange(selected.includes(groupId) ? selected.filter(id => id !== groupId) : [...selected, groupId]);
  };

  /** Regenerating rebuilds from the same canonical input; it never touches saved data. */
  const handleGenerate = async () => {
    if (isGenerating || selected.length === 0) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setIsGenerating(true);
    setError(null);
    setAcceptError(null);
    setAcceptedSummary(null);
    setIsMergeChoiceOpen(false);
    try {
      // Same builder as the first generation, so a regenerate carries the identical
      // preferences rather than quietly reverting to a default plan.
      // The flights go in with it: a day that lands at 19:55 is not a day the
      // planner may fill from the morning.
      const input = buildTripPlanningInput(trip, buildTripPlanningSelection(groups, selected), planningPreferences, existingItinerary);
      const generated = await generateTripInspirationProposal(input);
      if (requestRef.current !== requestId) return;
      if (generated.days.length === 0) {
        setProposal(null);
        setError('AI 這次沒有排出可用的行程，請再試一次。你的選擇已保留。');
        return;
      }
      setProposal(generated);
    } catch (caught) {
      if (requestRef.current !== requestId) return;
      setProposal(null);
      if (caught instanceof ItineraryProposalRequestError) {
        const detail = [caught.provider, caught.model, caught.status ? `HTTP ${caught.status}` : ''].filter(Boolean).join(' · ');
        setError(detail ? `${caught.message}（${detail}）` : caught.message);
      } else {
        setError('AI 行程提案服務暫時無法使用，你的選擇已保留。');
      }
    } finally {
      if (requestRef.current === requestId) setIsGenerating(false);
    }
  };

  /**
   * Writes the proposal currently on screen — never an earlier one, because the
   * state only ever holds the latest generate. A failed write leaves the proposal,
   * the selection and the preferences exactly where they were so the user can retry.
   */
  const writeProposal = async (mode: ItineraryAcceptanceMode) => {
    if (!proposal || isAccepting) return;
    setIsMergeChoiceOpen(false);
    setIsAccepting(true);
    try {
      // Acceptance now resolves AI-suggested places first, so it is async. The
      // proposal is captured here rather than re-read afterwards.
      const result = await onAcceptProposal(proposal, mode);
      if (!result.ok) {
        setAcceptError(result.error || '寫入行程失敗，請再試一次。你的提案與偏好都還在。');
        return;
      }
      setAcceptError(null);
      setAcceptedSummary({ addedCount: result.addedCount || 0, skippedDuplicateCount: result.skippedDuplicateCount || 0 });
      // The proposal has become the official itinerary; leaving it up would show the
      // same days twice and invite a second write.
      setProposal(null);
      onProposalAccepted();
    } catch {
      setAcceptError('寫入行程失敗，請再試一次。你的提案與偏好都還在。');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleAccept = () => {
    if (!proposal) return;
    if (hasExistingItinerary) {
      setAcceptError('目前已有正式行程，請改用上方的「AI 行程調整」來調整既有安排。');
      return;
    }
    void writeProposal('append');
  };

  /**
   * Asks the AI to adjust the plan that already exists. Produces a diff and
   * nothing more — the official itinerary is untouched until the user confirms.
   */
  const handleGenerateAdjustment = async () => {
    if (!adjustmentMode || isAdjusting || !hasExistingItinerary) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setIsAdjusting(true);
    setAdjustmentError(null);
    setAppliedSummary(null);
    setForwardedCount(0);
    try {
      const input = buildItineraryAdjustmentInput(
        buildTripPlanningInput(trip, buildTripPlanningSelection(groups, selected), planningPreferences, existingItinerary),
        adjustmentMode,
        existingItinerary,
      );
      const generated = await generateItineraryAdjustment(input);
      if (requestRef.current !== requestId) return;
      if (generated.changes.length === 0) {
        setAdjustment(null);
        setAdjustmentError(generated.warnings[0] || 'AI 這次沒有提出可套用的調整，你的行程沒有被更動。請調整說明後再試一次。');
        return;
      }
      // Founder decision: an `add` suggestion belongs in the itinerary itself,
      // shown green and accepted by ticking it. Only the changes that alter an
      // existing item — move / update / remove — stay in this panel, because
      // they have no card of their own to become.
      const forwarded = onProposeToItinerary
        ? generated.changes.filter(change => change.type === 'add' && change.proposedItem)
        : [];
      const remaining = onProposeToItinerary
        ? generated.changes.filter(change => !(change.type === 'add' && change.proposedItem))
        : generated.changes;

      if (forwarded.length > 0) onProposeToItinerary!({ ...generated, changes: forwarded });
      setForwardedCount(forwarded.length);
      setAdjustment(remaining.length > 0 ? { ...generated, changes: remaining } : null);
      setPlacePreviews(new Map());

      // The same query and the same safety check the apply step runs, so the
      // card cannot promise something acceptance will not deliver.
      const names = remaining
        .filter(change => change.type === 'add' && change.proposedItem?.placeName)
        .map(change => change.proposedItem!.placeName);
      if (names.length > 0) {
        void previewPlaceResolution(names, {
          destination: trip.destination,
          destinationCountry: trip.destinationCountry,
          destinationLatitude: trip.destinationLatitude,
          destinationLongitude: trip.destinationLongitude,
        }).then(previews => {
          if (requestRef.current === requestId) setPlacePreviews(previews);
        }).catch(() => undefined);
      }
    } catch (caught) {
      if (requestRef.current !== requestId) return;
      // The current itinerary, the chosen mode, the typed text and the saved
      // inspiration selection are all deliberately left exactly as they were.
      setAdjustment(null);
      if (caught instanceof ItineraryAdjustmentRequestError) {
        const detail = [caught.provider, caught.model, caught.status ? `HTTP ${caught.status}` : ''].filter(Boolean).join(' · ');
        setAdjustmentError(detail ? `${caught.message}（${detail}）` : caught.message);
      } else {
        setAdjustmentError('AI 行程調整服務暫時無法使用，你目前的行程沒有被更動。');
      }
    } finally {
      if (requestRef.current === requestId) setIsAdjusting(false);
    }
  };

  const handleApplyAdjustment = async () => {
    if (!adjustment || isApplying) return;
    setIsApplying(true);
    try {
      const result = await onApplyAdjustment(adjustment);
      if (!result.ok) {
        // A failed apply must not look even partly successful: the diff stays up.
        setAdjustmentError(result.error || '套用調整失敗，你的行程沒有被更動，請再試一次。');
        return;
      }
      setAdjustmentError(null);
      setAppliedSummary(result);
      setAdjustment(null);
      onProposalAccepted();
    } catch {
      setAdjustmentError('套用調整失敗，你的行程沒有被更動，請再試一次。');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-black text-[#11183d]"><Compass size={18} className="text-violet-600" />你儲存的旅行靈感</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">從之前收藏的景點與旅行筆記加入這趟旅程</p>
        </div>
        {/* Already-planned places cannot be selected, so they are out of the tally too. */}
        {selectableCount > 0 && <span className="shrink-0 rounded-xl bg-violet-50 px-2.5 py-1 text-[11px] font-black text-violet-600">已選 {selected.length} / {selectableCount}</span>}
      </div>

      {groups.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-5 text-center">
          <p className="text-sm font-bold text-slate-500">目前沒有這個目的地的收藏靈感</p>
          <button type="button" onClick={onExploreCommunity} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 text-sm font-black text-violet-600">
            前往社群找靈感<ArrowRight size={15} />
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {groups.map(group => {
            const isPlanned = plannedGroupIds.has(group.id);
            const isSelected = !isPlanned && selected.includes(group.id);
            return (
              <div key={group.id} data-testid={`inspiration-card-${group.id}`} className={`rounded-2xl border transition ${isPlanned ? 'border-slate-100 bg-slate-50' : isSelected ? 'border-violet-300 bg-violet-50/50' : 'border-slate-100 bg-white'}`}>
                <div className="flex items-start">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  aria-disabled={isPlanned}
                  onClick={() => toggleGroup(group.id)}
                  className={`flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left ${isPlanned ? 'cursor-default' : ''}`}
                >
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${isPlanned ? 'border-slate-200 bg-slate-100 text-slate-300' : isSelected ? 'border-violet-500 bg-violet-600 text-white' : 'border-slate-300 bg-white'}`}>
                    {isPlanned ? <Check size={13} strokeWidth={3} /> : isSelected && <Check size={13} strokeWidth={3} />}
                  </span>
                  {/* Only the identifying row is muted; the notes below stay readable. */}
                  <span className={`min-w-0 flex-1 ${isPlanned ? 'opacity-55' : ''}`}>
                    <span className="flex items-start justify-between gap-2">
                      <span className="block min-w-0 flex-1 truncate text-sm font-black text-[#11183d]">{group.placeName}</span>
                      {isPlanned && (
                        <span className="shrink-0 rounded-lg bg-slate-200/80 px-2 py-0.5 text-[10px] font-black text-slate-600">已在行程中</span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400"><MapPin size={11} />{[group.city, group.country].filter(Boolean).join('・')}</span>
                    {!isPlanned && group.missingPlaceIdentity && (
                      <span className="mt-1.5 flex items-start gap-1.5 text-[11px] font-bold text-amber-600"><AlertTriangle size={12} className="mt-0.5 shrink-0" />尚未取得地點座標，AI 規劃時再解析</span>
                    )}
                  </span>
                </button>
                {onRemoveInspirations && (
                  <button
                    type="button"
                    data-testid={`remove-inspiration-${group.id}`}
                    aria-label={`從收藏移除 ${group.placeName}`}
                    onClick={() => setRemovingGroupId(current => (current === group.id ? null : group.id))}
                    className="flex min-h-11 w-11 shrink-0 items-center justify-center text-slate-300 transition hover:text-rose-500"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
                </div>
                {onRemoveInspirations && removingGroupId === group.id && (
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-3 py-2.5">
                    {/*
                      Says what goes, because a place carries its notes with it
                      and the count is the part that is easy to forget.
                    */}
                    <span className="mr-auto text-[11px] font-bold text-slate-500">
                      {group.experienceNotes.length > 0
                        ? `移除「${group.placeName}」和它的 ${group.experienceNotes.length} 項重點？`
                        : `移除「${group.placeName}」？`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRemovingGroupId(null)}
                      className="min-h-9 rounded-xl px-3 text-xs font-black text-slate-500"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      data-testid={`confirm-remove-inspiration-${group.id}`}
                      onClick={() => {
                        onRemoveInspirations(group.inspirationIds);
                        setRemovingGroupId(null);
                        // A place that is gone must not stay in the shortlist,
                        // or the next plan would be built around nothing.
                        onSelectionChange(selected.filter(id => id !== group.id));
                      }}
                      className="min-h-9 rounded-xl bg-rose-500 px-3 text-xs font-black text-white"
                    >
                      移除
                    </button>
                  </div>
                )}
                {isPlanned && plannedNoticeGroupId === group.id && (
                  <p className="px-3 pb-2.5 pl-11 text-[11px] leading-5 text-slate-500">此景點已經存在行程中。</p>
                )}
                {group.experienceNotes.length > 0 && (() => {
                  /*
                    「已收藏的也要列重點」, and only the points.

                    Every note of every place, all expanded, turns a list of
                    twelve restaurants into a page nobody scrolls. Three is what
                    the itinerary card shows for the same reason; the rest is one
                    tap away.
                  */
                  const notesExpanded = expandedNoteGroupIds.includes(group.id);
                  const visibleNotes = notesExpanded ? group.experienceNotes : group.experienceNotes.slice(0, 3);
                  const hiddenNotes = group.experienceNotes.length - visibleNotes.length;
                  return (
                  <div className="space-y-1.5 px-3 pb-3 pl-11">
                    <div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">重點</div>
                    {visibleNotes.map(note => {
                      const sourcePost = communityPosts.find(post => post.id === note.sourcePostId);
                      const author = sourcePost ? { name: sourcePost.authorName, avatar: sourcePost.authorAvatar } : creatorById.get(note.sourceCreatorId);
                      return (
                        <div key={note.id} className="flex min-w-0 items-start gap-1.5 rounded-lg bg-violet-50/75 px-2 py-1.5 text-xs leading-5 text-slate-700">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                          <p className="min-w-0 flex-1 break-words">
                            {NOTE_TYPE_LABELS[note.type] && <span className="mr-1.5 rounded bg-white px-1.5 py-0.5 text-[10px] font-black text-violet-600">{NOTE_TYPE_LABELS[note.type]}</span>}
                            {note.text}
                          </p>
                          {/*
                            Credit only where somebody wrote it.

                            A note read off the traveller's own screenshot has no
                            author, and labelling it 「原作者」 credits a person who
                            does not exist for words nobody signed.
                          */}
                          {!note.sourcePostId.startsWith('screenshot:') && (
                            <span className="ml-1 inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-slate-500">
                              <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-white text-[9px] text-violet-600">
                                {author?.avatar ? <img src={author.avatar} alt="" className="h-full w-full object-cover" /> : '旅'}
                              </span>
                              {author?.name || '原作者'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {(hiddenNotes > 0 || notesExpanded) && (
                      <button
                        type="button"
                        data-testid={`toggle-notes-${group.id}`}
                        onClick={() => setExpandedNoteGroupIds(current =>
                          notesExpanded ? current.filter(id => id !== group.id) : [...current, group.id])}
                        className="text-[11px] font-black text-violet-600"
                      >
                        {notesExpanded ? '收起' : `還有 ${hiddenNotes} 項重點`}
                      </button>
                    )}
                  </div>
                  );
                })()}
              </div>
            );
          })}

          {!hasExistingItinerary && (
            <>
              <div className="mt-3">
                <label htmlFor="trip-planning-preferences" className="block text-xs font-black text-slate-600">
                  告訴 AI 你想怎麼玩<span className="ml-1.5 font-bold text-slate-400">選填</span>
                </label>
                <textarea
                  id="trip-planning-preferences"
                  rows={3}
                  value={planningPreferences}
                  onChange={event => setPlanningPreferences(event.target.value)}
                  maxLength={500}
                  placeholder="例如：釜山輕旅行。每天 11 點後再出門，想安排汗蒸幕，有租車，不想把行程排太滿。"
                  className="mt-1.5 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm leading-6 text-[#11183d] outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:bg-white"
                />
              </div>

              <button type="button" disabled={selected.length === 0 || isGenerating} onClick={handleGenerate} className="mt-2.5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 text-sm font-black text-white shadow-lg shadow-violet-500/20 transition disabled:cursor-not-allowed disabled:opacity-40">
                <Sparkles size={16} />{isGenerating ? 'AI 正在排行程…' : `AI 幫我排行程（${selected.length}）`}
              </button>

              {/*
                The same places, placed by hand.

                「目前要將這些筆記加入行程只能用 AI 也要有可以手動更新選後輸入的
                選項」 — picking three places and a day is a decision already made.
                Sending it through a model that re-orders the day, invents times
                and may drop one of them answers a question nobody asked.
              */}
              {onAddItineraryItems && tripDates.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-bold text-slate-500">
                    加到
                    <select
                      aria-label="直接加入哪一天"
                      value={manualAddDate}
                      onChange={event => setManualAddDate(event.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-[#e4e2f2] bg-white px-2 py-2 text-[11px] font-black text-[#11183d]"
                    >
                      <option value="">先不指定日期</option>
                      {tripDates.map((date, index) => (
                        <option key={date} value={date}>
                          Day {index + 1}・{date.slice(5).replace('-', '/')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    data-testid="manual-add-selected"
                    disabled={selected.length === 0}
                    onClick={() => {
                      const items = selectedInspirationsToItineraryItems(
                        groups,
                        selected,
                        () => `insp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                        manualAddDate || undefined,
                      );
                      if (items.length === 0) return;
                      onAddItineraryItems(items);
                      setManualAddedCount(items.length);
                      onSelectionChange([]);
                    }}
                    className="min-h-11 shrink-0 rounded-2xl border border-[#d9d5f5] bg-white px-3 text-xs font-black text-[#5b3df5] disabled:opacity-40"
                  >
                    直接加入（{selected.length}）
                  </button>
                </div>
              )}
              {manualAddedCount > 0 && (
                <p data-testid="manual-add-done" className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-bold leading-5 text-emerald-700">
                  已加入 {manualAddedCount} 個地點，筆記也一起帶過去了。到時間軸調整時間與順序。
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/*
        The trip already has a plan, so the AI is never asked to start from
        scratch. It reads the current itinerary and proposes a diff instead.
      */}
      {hasExistingItinerary && (
        <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
          <h3 className="flex items-center gap-2 font-black text-[#11183d]"><Wand2 size={17} className="text-violet-600" />AI 行程調整模式</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">你目前已經有行程安排了，這次想怎麼調整？</p>

          {/* Read back before asking. Choosing a mode is a decision about days
              that are blank, and the traveller could not see which those were. */}
          {itineraryReadBack && (
            <div className="mt-3 rounded-2xl bg-white/80 p-3.5 ring-1 ring-violet-100">
              <p className="text-[11px] font-black text-slate-500">AI 讀到的目前行程</p>
              <ul className="mt-1.5 space-y-1 text-[12px] leading-5 text-slate-600">
                <li>
                  <span className="font-black text-[#11183d]">{itineraryReadBack.anchorCount}</span> 個固定項目（航班、住宿等），不會被更動
                </li>
                <li>
                  <span className="font-black text-[#11183d]">{itineraryReadBack.plannedCount}</span> 個你自己安排的行程
                </li>
                <li>
                  {itineraryReadBack.unplannedDates.length === 0 ? (
                    '每一天都已經有安排了。'
                  ) : (
                    <>
                      <span className="font-black text-amber-600">
                        {itineraryReadBack.unplannedDates.length} 天
                      </span>
                      還是空的：{itineraryReadBack.unplannedDates.map(date => formatDayHeading(date)).join('、')}
                    </>
                  )}
                </li>
              </ul>
            </div>
          )}

          {/*
            A screenshot is a plan too.

            「這邊加一個可以上傳截圖的區塊」 — above the four AI modes, because
            moving something the traveller already decided on is a different
            job from asking the AI to decide. This one needs no model opinion
            about their trip, only a reading of what they saved.
          */}
          {onAddItineraryItems && (
            <div className="mt-3">
              <ScreenshotItineraryIntake
                dates={tripDates}
                defaultDate={tripDates[0]}
                destination={trip.destination}
                destinationCountry={trip.destinationCountry || trip.travelCountry}
                onAddItems={onAddItineraryItems}
                onSaveToCollection={onSaveScreenshotPlaces}
              />
            </div>
          )}

          <div className="mt-3 space-y-2">
            {ADJUSTMENT_MODES.map(option => {
              const isActive = adjustmentMode === option.mode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => {
                    // Switching intent invalidates any diff produced for the old one.
                    setAdjustmentMode(option.mode);
                    setAdjustment(null);
                    setAdjustmentError(null);
                    setAppliedSummary(null);
                  }}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition ${isActive ? 'border-violet-400 bg-white shadow-[0_6px_16px_rgba(91,61,245,.10)]' : 'border-violet-100 bg-white/70'}`}
                >
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isActive ? 'border-violet-500 bg-violet-600 text-white' : 'border-slate-300 bg-white'}`}>
                    {isActive && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black text-[#11183d]">{option.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-5 text-slate-500">{option.subtitle}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            <label htmlFor="trip-adjustment-preferences" className="block text-xs font-black text-slate-600">
              告訴 AI 你想怎麼調整<span className="ml-1.5 font-bold text-slate-400">選填</span>
            </label>
            <textarea
              id="trip-adjustment-preferences"
              rows={3}
              value={planningPreferences}
              onChange={event => setPlanningPreferences(event.target.value)}
              maxLength={500}
              placeholder="例如：想加一個汗蒸幕，但不要刪掉甘川文化村。每天11點後再出門。"
              className="mt-1.5 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-6 text-[#11183d] outline-none transition placeholder:text-slate-400 focus:border-violet-300"
            />
          </div>

          <button type="button" disabled={!adjustmentMode || isAdjusting || isApplying} onClick={handleGenerateAdjustment} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 text-sm font-black text-white shadow-lg shadow-violet-500/20 transition disabled:cursor-not-allowed disabled:opacity-40">
            <Sparkles size={16} />{isAdjusting ? 'AI 正在讀你的行程…' : 'AI 幫我調整行程'}
          </button>

          <p className="mt-2 text-[11px] leading-5 text-slate-400">你確認之前不會更動任何安排。</p>

          {adjustmentError && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-slate-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <span className="min-w-0 flex-1 break-words">{adjustmentError}</span>
            </div>
          )}

          {forwardedCount > 0 && (
            <div data-testid="forwarded-suggestion-notice" className="mt-3 flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1 break-words">
                已把 {forwardedCount} 個 AI 建議放進上方行程表，打勾就會加入正式行程。
              </span>
            </div>
          )}

          {appliedSummary && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1 break-words">
                已套用調整：新增 {appliedSummary.addedCount || 0}、調整時間 {appliedSummary.movedCount || 0}、更新 {appliedSummary.updatedCount || 0}、移除 {appliedSummary.removedCount || 0}。
              </span>
            </div>
          )}

          {Boolean(appliedSummary?.pinnedConflictCount) && (
            <div
              data-testid="pinned-conflict-notice"
              className="mt-2 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1 break-words">{PINNED_CONFLICT_WARNING}</span>
            </div>
          )}

          {adjustment && (
            <div className="mt-4 rounded-2xl border border-violet-200 bg-white p-4">
              <h4 className="flex items-center gap-2 font-black text-[#11183d]"><CalendarDays size={16} className="text-violet-600" />AI 建議調整</h4>
              {adjustment.summary && <p className="mt-1.5 text-xs leading-5 text-slate-500">{adjustment.summary}</p>}

              <div className="mt-3 space-y-2.5">
                {adjustment.changes.map((change, index) => {
                  const existing = change.existingItemId ? existingById.get(change.existingItemId) : undefined;
                  const name = change.type === 'add'
                    ? change.proposedItem?.placeName
                    : (existing?.location || existing?.title || '這個項目');
                  const key = `${change.type}-${change.existingItemId || change.proposedItem?.id || index}`;

                  if (change.type === 'remove') {
                    return (
                      <div key={key} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-sm font-black text-rose-700">
                          <Trash2 size={13} className="shrink-0" />－ 移除：{name}
                        </div>
                        <div className="mt-1 text-[11px] leading-5 text-rose-600">
                          原本：{formatDayHeading(change.fromDate)} {change.fromTime || '未指定時間'}
                        </div>
                        {change.reason && <div className="mt-1 text-[11px] leading-5 text-slate-500">原因：{change.reason}</div>}
                      </div>
                    );
                  }

                  if (change.type === 'add') {
                    return (
                      <div key={key} className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5 text-sm font-black text-emerald-800">
                          <Plus size={13} className="shrink-0" />
                          {change.toTime || change.proposedItem?.suggestedStartTime || '時間待定'} {name}
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${change.proposedItem?.source === 'saved_inspiration' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                            {change.proposedItem?.source === 'saved_inspiration' ? '收藏靈感' : 'AI 建議'}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] leading-5 text-emerald-700">加到：{formatDayHeading(change.toDate)}</div>
                        {/*
                          Whether this name is a place. A suggestion built from
                          a social handle is a name no map has, and it looked
                          exactly like one pinned to a real address until after
                          it had been accepted.
                        */}
                        {(() => {
                          const preview = placePreviews.get((change.proposedItem?.placeName || '').trim());
                          if (preview?.resolved) {
                            return (
                              <div className="mt-1 flex items-start gap-1 text-[11px] leading-5 text-slate-500">
                                <MapPin size={12} className="mt-0.5 shrink-0" />
                                <span>{preview.resolved.address || preview.resolved.resolvedPlaceName}</span>
                              </div>
                            );
                          }
                          if (preview?.rejection) {
                            return (
                              <div className="mt-1 text-[11px] leading-5 text-amber-700">
                                地圖上找不到這個地點，加進去會是一段文字，之後要自己補位置。
                              </div>
                            );
                          }
                          return null;
                        })()}
                        {change.reason && <div className="mt-1 text-[11px] leading-5 text-slate-500">原因：{change.reason}</div>}
                      </div>
                    );
                  }

                  return (
                    <div key={key} className="rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-black text-[#11183d]">
                        {change.type === 'move' ? <MoveRight size={13} className="shrink-0 text-violet-600" /> : <PencilLine size={13} className="shrink-0 text-violet-600" />}
                        {change.toTime || change.fromTime || ''} {name}
                      </div>
                      <div className="mt-1 text-[11px] leading-5 text-slate-500">
                        原本：{formatDayHeading(change.fromDate)} {change.fromTime || '未指定時間'}
                        {(change.toDate || change.toTime) && <> → 改為：{formatDayHeading(change.toDate || change.fromDate)} {change.toTime || change.fromTime || '未指定時間'}</>}
                      </div>
                      {change.updatedDurationMinutes !== undefined && <div className="mt-1 text-[11px] leading-5 text-slate-500">停留時間：{change.updatedDurationMinutes} 分</div>}
                      {change.updatedNote !== undefined && <div className="mt-1 text-[11px] leading-5 text-slate-500">備註：{change.updatedNote}</div>}
                      {change.reason && <div className="mt-1 text-[11px] leading-5 text-slate-500">原因：{change.reason}</div>}
                    </div>
                  );
                })}
              </div>

              {adjustment.warnings.length > 0 && (
                <div className="mt-3 space-y-1 rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-700">
                  {adjustment.warnings.map(warning => <div key={warning}>⚠ {warning}</div>)}
                </div>
              )}

              <p className="mt-3 text-[11px] leading-5 text-slate-400">這些調整還沒有寫進正式行程。</p>

              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => { setAdjustment(null); setAdjustmentError(null); }} disabled={isApplying} className="flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 transition disabled:opacity-40">
                  取消
                </button>
                <button type="button" onClick={handleApplyAdjustment} disabled={isApplying} className="flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-3 text-sm font-black text-white shadow-lg shadow-violet-500/20 transition disabled:opacity-40">
                  {isApplying ? '正在套用…' : '套用這些調整'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-slate-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1 break-words">{error}</span>
        </div>
      )}

      {proposal && (
        <div className="mt-4 rounded-2xl border border-violet-100 bg-gradient-to-br from-white to-violet-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-black text-[#11183d]"><CalendarDays size={17} className="text-violet-600" />AI 行程提案</h3>
          </div>

          <div className="mt-3 space-y-3">
            {proposal.days.map((day, dayIndex) => (
              <div key={day.date} className="rounded-2xl bg-white p-3 shadow-[0_4px_12px_rgba(17,26,74,.04)]">
                <div className="text-xs font-black text-violet-700">{formatDayLabel(day.date, dayIndex)}</div>
                <div className="mt-2 space-y-2">
                  {day.items.map(item => (
                    <div key={item.id} className="flex items-start gap-2.5">
                      <span className="mt-0.5 w-12 shrink-0 text-xs font-black text-[#11183d]">{item.suggestedStartTime || '—'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <b className="text-sm font-black text-[#11183d]">{item.placeName}</b>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${item.source === 'saved_inspiration' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                            {item.source === 'saved_inspiration' ? '收藏靈感' : 'AI 建議'}
                          </span>
                          {item.durationMinutes && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400"><Clock3 size={10} />{item.durationMinutes} 分</span>}
                        </span>
                        {item.note && <span className="mt-1 block text-[11px] leading-5 text-slate-500">{item.note}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {proposal.warnings.length > 0 && (
            <div className="mt-3 space-y-1 rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-700">
              {proposal.warnings.map(warning => <div key={warning}>⚠ {warning}</div>)}
            </div>
          )}

          <p className="mt-3 text-[11px] leading-5 text-slate-400">接受後會寫進這趟旅程的正式行程，並保存在此裝置。</p>

          {acceptError && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-slate-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <span className="min-w-0 flex-1 break-words">{acceptError}</span>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <button type="button" onClick={handleGenerate} disabled={isGenerating || isAccepting} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-violet-200 bg-white px-3 text-sm font-black text-violet-600 transition disabled:opacity-40">
              <RotateCcw size={14} />重新產生
            </button>
            <button type="button" onClick={handleAccept} disabled={isGenerating || isAccepting} className="flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-3 text-sm font-black text-white shadow-lg shadow-violet-500/20 transition disabled:opacity-40">
              {isAccepting ? '正在整理地點…' : '接受這份行程'}
            </button>
          </div>
        </div>
      )}

      {/*
        Shown after the proposal itself is gone: it has become the official
        itinerary, so the preview is torn down and only the outcome remains.
      */}
      {!proposal && acceptedSummary && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1 break-words">已寫入正式行程 {acceptedSummary.addedCount} 個項目。</span>
        </div>
      )}

      {!proposal && acceptError && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-slate-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1 break-words">{acceptError}</span>
        </div>
      )}
    </section>
  );
};

export default TripInspirationPlanner;
