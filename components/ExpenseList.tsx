
import React from 'react';
import { Expense, Category, TaxRule } from '../types';
import { getCategoryIcon, PAYMENT_METHODS_CONFIG } from '../constants';
import { Trash2, Pencil, Tag, ArrowDownLeft, AlertTriangle } from 'lucide-react';

interface Props {
  expenses: Expense[];
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
  taxRule?: TaxRule | null;
}

const ExpenseList: React.FC<Props> = ({ expenses, onDelete, onEdit, taxRule }) => {
  if (expenses.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <p>此階段尚無支出紀錄</p>
        <p className="text-xs mt-2">點擊下方按鈕新增一筆</p>
      </div>
    );
  }

  // 1. Group expenses by Date
  const groupedByDate = expenses.reduce((acc, expense) => {
    const dateKey = expense.date; // "YYYY-MM-DD"
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(expense);
    return acc;
  }, {} as Record<string, Expense[]>);

  // 2. Sort dates descending (Newest first)
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  );

  // Helper to get Day of Week
  const getDayLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    // Note: getDay() returns 0 for Sunday
    const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    return days[date.getDay()];
  };

  return (
    <div className="space-y-6 pb-24">
      {sortedDates.map((date) => {
        const dayExpenses = groupedByDate[date];
        // Calculate daily total for easier checking (Net total)
        const dailyTotal = dayExpenses.reduce((sum, item) => sum + item.twdAmount, 0);

        return (
          <div key={date} className="animate-fade-in-up">
            {/* Date Header */}
            <div className="flex items-center gap-2 mb-3 px-1 sticky top-0 bg-gray-50/95 backdrop-blur-sm py-3 z-[5]">
                <div className="font-bold text-gray-800 text-lg tracking-tight">
                    {date.slice(5).replace('-', '/')} {/* Show MM/DD */}
                </div>
                <div className="text-xs font-bold text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                    {getDayLabel(date)}
                </div>
                <div className="flex-1 border-b-2 border-dotted border-gray-200 ml-2"></div>
                <div className="text-xs font-bold text-gray-400">
                    單日小計 <span className="text-gray-600 text-sm ml-1">${Math.round(dailyTotal).toLocaleString()}</span>
                </div>
            </div>

            {/* Expenses for this date */}
            <div className="space-y-3">
                {dayExpenses.map((item) => {
                    // Detect if this is an Income/Refund (Negative Amount)
                    const isIncome = item.amount < 0;
                    
                    const Icon = isIncome ? ArrowDownLeft : getCategoryIcon(item.category);
                    const PaymentConfig = PAYMENT_METHODS_CONFIG[item.paymentMethod];
                    const PaymentIcon = PaymentConfig?.icon;
                    
                    // Check Tax Eligibility (Only for positive spendings)
                    const isRefundable = !isIncome && taxRule && 
                                         item.phase === 'during' && 
                                         item.currency === taxRule.currency && 
                                         item.amount >= taxRule.minSpend;

                    return (
                    <div key={item.id} className={`p-3 rounded-xl shadow-sm border flex items-center gap-3 relative overflow-hidden transition-colors ${isIncome ? 'bg-emerald-50/50 border-emerald-100' : 'bg-white border-gray-100'}`}>
                        
                        {/* Refund Eligible Indicator Strip */}
                        {isRefundable && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400"></div>
                        )}
                        
                        {/* Income Indicator Strip */}
                        {isIncome && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500"></div>
                        )}

                        {/* Icon */}
                        <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ml-1 
                            ${isIncome 
                                ? 'bg-emerald-100 text-emerald-600' 
                                : item.category === Category.EXCHANGE 
                                    ? 'bg-orange-100 text-orange-600' 
                                    : 'bg-brand-50 text-brand-500'
                            }`}
                        >
                            <Icon size={20} />
                        </div>

                        {/* Description & Tags - Flex Grow to take available space */}
                        <div className="flex-1 min-w-0">
                            <h4 className={`font-semibold truncate text-sm md:text-base flex items-center gap-2 ${isIncome ? 'text-emerald-900' : 'text-gray-800'}`}>
                                {item.description}
                                {item.needsReview && (
                                    <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded flex items-center gap-1 border border-yellow-200">
                                        <AlertTriangle size={10} /> 待確認
                                    </span>
                                )}
                            </h4>
                            <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap mt-0.5">
                                <span className={`px-1.5 py-0.5 rounded whitespace-nowrap ${isIncome ? 'bg-emerald-100 text-emerald-700 font-bold' : 'bg-gray-100'}`}>
                                    {isIncome ? '退稅入帳' : item.category}
                                </span>
                                <span className="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 whitespace-nowrap">
                                    {PaymentIcon && <PaymentIcon size={10} />}
                                    {PaymentConfig?.label}
                                </span>
                                {isRefundable && (
                                    <span className="flex items-center gap-0.5 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 whitespace-nowrap font-bold">
                                        <Tag size={10} /> 退稅資格
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        {/* Amount Display */}
                        <div className="text-right flex-shrink-0">
                            {/* Main Amount (TWD) */}
                            <div className={`font-bold text-sm md:text-base ${isIncome ? 'text-emerald-600' : 'text-gray-900'}`}>
                                {isIncome ? '+' : ''} NT$ {Math.abs(Math.round(item.twdAmount)).toLocaleString()}
                            </div>
                            
                            {/* Subtext: Status or Fee */}
                            {isIncome ? (
                                <div className="text-[10px] text-emerald-500 font-bold whitespace-nowrap">
                                    入帳完成
                                </div>
                            ) : (
                                item.category === Category.EXCHANGE && item.handlingFee ? (
                                    <div className="text-[10px] text-orange-500 whitespace-nowrap">
                                    含手續費 ${item.handlingFee}
                                    </div>
                                ) : null
                            )}

                            {/* Original Currency (if not TWD) */}
                            {item.currency !== 'TWD' && (
                                <div className="text-[10px] md:text-xs text-gray-400 whitespace-nowrap">
                                {Math.abs(item.amount).toLocaleString()} {item.currency}
                                </div>
                            )}
                        </div>

                        {/* Actions - In flow, separated by border */}
                        <div className="flex items-center gap-0.5 pl-2 border-l border-gray-200 ml-1 flex-shrink-0">
                            <button 
                                onClick={() => onEdit(item)}
                                className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                            >
                                <Pencil size={18} />
                            </button>
                            <button 
                                onClick={() => onDelete(item.id)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                    );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ExpenseList;
