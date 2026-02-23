
import React from 'react';
import { Trip, Expense, Companion, ShoppingItem } from '../types';
import { Download, Users, ShoppingBag, Receipt, AlertCircle } from 'lucide-react';

interface SharedData {
  expenses: Expense[];
  companions: Companion[];
  shoppingList: ShoppingItem[];
  tripName: string;
  generatedAt: number;
}

interface Props {
  data: SharedData;
  onConfirm: (data: SharedData) => void;
  onCancel: () => void;
}

const ImportModal: React.FC<Props> = ({ data, onConfirm, onCancel }) => {
  const dateStr = new Date(data.generatedAt).toLocaleString();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70] animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-md">
                <Download size={32} />
            </div>
            <h2 className="text-xl font-black">匯入旅程資料</h2>
            <p className="text-purple-100 text-sm mt-1">收到來自旅伴的帳本更新</p>
        </div>

        <div className="p-6 space-y-4">
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">資料內容</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
                        <Receipt className="mx-auto text-brand-500 mb-1" size={16} />
                        <div className="font-bold text-gray-800">{data.expenses.length}</div>
                        <div className="text-[10px] text-gray-500">筆支出</div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
                        <Users className="mx-auto text-orange-500 mb-1" size={16} />
                        <div className="font-bold text-gray-800">{data.companions.length}</div>
                        <div className="text-[10px] text-gray-500">位旅伴</div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
                        <ShoppingBag className="mx-auto text-emerald-500 mb-1" size={16} />
                        <div className="font-bold text-gray-800">{data.shoppingList.length}</div>
                        <div className="text-[10px] text-gray-500">個待買</div>
                    </div>
                </div>
                <div className="text-center mt-3 text-xs text-gray-400">
                    資料產生時間: {dateStr}
                </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-gray-500 bg-blue-50 p-3 rounded-lg text-left">
                <AlertCircle size={16} className="text-blue-500 shrink-0 mt-0.5" />
                <p>匯入將會<span className="font-bold text-blue-700">合併</span>新資料。如果 ID 相同（代表是同一筆資料），系統會以這份新資料覆蓋舊的。</p>
            </div>

            <div className="flex gap-3 pt-2">
                <button 
                    onClick={onCancel}
                    className="flex-1 py-3 border border-gray-300 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                >
                    取消
                </button>
                <button 
                    onClick={() => onConfirm(data)}
                    className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-colors"
                >
                    確認匯入
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
