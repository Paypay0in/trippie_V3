
import React, { useState, useEffect } from 'react';
import { VisaInfo, Category } from '../types';
import { fetchVisaAndEntryInfo } from '../services/geminiService';
import { Globe, Loader2, ArrowRight, CheckCircle, AlertTriangle, ExternalLink, Plus, MapPin, ListPlus } from 'lucide-react';

interface Props {
  destination: string;
  defaultOrigin: string;
  onClose: () => void;
  onSaveInfo: (info: VisaInfo) => void;
  onAddVisaExpense: (info: VisaInfo) => void;
}

const VisaCheckModal: React.FC<Props> = ({ destination, defaultOrigin, onClose, onSaveInfo, onAddVisaExpense }) => {
  const [origin, setOrigin] = useState(defaultOrigin || '台灣');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<VisaInfo | null>(null);
  const [hasAddedExpense, setHasAddedExpense] = useState(false);

  // Auto fetch on mount if destination is set
  useEffect(() => {
    if (destination && origin) {
        handleCheck();
    }
  }, []);

  const handleCheck = async () => {
      setLoading(true);
      setInfo(null);
      try {
          const result = await fetchVisaAndEntryInfo(destination, origin);
          if (result) {
              setInfo(result);
              onSaveInfo(result); // Persist to parent
          }
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
  };

  const handleAddExpense = () => {
      if (info) {
          onAddVisaExpense(info);
          setHasAddedExpense(true);
      }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[80] animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white relative">
            <h2 className="text-xl font-bold flex items-center gap-2">
                <Globe size={24} className="opacity-80"/> 入境小幫手
            </h2>
            <p className="text-blue-100 text-xs mt-1 pr-8">
                AI 自動查詢 {destination} 的最新入境規定
            </p>
            {/* Only allow close if not loading to prevent weird states, or allow if info loaded */}
            {!loading && (
                <button 
                    onClick={onClose} 
                    className="absolute top-4 right-4 p-1.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                >
                    <ArrowRight size={18} />
                </button>
            )}
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
            
            {/* Origin Selection */}
            <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
                <span className="text-xs font-bold text-gray-500 whitespace-nowrap pl-1">我的國籍:</span>
                <input 
                    type="text" 
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    className="flex-1 bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none text-sm font-bold text-gray-800 pb-0.5"
                    placeholder="例如：台灣"
                />
                <button 
                    onClick={handleCheck}
                    disabled={loading}
                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md font-bold hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? <Loader2 size={12} className="animate-spin" /> : '重查'}
                </button>
            </div>

            {loading ? (
                <div className="py-10 flex flex-col items-center justify-center text-gray-400 space-y-3">
                    <Loader2 size={32} className="animate-spin text-blue-500" />
                    <p className="text-xs">正在分析簽證與入境表格...</p>
                </div>
            ) : info ? (
                <div className="space-y-4 animate-fade-in">
                    
                    {/* Status Card */}
                    <div className={`p-4 rounded-xl border flex gap-3 items-start ${
                        info.requirement === 'VISA_FREE' 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                            : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                        {info.requirement === 'VISA_FREE' ? <CheckCircle size={24} className="shrink-0"/> : <AlertTriangle size={24} className="shrink-0"/>}
                        <div>
                            <div className="font-bold text-lg leading-tight mb-1">{info.visaName || '簽證資訊'}</div>
                            <p className="text-xs opacity-80">{info.notes}</p>
                            
                            {info.visaLink && (
                                <a href={info.visaLink} target="_blank" className="inline-flex items-center gap-1 text-xs font-bold underline mt-2">
                                    <ExternalLink size={12} /> 申請連結
                                </a>
                            )}
                        </div>
                    </div>

                    {/* Entry Form Info */}
                    {info.entryFormName && (
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">抵達前必填</div>
                            <div className="flex justify-between items-center">
                                <div className="font-bold text-gray-800 text-sm">{info.entryFormName}</div>
                                {info.entryFormLink && (
                                    <a 
                                        href={info.entryFormLink} 
                                        target="_blank" 
                                        className="text-blue-600 bg-blue-100 px-2 py-1 rounded text-xs font-bold hover:bg-blue-200 flex items-center gap-1"
                                    >
                                        前往填寫 <ExternalLink size={10} />
                                    </a>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Cost Action */}
                    {info.feeAmount > 0 && (
                        <div className="border-t border-gray-100 pt-4">
                            <div className="flex justify-between items-end mb-2">
                                <span className="text-xs font-bold text-gray-500">預估簽證/手續費</span>
                                <span className="font-mono font-bold text-gray-900 text-lg">
                                    {info.feeAmount} {info.feeCurrency}
                                </span>
                            </div>
                            <button 
                                onClick={handleAddExpense}
                                disabled={hasAddedExpense}
                                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                    hasAddedExpense 
                                        ? 'bg-green-100 text-green-700 cursor-default' 
                                        : 'bg-gray-900 text-white hover:bg-gray-800 shadow-lg'
                                }`}
                            >
                                {hasAddedExpense ? (
                                    <><CheckCircle size={16} /> 已加入清單</>
                                ) : (
                                    <><ListPlus size={16} /> 加入行前待辦清單</>
                                )}
                            </button>
                        </div>
                    )}

                    <button onClick={onClose} className="w-full py-3 text-gray-500 font-bold text-sm hover:bg-gray-50 rounded-xl">
                        我知道了，進入旅程
                    </button>
                </div>
            ) : (
                <div className="text-center py-8 text-gray-400 text-sm">
                    無法取得資訊，請檢查網路或稍後再試。
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default VisaCheckModal;
