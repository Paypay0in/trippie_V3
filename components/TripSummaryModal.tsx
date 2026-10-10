
import { OVERLAY } from '../constants/layers';
import React, { useMemo, useState } from 'react';
import { isRefundableCategory } from '../services/refundableCategories';
import { creditedRefundTwd, findDuplicateRefund, isRefundEntry } from '../services/refundSettlement';
import { refundClaimableBy } from '../services/refundClaimant';
import { sharedWithSomebody } from '../services/refundSharedNote';
import { Expense, Category, PaymentMethod, Phase, TaxRule } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { expenseCostToViewer } from '../services/viewerSpend';
import { calculateExpenseLedger } from '../services/splitCalculator';
import { partitionByConcern } from '../services/expenseConcernsMember';
import { X, Trophy, Wallet, Receipt, CreditCard, Printer, Archive, Save, List, PieChart as PieIcon, Tag, CheckCircle, HandHelping, Calculator, CheckSquare, Square, Share, MousePointerClick, Percent, ChevronDown } from 'lucide-react';

interface Props {
  expenses: Expense[];
  onClose?: () => void;
  onArchive: (name: string, total: number) => void;
  taxRule?: TaxRule | null;
  variant?: 'modal' | 'embedded';
  /**
   * Who is reading the report, and who owns the trip.
   *
   * 「這個總結算並不是他的總額啊」 — the report had no notion of a reader at all.
   * It summed the whole trip and called it 「您的旅費總分析」, so the second
   * traveller's own report opened on 33,388 she had not spent.
   */
  viewerMemberId?: string;
  ownerMemberId?: string;
  initialTripName?: string;
  allowArchive?: boolean;
  /**
   * Opens one bill from the category breakdown.
   *
   * 「點擊可以打開該帳」 — the breakdown is where a figure gets questioned, and
   * until now the only way to act on a line in it was to close the report,
   * find the ledger, and scroll to the day. Optional: a report rendered
   * without a way to open a bill still lists them.
   */
  onOpenExpense?: (expense: Expense) => void;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#06b6d4', '#84cc16'];

const TripSummaryModal: React.FC<Props> = ({ expenses, onClose, onArchive, taxRule, variant = 'modal', initialTripName = '', allowArchive = true, viewerMemberId, ownerMemberId, onOpenExpense }) => {
  /** The bill behind a line of the breakdown, for opening it. */
  const expenseById = React.useMemo(
    () => new Map(expenses.map(expense => [expense.id, expense])),
    [expenses],
  );
  /** What this reader is actually responsible for, out of the trip's total. */
  const viewerShare = React.useMemo(() => {
    if (!viewerMemberId) return undefined;
    // One rule, shared with the ledger list and the dashboard. Computed here
    // separately, this dropped the reader's own unsplit spending: a bill with
    // no sharers has an empty responsibility map, which read as zero.
    return expenses.reduce((sum, expense) =>
      sum + expenseCostToViewer(expense, viewerMemberId, ownerMemberId), 0);
  }, [expenses, viewerMemberId, ownerMemberId]);
  /**
   * Money that actually left this traveller's pocket.
   *
   * Distinct from both the bills that concern them and the share they bear:
   * fronting 32,500 for a trip costing you 16,500 is the whole reason the
   * other traveller owes you 16,000, and no other figure says it.
   */
  const frontedByViewer = React.useMemo(() => {
    if (!viewerMemberId) return undefined;
    return expenses.reduce((sum, expense) => {
      const { paid } = calculateExpenseLedger(expense, ownerMemberId);
      return sum + (paid[viewerMemberId] || 0);
    }, 0);
  }, [expenses, viewerMemberId, ownerMemberId]);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [tripName, setTripName] = useState(initialTripName);

  // Bill Generation State
  /** Which category row is open, so its bills can be read. */
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [showBillPreview, setShowBillPreview] = useState(false);
  const [handlingFeePercent, setHandlingFeePercent] = useState<string>('0');

  /**
     What this report is about, which is this reader's money.

     Only the headline figure had learned to ask who was looking; the lists,
     the chart and the per-phase subtotals below it still summed the whole
     trip, so 「哈哈❤️ $888」 — the other traveller's own spending — appeared in
     his 準備清單 and in his pie, under a subtotal of 33,388.
  */
  /** This reader's share of one bill — the same rule every other screen uses. */
  const shareOfExpense = React.useCallback(
    (expense: Expense): number => expenseCostToViewer(expense, viewerMemberId, ownerMemberId),
    [viewerMemberId, ownerMemberId],
  );

  const reportExpenses = React.useMemo(
    () => (viewerMemberId ? partitionByConcern(expenses, viewerMemberId).mine : expenses),
    [expenses, viewerMemberId],
  );

  const { 
    totalExpense, 
    creditCardBill, 
    walletResidue, 
    preExpenses,
    postExpenses,
    duringCategoryStats,
    duringTotal,
    refundInfo,
    hasRefundRecord,
    creditedRefund,
    chartData,
    helpBuyList,
    totalHelpBuyTwd
  } = useMemo(() => {
    // 0. Pre-check for Refund Record
    /*
      Found by being a refund, not by which stage it landed in. The stage comes
      from the date now, so one collected at the till mid-trip is filed 旅行中
      and a check keyed on 返程 stops seeing it.
    */
    const recordedRefund = findDuplicateRefund(reportExpenses);
    const hasRefund = Boolean(recordedRefund);

    let total = 0;
    let ccBill = 0;
    const wallet: Record<string, { in: number; out: number; costBasis: number }> = {};

    // For breakdown lists
    const preList: { id: string; date: string; desc: string; amount: number; cat: string }[] = [];
    const postList: { id: string; date: string; desc: string; amount: number; cat: string }[] = [];
    // Help Buy List now includes refundDeduction
    const helpBuy: { id: string; date: string; desc: string; amount: number; currency: string; foreignAmount: number; refundDeduction?: number }[] = [];
    const duringCatMap: Record<string, number> = {};
    /*
      The bills behind each category.

      「這個購物寫了我花了8000多 我怎麼完全找不到這樣的總額」. The row was a correct
      number with nothing underneath it: a share of each bill, summed across
      every day of the trip, and no screen anywhere lists that. A total nobody
      can trace is a total nobody can believe — and the one thing worth knowing
      about 購物 $8,579 is which purchases are in it.
    */
    const duringCatItems: Record<string, Array<{ id: string; date: string; desc: string; amount: number; full: number; currency: string; foreignAmount: number }>> = {};
    let duringSum = 0;
    let helpBuySum = 0;

    // For Total Chart (All phases)
    const allCategoryMap: Record<string, number> = {};

    // Refund Logic
    /** `shared` marks a row that is this reader's portion of a split receipt. */
    const refundItems: { date: string; desc: string; spend: number; refund: number; currency: string; shared?: boolean }[] = [];
    let totalRefundTwd = 0;

    reportExpenses.forEach(e => {
      // 1. Calculate Expenses (Real Cost)
      /*
        What the bill cost this reader, not what the bill was.

        「總結算頁面又讓 Gina 的帳也加在我的上面 分帳的應該被扣掉」: the list
        carried 機票 $12,500 and 住宿 $20,000 in full and subtotalled 33,726,
        money he had fronted rather than money he spent. Half of each is hers.
      */
      let realCost = 0;
      if (e.category === Category.EXCHANGE) {
        realCost = e.handlingFee || 0; 
      } else {
        realCost = shareOfExpense(e);
      }

      /*
        What a counter will actually refund.

        「餐飲不能退稅啊」. This read 「regardless of category」 and meant it: a
        brunch, a taxi to the hotel, a perm and a fortune telling all sat in the
        refund list because they were bought in won, mid-trip, over the
        threshold. Korea refunds goods from tax-free registered shops, so the
        number the traveller was about to queue at the airport for counted meals
        and services it was never going to get back.

        isRefundableCategory is the rule the rest of the app already uses; this
        screen simply was not asking it. Two things the traveller has said
        themselves are honoured too: a purchase marked 不可退稅, and one already
        refunded at the till, which cannot be claimed a second time.
      */
      /*
        And claimable by the reader.

        「這是 Gina 的帳 這筆有部分是我的 所以這樣 但不應在這」. The list is drawn
        from everything that concerns the reader, and a bill someone else paid
        concerns you the moment you are split in on it — so her 藥品 turned up
        on his recap offering him money that will be handed to whoever carries
        that receipt to the desk. Sharing a cost and being able to claim its
        tax back are different facts; the second follows the receipt.
      */
      const isEligibleForRefund = taxRule &&
                                  taxRule.refundRate > 0 &&
                                  e.phase === 'during' &&
                                  e.currency === taxRule.currency &&
                                  e.amount >= taxRule.minSpend &&
                                  isRefundableCategory(e.category) &&
                                  !e.taxRefundIneligible &&
                                  !e.taxRefundedAtPurchase &&
                                  refundClaimableBy(e, viewerMemberId, ownerMemberId);

      // Add to Refund List if eligible
      if (isEligibleForRefund && taxRule) {
          /*
            The whole receipt, because the whole receipt is what the counter
            pays out: 「退稅的行為人依然是付總額的人」.

            A sharer's portion of it is not listed anywhere here. It reaches
            them as a smaller bill at settlement instead — a refund recorded
            against a purchase comes off that purchase before it is split.
          */
          const refundForeign = e.amount * taxRule.refundRate;
          const refundTWD = refundForeign * e.exchangeRate;

          refundItems.push({
              date: e.date,
              desc: e.description,
              spend: e.amount,
              refund: refundForeign,
              currency: e.currency,
              shared: sharedWithSomebody(e, viewerMemberId, ownerMemberId)
          });
          totalRefundTwd += refundTWD;
      }

      // *** LOGIC CHANGE ***
      // Exclude HELP_BUY from Total Expense and Chart
      if (e.category === Category.HELP_BUY) {
          let itemCost = realCost;
          let refundVal = 0;

          if (isEligibleForRefund && taxRule) {
              const refundForeign = e.amount * taxRule.refundRate;
              const refundTWD = refundForeign * e.exchangeRate;
              
              // Only deduct IF refund record exists
              if (hasRefund) {
                  refundVal = refundTWD;
                  itemCost -= refundTWD; // Net cost
              }
          }

          helpBuy.push({ 
              id: e.id,
              date: e.date, 
              desc: e.description, 
              amount: itemCost, // Net receivable
              currency: e.currency,
              foreignAmount: e.amount,
              refundDeduction: refundVal // 0 if not refunded yet
          });
          helpBuySum += itemCost;
      } else {
          // Standard Expense
          total += realCost;

          // Accumulate for Chart (Only positive spending)
          if (realCost > 0) {
            allCategoryMap[e.category] = (allCategoryMap[e.category] || 0) + realCost;
          }

          /*
            A bill this traveller paid nothing towards is not their spending.

            「這個根本不是我的帳」「我只是代墊」. Gina's fortune telling was fronted
            by him and split to her alone, so his share is zero — and it still
            appeared in his own category breakdown, at $0, among the things he
            bought. The totals were never wrong, because zero adds nothing; the
            list was, because it read as his.

            Only exactly zero is dropped. A refund is negative and belongs here,
            and so does anything he carries a real share of, however small.
          */
          /*
            A refund is not spending and does not belong in a phase list.

            「只要在結算的時候放入這 recap 就好」 — it still counts against the trip
            total above, which is the whole point of recording it; it just stops
            appearing among the purchases, where it read as a −70 TWD buy.
          */
          const isNotMySpending = realCost === 0 || isRefundEntry(e);

          // Breakdown Logic
          if (isNotMySpending) {
              // Counted nowhere, listed nowhere: already worth nothing to every
              // total above, and worth nothing to read.
          } else if (e.phase === 'pre') {
              preList.push({ id: e.id, date: e.date, desc: e.description, amount: realCost, cat: e.category });
          } else if (e.phase === 'post') {
              postList.push({ id: e.id, date: e.date, desc: e.description, amount: realCost, cat: e.category });
          } else if (e.phase === 'during') {
              duringCatMap[e.category] = (duringCatMap[e.category] || 0) + realCost;
              duringSum += realCost;
              (duringCatItems[e.category] ||= []).push({
                id: e.id,
                date: e.date,
                desc: e.description,
                amount: realCost,
                // Kept beside the share so a split bill explains itself: 「你的
                // 475」 is unrecognisable next to a receipt that says 950.
                full: e.twdAmount,
                currency: e.currency,
                foreignAmount: e.amount,
              });
          }
      }

      // 2. Calculate Credit Card Bill (Liability) - INCLUDES Help Buy (because I paid for it)
      if (e.paymentMethod === PaymentMethod.CREDIT_CARD) {
        ccBill += e.twdAmount;
      }

      // 3. Calculate Wallet Residue (Only Foreign Cash) - INCLUDES Help Buy
      if (e.currency !== 'TWD') {
        if (!wallet[e.currency]) wallet[e.currency] = { in: 0, out: 0, costBasis: 0 };
        
        if (e.category === Category.EXCHANGE) {
          wallet[e.currency].in += e.amount;
          wallet[e.currency].costBasis += e.twdAmount;
        } else if (e.paymentMethod === PaymentMethod.CASH_FOREIGN) {
          if (e.amount < 0) {
             wallet[e.currency].out += e.amount; 
          } else {
             wallet[e.currency].out += e.amount;
          }
        }
      }
    });

    // Process Wallet Data
    const residues = Object.entries(wallet)
      .map(([curr, data]) => {
        const remaining = data.in - data.out;
        if (remaining <= 0.1) return null; // Filter out near-zero
        const avgRate = data.in > 0 ? data.costBasis / data.in : 0;
        const value = remaining * avgRate;
        return { currency: curr, amount: remaining, valueTwd: value, avgRate };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Process During Stats
    const dStats = Object.entries(duringCatMap)
        .map(([cat, val]) => ({
          category: cat,
          amount: val,
          percentage: duringSum > 0 ? val/duringSum : 0,
          items: (duringCatItems[cat] || []).slice().sort((a, b) => b.amount - a.amount),
        }))
        .sort((a,b) => b.amount - a.amount);

    // Process Chart Data
    const chartData = Object.entries(allCategoryMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    return {
      totalExpense: total,
      creditCardBill: ccBill,
      walletResidue: residues,
      preExpenses: preList.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      postExpenses: postList.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      duringCategoryStats: dStats,
      duringTotal: duringSum,
      refundInfo: {
          totalTwd: totalRefundTwd,
          items: refundItems
      },
      hasRefundRecord: hasRefund,
      // What actually came back, and how. 「在機場後才退稅的 他會顯示退成現金或是
      // 退成信用卡」 — the two land in different places: a card refund reduces the
      // statement, cash increases what is in the wallet.
      creditedRefund: recordedRefund
        ? {
            twd: creditedRefundTwd(reportExpenses),
            foreign: Math.abs(recordedRefund.amount),
            currency: recordedRefund.currency,
            channel: recordedRefund.paymentMethod === PaymentMethod.CASH_FOREIGN
              ? '領取外幣現金'
              : '退到信用卡',
          }
        : null,
      chartData,
      helpBuyList: helpBuy.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      totalHelpBuyTwd: helpBuySum
    };
  }, [reportExpenses, taxRule, shareOfExpense]);

  const totalResidueValue = walletResidue.reduce((acc, curr) => acc + curr.valueTwd, 0);

  // Bill Selection Logic
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedItemIds(new Set()); // Reset selection
    setShowBillPreview(false);
    setHandlingFeePercent('3'); // Default to 3% when opening, as requested
  };

  const toggleItemSelection = (id: string) => {
      const newSet = new Set(selectedItemIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedItemIds(newSet);
  };

  const selectedBillItems = helpBuyList.filter(item => selectedItemIds.has(item.id));
  const selectedBillBase = selectedBillItems.reduce((sum, item) => sum + item.amount, 0);

  const feePercent = parseFloat(handlingFeePercent) || 0;
  const additionalFee = Math.round(selectedBillBase * (feePercent / 100));
  const finalBillTotal = selectedBillBase + additionalFee;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("請允許開啟彈跳視窗以列印報表");
        return;
    }
    
    const refundTitle = hasRefundRecord ? `退稅清單 (已入帳 - ${taxRule?.country})` : `預估退稅清單 (${taxRule?.country})`;

    const refundSection = refundInfo.items.length > 0 ? `
        <h2>${refundTitle}</h2>
        <table><thead><tr><th>日期</th><th>項目</th><th>消費金額</th><th class="right">預估退稅</th></tr></thead><tbody>
            ${refundInfo.items.map(e => `<tr><td>${e.date}</td><td>${e.desc}</td><td>${e.spend.toLocaleString()} ${e.currency}</td><td class="right">${Math.floor(e.refund).toLocaleString()} ${e.currency}</td></tr>`).join('')}
             <tr class="total-row"><td colspan="3">預估退稅總額 (約)</td><td class="right">NT$ ${Math.round(refundInfo.totalTwd).toLocaleString()}</td></tr>
        </tbody></table>
    ` : '';

    const helpBuySection = helpBuyList.length > 0 ? `
        <h2>代買清單 (需收款)</h2>
        <table><thead><tr><th>日期</th><th>項目</th><th>原幣金額</th><th class="right">應收款 (台幣)</th></tr></thead><tbody>
            ${helpBuyList.map(e => {
                const hasDeduction = e.refundDeduction && e.refundDeduction > 0;
                const note = hasDeduction ? `<br/><span style="font-size:10px;color:#10b981">(已扣退稅 ${Math.round(e.refundDeduction!).toLocaleString()})</span>` : '';
                return `<tr><td>${e.date}</td><td>${e.desc}</td><td>${e.foreignAmount.toLocaleString()} ${e.currency}</td><td class="right">${Math.round(e.amount).toLocaleString()}${note}</td></tr>`;
            }).join('')}
             <tr class="total-row"><td colspan="3">應收總額</td><td class="right">NT$ ${Math.round(totalHelpBuyTwd).toLocaleString()}</td></tr>
        </tbody></table>
    ` : '';

    const walletSection = walletResidue.length > 0 ? `
        <h2>外幣現金餘額</h2>
        <table><thead><tr><th>幣別</th><th>剩餘金額</th><th class="right">預估價值 (TWD)</th></tr></thead><tbody>
            ${walletResidue.map(r => `<tr><td>${r.currency}</td><td>${r.amount.toLocaleString()}</td><td class="right">NT$ ${Math.round(r.valueTwd).toLocaleString()}</td></tr>`).join('')}
             <tr class="total-row"><td colspan="2">總價值</td><td class="right">NT$ ${Math.round(totalResidueValue).toLocaleString()}</td></tr>
        </tbody></table>
    ` : '';

    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Trippie 旅行費用結算報告</title>
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px; color: #333; line-height: 1.5; max-width: 800px; margin: 0 auto; }
            h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 30px; letter-spacing: 1px; }
            h2 { margin-top: 40px; font-size: 18px; border-left: 5px solid #0ea5e9; padding-left: 10px; background: #f0f9ff; padding: 8px 10px; margin-bottom: 15px; }
            .summary-box { display: flex; justify-content: space-between; margin-bottom: 40px; background: #f9fafb; padding: 20px; border-radius: 8px; border: 1px solid #eee; }
            .box-item { text-align: center; flex: 1; }
            .box-label { font-size: 12px; text-transform: uppercase; color: #666; margin-bottom: 5px; font-weight: bold; }
            .box-value { font-size: 28px; font-weight: bold; color: #000; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
            th { background: #f3f4f6; font-weight: bold; text-align: left; padding: 10px; border-bottom: 2px solid #ddd; }
            td { padding: 10px; border-bottom: 1px solid #eee; vertical-align: top; }
            .right { text-align: right; }
            .total-row { font-weight: bold; background: #fdfdfd; }
            .total-row td { border-top: 2px solid #ddd; border-bottom: none; }
            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; background: #eee; color: #555; }
          </style>
        </head>
        <body>
          <h1>✈️ Trippie 旅行費用結算報告</h1>
          <div class="summary-box">
            <div class="box-item">
              <div class="box-label">旅程總支出 (淨額)</div>
              <div class="box-value">NT$ ${Math.round(totalExpense).toLocaleString()}</div>
            </div>
            <div class="box-item" style="border-left: 1px solid #ddd; border-right: 1px solid #ddd;">
              <div class="box-label">信用卡應繳</div>
              <div class="box-value" style="color: #2563eb;">NT$ ${Math.round(creditCardBill).toLocaleString()}</div>
            </div>
             <div class="box-item">
              <div class="box-label">剩餘現金總值</div>
              <div class="box-value" style="color: #059669;">NT$ ${Math.round(totalResidueValue).toLocaleString()}</div>
            </div>
          </div>
          <h2>1. 旅行前準備</h2>
          <table><thead><tr><th>日期</th><th>項目</th><th>分類</th><th class="right">金額</th></tr></thead><tbody>
              ${preExpenses.map(e => `<tr><td>${e.date}</td><td>${e.desc}</td><td><span class="badge">${e.cat}</span></td><td class="right">${Math.round(e.amount).toLocaleString()}</td></tr>`).join('')}
              <tr class="total-row"><td colspan="3">總計</td><td class="right">NT$ ${Math.round(preExpenses.reduce((s,e)=>s+e.amount,0)).toLocaleString()}</td></tr>
          </tbody></table>
          <h2>2. 旅行中消費 (分類)</h2>
          <table><thead><tr><th>分類</th><th>佔比</th><th class="right">金額</th></tr></thead><tbody>
              ${duringCategoryStats.map(s => `<tr><td>${s.category}</td><td>${(s.percentage*100).toFixed(1)}%</td><td class="right">${Math.round(s.amount).toLocaleString()}</td></tr>`).join('')}
               <tr class="total-row"><td colspan="2">總計</td><td class="right">NT$ ${Math.round(duringTotal).toLocaleString()}</td></tr>
          </tbody></table>
          <h2>3. 回國機場消費</h2>
          <table><thead><tr><th>日期</th><th>項目</th><th>分類</th><th class="right">金額</th></tr></thead><tbody>
              ${postExpenses.length===0?'<tr><td colspan="4" style="text-align:center">無紀錄</td></tr>':postExpenses.map(e => `<tr><td>${e.date}</td><td>${e.desc}</td><td><span class="badge">${e.cat}</span></td><td class="right">${Math.round(e.amount).toLocaleString()}</td></tr>`).join('')}
               <tr class="total-row"><td colspan="3">總計</td><td class="right">NT$ ${Math.round(postExpenses.reduce((s,e)=>s+e.amount,0)).toLocaleString()}</td></tr>
          </tbody></table>
          ${helpBuySection}
          ${refundSection}
          ${walletSection}
        </body>
      </html>
    `;
    printWindow.document.write(fullHtml);
    printWindow.document.close();
  };

  const handleArchiveClick = () => {
      if (!tripName.trim()) {
          alert("請輸入旅程名稱");
          return;
      }
      onArchive(tripName, totalExpense);
  };

  const containerClasses = variant === 'modal' 
    ? `fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 ${OVERLAY.modal} animate-fade-in`
    : "w-full animate-fade-in";
  
  const cardClasses = variant === 'modal'
    ? "bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
    : "bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 flex flex-col h-full";

  return (
    <div className={containerClasses}>
      <div className={cardClasses}>
        
        {/* Header */}
        <div className={`p-6 text-white relative overflow-hidden flex-shrink-0 ${variant === 'modal' ? 'bg-gradient-to-r from-brand-600 to-brand-800' : 'bg-slate-800'}`}>
            <div className="relative z-10 flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-black mb-1 flex items-center gap-2">
                        <Trophy className="text-yellow-300" /> 旅行結算報告
                    </h2>
                    <p className="text-white/70 text-sm">歡迎回家！以下是您的旅費總分析</p>
                </div>
                <button 
                    type="button"
                    onClick={handlePrint}
                    className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors backdrop-blur-md"
                >
                    <Printer size={14} /> 匯出 PDF
                </button>
            </div>
            {variant === 'modal' && onClose && (
                <button onClick={onClose} type="button" className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors z-20">
                    <X size={20} />
                </button>
            )}
        </div>

        <div className="p-6 space-y-6 overflow-y-auto bg-gray-50 flex-1">
            
            {/* Summary Cards */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-brand-100 text-center relative overflow-hidden">
                 <div className="flex items-center justify-center gap-2 text-gray-500 text-xs font-bold uppercase tracking-wider mb-2 relative z-10">
                    <Receipt size={14} /> {viewerShare === undefined ? '旅程總支出成本' : '你的實際支出'}
                </div>
                {/*
                  What this trip cost the reader, which is not what passed
                  through their hands.

                  「機票與住宿 我們是除二的話 雖然我付 12000 但我實際支出是 6000」.
                  The headline was the sum of the bills that concerned him —
                  money he fronted, not money he spent — so a trip he was owed
                  half of read as twice its cost to him.
                */}
                <div className="text-4xl font-black text-brand-900 tracking-tight relative z-10">
                    ${Math.round(viewerShare ?? totalExpense).toLocaleString()}
                </div>
                <div className="text-[10px] text-gray-400 mt-1 relative z-10">* 已排除代買費用</div>
                {viewerShare !== undefined && frontedByViewer !== undefined && Math.round(frontedByViewer - viewerShare) !== 0 && (
                  <div data-testid="viewer-share" className="relative z-10 mt-3 space-y-1 border-t border-gray-100 pt-3 text-xs font-bold">
                    <p className="text-gray-500">你先付出去 <span className="text-brand-900">${Math.round(frontedByViewer).toLocaleString()}</span></p>
                    <p className={Math.round(frontedByViewer - viewerShare) > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                      {Math.round(frontedByViewer - viewerShare) > 0 ? '待收回' : '待補付'} ${Math.abs(Math.round(frontedByViewer - viewerShare)).toLocaleString()}
                    </p>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-brand-400 to-brand-600"></div>
            </div>

            <div className={`grid ${refundInfo.items.length > 0 || helpBuyList.length > 0 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2'} gap-4`}>
                {/* Credit Card Bill */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-blue-100">
                    <div className="text-xs text-blue-600 font-bold uppercase mb-1 flex items-center gap-1"><CreditCard size={12}/> 信用卡應繳</div>
                    <div className="text-xl font-black text-blue-600">${Math.round(creditCardBill).toLocaleString()}</div>
                </div>
                
                {/* Wallet Residue with Breakdown */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-emerald-100 flex flex-col justify-between">
                    <div>
                        <div className="text-xs text-emerald-600 font-bold uppercase mb-1 flex items-center gap-1"><Wallet size={12}/> 外幣現金餘額</div>
                        <div className="text-xl font-black text-emerald-600 mb-2">${Math.round(totalResidueValue).toLocaleString()}</div>
                    </div>
                </div>

                {/* Refund Info */}
                {refundInfo.items.length > 0 && (
                    <div className={`bg-white p-4 rounded-xl shadow-sm border ${hasRefundRecord ? 'border-emerald-100' : 'border-amber-100'}`}>
                        <div className={`text-xs ${hasRefundRecord ? 'text-emerald-600' : 'text-amber-600'} font-bold uppercase mb-1 flex items-center gap-1`}>
                            {hasRefundRecord ? <CheckCircle size={12}/> : <Tag size={12}/>} 
                            {hasRefundRecord ? '退稅已入帳' : '預估退稅'}
                        </div>
                        <div className={`text-xl font-black ${hasRefundRecord ? 'text-emerald-600' : 'text-amber-600'}`}>
                            ${Math.round(creditedRefund ? creditedRefund.twd : refundInfo.totalTwd).toLocaleString()}
                        </div>
                        {creditedRefund && (
                            <div className="mt-1 text-[11px] font-bold text-emerald-700">
                                {creditedRefund.channel}
                                <span className="ml-1 font-normal text-slate-400">
                                    {Math.round(creditedRefund.foreign).toLocaleString()} {creditedRefund.currency}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                 {/* Help Buy / Receivable */}
                 {helpBuyList.length > 0 && (
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-purple-100">
                        <div className="text-xs text-purple-600 font-bold uppercase mb-1 flex items-center gap-1">
                            <HandHelping size={12}/> 代買需收款
                        </div>
                        <div className="text-xl font-black text-purple-600">
                            ${Math.round(totalHelpBuyTwd).toLocaleString()}
                        </div>
                        
                         {/* Helper text for deduction status */}
                         {totalHelpBuyTwd > 0 && (
                            <div className="text-[10px] text-gray-400 mt-1">
                                {hasRefundRecord 
                                    ? <span className="text-emerald-500 font-bold flex items-center gap-1"><CheckCircle size={10}/> 已自動扣除退稅金額</span> 
                                    : '尚未扣除退稅 (需先辦理退稅入帳)'
                                }
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* CHART SECTION: TOTAL CONSUMPTION ANALYSIS */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2 border-b border-gray-100 pb-2">
                    <PieIcon size={16} className="text-brand-600"/>
                    <span className="text-sm">總消費組成分析</span>
                </h3>
                <div className="h-64 w-full">
                    {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: number) => `NT$ ${Math.round(value).toLocaleString()}`} />
                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                            尚無消費數據
                        </div>
                    )}
                </div>
            </div>

            {/* DETAIL BREAKDOWN SECTIONS */}
            <div className="space-y-6">
              
              {/* 1. Pre-Trip List */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
                  <span className="bg-phase-pre text-white p-1 rounded-md text-xs flex items-center justify-center w-6 h-6"><List size={14}/></span>
                  <span className="text-sm">旅行前：準備清單</span>
                </h3>
                {preExpenses.length > 0 ? (
                  <div className="space-y-2">
                    {preExpenses.map((item, idx) => {
                      /*
                        Openable, like the category breakdown already is.

                        「另外點擊後也要可以打開」 — these two lists are where a bill
                        filed into the wrong stage gets noticed, and noticing it
                        was as far as the screen let anybody get.
                      */
                      const openable = onOpenExpense && expenseById.has(item.id);
                      const RowTag = openable ? 'button' : 'div';
                      return (
                      <RowTag
                        key={item.id || idx}
                        {...(openable
                          ? {
                              type: 'button' as const,
                              'data-testid': `phase-item-${item.id}`,
                              onClick: () => onOpenExpense!(expenseById.get(item.id)!),
                              'aria-label': `打開 ${item.desc}`,
                            }
                          : {})}
                        className="flex w-full items-center justify-between rounded p-1 text-left text-sm hover:bg-gray-50 active:bg-gray-100"
                      >
                        <span className="flex flex-col">
                          <span className="font-medium text-gray-800">{item.desc}</span>
                          <span className="text-[10px] text-gray-400">{item.date} • {item.cat}</span>
                        </span>
                        <span className="font-mono font-bold text-gray-600">
                          ${Math.round(item.amount).toLocaleString()}
                        </span>
                      </RowTag>
                      );
                    })}
                    <div className="border-t border-gray-100 pt-2 flex justify-between items-center font-bold text-gray-900 mt-2 text-sm bg-gray-50 p-2 rounded">
                      <span>小計</span>
                      <span>${Math.round(preExpenses.reduce((s,e)=>s+e.amount,0)).toLocaleString()}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-400 text-xs py-2">此階段無紀錄</div>
                )}
              </div>

              {/* 2. During-Trip Category Breakdown */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
                  <span className="bg-phase-during text-white p-1 rounded-md text-xs flex items-center justify-center w-6 h-6"><PieIcon size={14}/></span>
                  <span className="text-sm">旅行中：分類統計</span>
                </h3>
                {duringCategoryStats.length > 0 ? (
                  <div className="space-y-3">
                    {duringCategoryStats.map((stat, idx) => (
                      <div key={idx}>
                        {/*
                          A total you can open.

                          「我怎麼完全找不到這樣的總額」 — the row was a share of each
                          bill summed across every day, and no screen listed
                          that. A number nobody can trace is a number nobody can
                          believe.
                        */}
                        <button
                          type="button"
                          data-testid={`category-row-${stat.category}`}
                          aria-expanded={openCategory === stat.category}
                          onClick={() => setOpenCategory(current => (current === stat.category ? null : stat.category))}
                          className="w-full text-left"
                        >
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-gray-700 flex items-center gap-1">
                               {stat.category}
                               <ChevronDown
                                 size={12}
                                 className={`text-gray-300 transition-transform ${openCategory === stat.category ? 'rotate-180' : ''}`}
                               />
                            </span>
                            <span className="text-gray-500 font-mono">
                              {(stat.percentage * 100).toFixed(1)}% <span className="text-gray-300 mx-1">|</span> ${Math.round(stat.amount).toLocaleString()}
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                              style={{ width: `${stat.percentage * 100}%` }}
                            ></div>
                          </div>
                        </button>

                        {openCategory === stat.category && (
                          <div data-testid={`category-items-${stat.category}`} className="mt-2 space-y-1 rounded-xl bg-gray-50 p-2">
                            {stat.items.map(item => {
                              /*
                                A line you can act on.

                                「點擊可以打開該帳」 — tapping opens that bill. Where
                                the report is handed a bill it cannot find, or no
                                way to open one, the line stays plain text rather
                                than a button that does nothing.
                              */
                              const openable = onOpenExpense && expenseById.has(item.id);
                              const RowTag = openable ? 'button' : 'div';
                              return (
                              <RowTag
                                key={item.id}
                                {...(openable
                                  ? {
                                      type: 'button' as const,
                                      'data-testid': `category-item-${item.id}`,
                                      onClick: () => onOpenExpense!(expenseById.get(item.id)!),
                                      'aria-label': `打開 ${item.desc}`,
                                    }
                                  : {})}
                                className={`flex w-full items-start justify-between gap-2 text-left text-[11px] ${
                                  openable ? 'rounded-lg px-1 -mx-1 py-0.5 active:bg-gray-200' : ''
                                }`}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-bold text-gray-700">{item.desc}</span>
                                  <span className="block text-[10px] text-gray-400">
                                    {item.date}
                                    {item.currency !== 'TWD' && ` · ${Math.round(item.foreignAmount).toLocaleString()} ${item.currency}`}
                                  </span>
                                </span>
                                <span className="shrink-0 text-right">
                                  <span className="block font-mono font-bold text-gray-700">
                                    ${Math.round(item.amount).toLocaleString()}
                                  </span>
                                  {/*
                                    The whole bill, when the share is only part
                                    of it: 「你的 475」 is unrecognisable beside a
                                    receipt that says 950.
                                  */}
                                  {Math.round(item.full) !== Math.round(item.amount) && (
                                    <span className="block text-[9px] text-gray-400">
                                      全額 ${Math.round(item.full).toLocaleString()}
                                    </span>
                                  )}
                                </span>
                              </RowTag>
                              );
                            })}
                            <div className="flex justify-between border-t border-gray-200 pt-1 text-[11px] font-black text-gray-700">
                              <span>這一類合計</span>
                              <span className="font-mono">${Math.round(stat.amount).toLocaleString()}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                     <div className="border-t border-gray-100 pt-2 flex justify-between items-center font-bold text-gray-900 mt-2 text-sm bg-gray-50 p-2 rounded">
                      <span>小計</span>
                      <span>${Math.round(duringTotal).toLocaleString()}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-400 text-xs py-2">此階段無紀錄</div>
                )}
              </div>

               {/* Help Buy List (Modified Section with Bill Selection & Service Fee) */}
               {helpBuyList.length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-100">
                    <div className="flex justify-between items-center mb-3 border-b border-gray-100 pb-2">
                        <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2">
                            <span className="bg-purple-500 text-white p-1 rounded-md text-xs flex items-center justify-center w-6 h-6">
                                <HandHelping size={14}/>
                            </span>
                            <span className="text-sm">代買清單 (需收款)</span>
                        </h3>
                        <button 
                            onClick={toggleSelectionMode}
                            className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${isSelectionMode ? 'bg-purple-100 text-purple-700 font-bold' : 'text-gray-400 hover:bg-gray-50'}`}
                        >
                            {isSelectionMode ? '取消選取' : <><Calculator size={12} /> 製作收款單</>}
                        </button>
                    </div>

                      <div className="space-y-2">
                        {helpBuyList.map((item, idx) => {
                            const isSelected = selectedItemIds.has(item.id);
                            
                            return (
                                <div 
                                    key={idx} 
                                    className={`flex items-center gap-2 text-sm p-1 rounded transition-all ${isSelectionMode ? 'cursor-pointer hover:bg-purple-50' : ''}`}
                                    onClick={() => isSelectionMode && toggleItemSelection(item.id)}
                                >
                                    {isSelectionMode && (
                                        <div className={`shrink-0 ${isSelected ? 'text-purple-600' : 'text-gray-300'}`}>
                                            {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center flex-1">
                                        <div className="flex flex-col">
                                            <span className={`font-medium ${isSelected ? 'text-purple-900' : 'text-gray-800'}`}>{item.desc}</span>
                                            <span className="text-[10px] text-gray-400">
                                                {item.date} • {item.foreignAmount.toLocaleString()} {item.currency}
                                                {item.refundDeduction && item.refundDeduction > 0 && (
                                                    <span className="text-emerald-500 font-bold ml-1">
                                                        (已扣退稅 {Math.round(item.refundDeduction).toLocaleString()})
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                        <div className={`font-mono font-bold text-right ${isSelected ? 'text-purple-700' : 'text-purple-600'}`}>
                                            <div>${Math.round(item.amount).toLocaleString()}</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        
                         {/* Default Total Row (Hidden when selecting) */}
                         {!isSelectionMode && (
                            <div className="border-t border-gray-100 pt-2 flex justify-between items-center font-bold text-gray-900 mt-2 text-sm bg-gray-50 p-2 rounded">
                                <span>應收總額</span>
                                <span className="text-purple-600">${Math.round(totalHelpBuyTwd).toLocaleString()}</span>
                            </div>
                         )}

                         {/* Selection Total Row with Fee Calculation */}
                         {isSelectionMode && (
                            <div className="mt-4 p-3 bg-purple-50 rounded-xl border border-purple-100">
                                <div className="flex items-center justify-between mb-3 bg-white p-2 rounded-lg border border-purple-100">
                                    <div className="flex items-center gap-1.5 text-purple-800 font-bold text-xs">
                                        <Percent size={14} />
                                        手續費/匯差 (3% 左右合理)
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <input 
                                            type="number" 
                                            value={handlingFeePercent}
                                            onChange={(e) => setHandlingFeePercent(e.target.value)}
                                            className="w-12 text-right border-b border-purple-300 focus:border-purple-600 outline-none font-mono font-bold text-purple-900 bg-transparent text-sm"
                                        />
                                        <span className="text-xs font-bold text-purple-500">%</span>
                                    </div>
                                </div>
                                
                                <div className="flex justify-between items-center mb-1 text-xs text-gray-500">
                                    <span>商品小計 ({selectedItemIds.size}項)</span>
                                    <span>${Math.round(selectedBillBase).toLocaleString()}</span>
                                </div>
                                {feePercent > 0 && (
                                    <div className="flex justify-between items-center mb-2 text-xs text-purple-600">
                                        <span>+ 手續費/匯差</span>
                                        <span>${additionalFee.toLocaleString()}</span>
                                    </div>
                                )}
                                
                                <div className="flex justify-between items-center pt-2 border-t border-purple-200">
                                    <span className="text-xs text-purple-800 font-bold">總收款金額</span>
                                    <span className="text-xl font-black text-purple-700">${Math.round(finalBillTotal).toLocaleString()}</span>
                                </div>

                                <button
                                    onClick={() => setShowBillPreview(true)}
                                    disabled={selectedItemIds.size === 0}
                                    className="w-full mt-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Receipt size={14} /> 產生收款明細圖
                                </button>
                            </div>
                         )}
                      </div>
                  </div>
              )}

              {/* 3. Refund List */}
              {refundInfo.items.length > 0 && (
                  <div className={`bg-white rounded-xl p-4 shadow-sm border ${hasRefundRecord ? 'border-emerald-100' : 'border-amber-100'}`}>
                    <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
                      <span className={`${hasRefundRecord ? 'bg-emerald-500' : 'bg-amber-500'} text-white p-1 rounded-md text-xs flex items-center justify-center w-6 h-6`}>
                        {hasRefundRecord ? <CheckCircle size={14}/> : <Tag size={14}/>}
                      </span>
                      <span className="text-sm">
                        {hasRefundRecord ? '退稅清單 (已完成入帳)' : `預估退稅清單 (約 NT$ ${Math.round(refundInfo.totalTwd).toLocaleString()})`}
                      </span>
                    </h3>
                      <div className="space-y-2">
                        {refundInfo.items.map((item, idx) => (
                          <div key={idx} className={`flex justify-between items-center text-sm group ${hasRefundRecord ? 'hover:bg-emerald-50' : 'hover:bg-amber-50'} p-1 rounded`}>
                             <div className="flex flex-col">
                              <span className="font-medium text-gray-800">{item.desc}</span>
                              <span className="text-[10px] text-gray-400">
                                {item.date} • 消費 {Math.round(item.spend).toLocaleString()} {item.currency}
                                {/*
                                  Not all of this stays with you.

                                  「該退稅不是計入分帳者的退稅總額 是變成在結算時的
                                  減掉的金額」 — you collect the whole thing because
                                  you hold the whole receipt, and the part
                                  matching your companion's share comes off what
                                  they owe when you settle.
                                */}
                                {item.shared && (
                                  <span className="ml-1 text-emerald-600">· 含旅伴份額，結算時扣抵</span>
                                )}
                              </span>
                            </div>
                            <div className={`font-mono font-bold ${hasRefundRecord ? 'text-emerald-600' : 'text-amber-600'} text-right`}>
                                <div>+{Math.floor(item.refund).toLocaleString()} {item.currency}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                  </div>
              )}

              {/* 4. Post-Trip List */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
                  <span className="bg-phase-post text-white p-1 rounded-md text-xs flex items-center justify-center w-6 h-6"><List size={14}/></span>
                  <span className="text-sm">回國機場消費</span>
                </h3>
                {postExpenses.length > 0 ? (
                  <div className="space-y-2">
                    {postExpenses.map((item, idx) => {
                      /*
                        Openable, like the category breakdown already is.

                        「另外點擊後也要可以打開」 — these two lists are where a bill
                        filed into the wrong stage gets noticed, and noticing it
                        was as far as the screen let anybody get.
                      */
                      const openable = onOpenExpense && expenseById.has(item.id);
                      const RowTag = openable ? 'button' : 'div';
                      return (
                      <RowTag
                        key={item.id || idx}
                        {...(openable
                          ? {
                              type: 'button' as const,
                              'data-testid': `phase-item-${item.id}`,
                              onClick: () => onOpenExpense!(expenseById.get(item.id)!),
                              'aria-label': `打開 ${item.desc}`,
                            }
                          : {})}
                        className="flex w-full items-center justify-between rounded p-1 text-left text-sm hover:bg-gray-50 active:bg-gray-100"
                      >
                        <span className="flex flex-col">
                          <span className="font-medium text-gray-800">{item.desc}</span>
                          <span className="text-[10px] text-gray-400">{item.date} • {item.cat}</span>
                        </span>
                        <span className="font-mono font-bold text-gray-600">
                          ${Math.round(item.amount).toLocaleString()}
                        </span>
                      </RowTag>
                      );
                    })}
                    <div className="border-t border-gray-100 pt-2 flex justify-between items-center font-bold text-gray-900 mt-2 text-sm bg-gray-50 p-2 rounded">
                      <span>小計</span>
                      <span>${Math.round(postExpenses.reduce((s,e)=>s+e.amount,0)).toLocaleString()}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-400 text-xs py-2">此階段無紀錄</div>
                )}
              </div>

            </div>

            {/* Archive Section */}
            {allowArchive && <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-5 border border-indigo-100 animate-fade-in-up mt-8 mb-8">
                <h3 className="font-bold text-indigo-900 mb-2 flex items-center gap-2">
                    <Archive size={18} /> 準備好開始下一段旅程了嗎？
                </h3>
                <p className="text-xs text-indigo-600 mb-4">
                    將目前的帳本封存起來，清空畫面，為下一趟冒險做準備。
                </p>
                
                {!showSaveInput ? (
                    <button 
                        type="button"
                        onClick={() => setShowSaveInput(true)}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                        結算並建立新帳本
                    </button>
                ) : (
                    <div className="space-y-3 bg-white p-3 rounded-lg border border-indigo-100 shadow-sm">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">為這趟旅程取個名字</label>
                            <input 
                                autoFocus
                                type="text" 
                                placeholder="例如：2024 日本京阪神"
                                className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={tripName}
                                onChange={(e) => setTripName(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            <button 
                                type="button"
                                onClick={() => setShowSaveInput(false)}
                                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold"
                            >
                                取消
                            </button>
                            <button 
                                type="button"
                                onClick={handleArchiveClick}
                                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:bg-indigo-700"
                            >
                                <Save size={14} /> 確認封存
                            </button>
                        </div>
                    </div>
                )}
            </div>}

            {variant === 'modal' && onClose && (
                <button type="button" onClick={onClose} className="w-full py-3 text-gray-400 text-sm font-medium hover:text-gray-600">
                    暫時關閉視窗 (稍後再結算)
                </button>
            )}
        </div>
      </div>
      
      {/* Bill Preview Modal Overlay */}
      {showBillPreview && (
          <div 
            className={`fixed inset-0 ${OVERLAY.alert} flex flex-col items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-fade-in overflow-y-auto`}
            onClick={() => setShowBillPreview(false)} // Click outside to close
          >
              <div className="relative w-full max-w-sm my-auto" onClick={e => e.stopPropagation()}>
                  
                  {/* Receipt Card */}
                  <div className="bg-white w-full rounded-none shadow-2xl overflow-hidden relative mb-6" style={{boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'}}>
                      
                      {/* Receipt Header */}
                      <div className="bg-purple-600 p-4 text-white text-center relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
                          <h3 className="font-black text-xl tracking-widest relative z-10">RECEIPT</h3>
                          <div className="text-[10px] tracking-wider opacity-80 uppercase relative z-10 mt-1">Trippie Payment Request</div>
                      </div>
                      
                      {/* Receipt Body */}
                      <div className="p-6 bg-white relative">
                          {/* Zigzag Top */}
                          <div className="absolute top-0 left-0 w-full h-2 bg-white -mt-1" style={{clipPath: 'polygon(0% 0%, 5% 100%, 10% 0%, 15% 100%, 20% 0%, 25% 100%, 30% 0%, 35% 100%, 40% 0%, 45% 100%, 50% 0%, 55% 100%, 60% 0%, 65% 100%, 70% 0%, 75% 100%, 80% 0%, 85% 100%, 90% 0%, 95% 100%, 100% 0%)'}}></div>

                          <div className="text-center mb-6">
                              <div className="text-xs text-gray-400 mb-1">{new Date().toLocaleDateString()}</div>
                              <div className="font-bold text-gray-800 text-lg">代墊款項結算</div>
                          </div>

                          <div className="space-y-3 mb-6">
                              <div className="flex justify-between text-[10px] text-gray-400 border-b border-gray-100 pb-1 uppercase tracking-wider">
                                  <span>Item</span>
                                  <span>Price (TWD)</span>
                              </div>
                              {selectedBillItems.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-baseline text-sm">
                                      <div className="pr-4">
                                          <div className="font-medium text-gray-800">{item.desc}</div>
                                          <div className="text-[10px] text-gray-400 font-mono">
                                            {item.foreignAmount.toLocaleString()} {item.currency}
                                            {item.refundDeduction && item.refundDeduction > 0 && ` (-退稅${Math.round(item.refundDeduction)})`}
                                          </div>
                                      </div>
                                      <div className="font-mono font-bold text-gray-900 shrink-0">
                                          ${Math.round(item.amount).toLocaleString()}
                                      </div>
                                  </div>
                              ))}
                              
                              {feePercent > 0 && (
                                  <div className="flex justify-between items-center text-sm pt-2 border-t border-dashed border-gray-100">
                                      <div className="text-gray-500 font-medium">手續費/匯差 ({feePercent}%)</div>
                                      <div className="font-mono font-bold text-gray-900">
                                          + ${additionalFee.toLocaleString()}
                                      </div>
                                  </div>
                              )}
                          </div>

                          <div className="border-t-2 border-dashed border-gray-200 pt-4 flex justify-between items-end">
                              <div className="text-sm font-bold text-gray-500">Total</div>
                              <div className="text-3xl font-black text-gray-900 leading-none">
                                  ${Math.round(finalBillTotal).toLocaleString()}
                              </div>
                          </div>

                          {/* Barcode Deco */}
                          <div className="mt-8 opacity-40">
                              <div className="h-8 w-full bg-repeat-x" style={{backgroundImage: 'linear-gradient(90deg, #000 0%, #000 2%, transparent 2%, transparent 4%, #000 4%, #000 6%, transparent 6%, transparent 10%, #000 10%, #000 18%, transparent 18%, transparent 20%, #000 20%, #000 24%, transparent 24%, transparent 28%, #000 28%, #000 32%, transparent 32%)', backgroundSize: '100% 100%'}}></div>
                              <div className="text-center text-[10px] mt-1 font-mono tracking-[0.5em]">TRIPPIE-PAY</div>
                          </div>

                          {/* Zigzag Bottom */}
                          <div className="absolute bottom-0 left-0 w-full h-2 bg-white -mb-1" style={{clipPath: 'polygon(0% 100%, 5% 0%, 10% 100%, 15% 0%, 20% 100%, 25% 0%, 30% 100%, 35% 0%, 40% 100%, 45% 0%, 50% 100%, 55% 0%, 60% 100%, 65% 0%, 70% 100%, 75% 0%, 80% 100%, 85% 0%, 90% 100%, 95% 0%, 100% 100%)'}}></div>
                      </div>
                      
                      <div className="absolute top-2 right-2 text-white/50 text-[10px] animate-pulse">
                          截圖此畫面傳送
                      </div>
                  </div>

                  {/* Close Button Below Card */}
                  <div className="flex justify-center">
                      <button 
                        onClick={() => setShowBillPreview(false)}
                        className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-6 py-3 rounded-full font-bold backdrop-blur-md border border-white/20 transition-all"
                      >
                          <X size={20} /> 關閉視窗
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default TripSummaryModal;
