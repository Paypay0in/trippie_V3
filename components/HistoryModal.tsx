
import React from 'react';
import { Trip } from '../types';
import { X, Calendar, ArrowRight, Trash2, RotateCcw } from 'lucide-react';

interface Props {
  history: Trip[];
  onClose: () => void;
  onRestore: (trip: Trip) => void;
  onDelete: (id: string) => void;
}

const HistoryModal: React.FC<Props> = ({ history, onClose, onRestore, onDelete }) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
                📂 歷史旅程紀錄
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full">
                <X size={20} className="text-gray-500" />
            </button>
        </div>
        
        <div className="p-4 overflow-y-auto space-y-3">
            {history.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                    <p>目前沒有封存的旅程</p>
                    <p className="text-xs mt-2">在「旅行結算」頁面點擊「開啟新旅程」即可存檔</p>
                </div>
            ) : (
                history.map(trip => (
                    <div key={trip.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className="font-bold text-gray-800 text-lg">{trip.name}</h3>
                                <div className="text-xs text-gray-400 flex items-center gap-1">
                                    <Calendar size={12} /> {trip.archivedAt.slice(0, 10)} 封存
                                </div>
                            </div>
                            <div className="font-mono font-bold text-brand-600">
                                ${Math.round(trip.totalCost).toLocaleString()}
                            </div>
                        </div>
                        <div className="text-xs text-gray-500 mb-4 bg-gray-50 p-2 rounded">
                            共 {trip.expenses.length} 筆消費紀錄
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => onRestore(trip)}
                                className="flex-1 py-2 bg-brand-50 text-brand-700 text-xs font-bold rounded-lg hover:bg-brand-100 flex items-center justify-center gap-1"
                            >
                                <RotateCcw size={14} /> 讀取帳本
                            </button>
                            <button 
                                onClick={() => onDelete(trip.id)}
                                className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))
            )}
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;
