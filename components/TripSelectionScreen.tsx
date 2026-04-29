
import React, { useRef, useState } from 'react';
import { Trip } from '../types';
import TripBook from './TripBook';
import { Trophy, Search, Camera, Image as ImageIcon, Loader2, Sparkles, MapPin, Plus, Check, ShoppingBag, ArrowRight, X, CheckCircle } from 'lucide-react';
import { fetchShoppingSuggestions } from '../services/geminiService';

interface Props {
  currentDraftExpenses: any[]; 
  draftName: string;
  draftStartDate?: string;
  draftEndDate?: string;
  tripHistory: Trip[];
  onOpenDraft: () => void;
  onOpenTrip: (trip: Trip) => void;
  onCreateNew: () => void;
  onDeleteTrip: (id: string) => void;
  onRenameTrip: (id: string | null, newName: string) => void;
  onSmartScan: (files: FileList) => Promise<void>; 
  onBatchAddShoppingItems: (items: string[], targetTripId: string | 'new' | 'draft', newTripName?: string, detectedCountry?: string) => void; 
}

const TripSelectionScreen: React.FC<Props> = ({ 
  currentDraftExpenses, 
  draftName,
  draftStartDate,
  draftEndDate,
  tripHistory, 
  onOpenDraft, 
  onOpenTrip, 
  onCreateNew, 
  onDeleteTrip,
  onRenameTrip,
  onSmartScan,
  onBatchAddShoppingItems
}) => {
  const hasDraft = currentDraftExpenses.length > 0;
  const draftTotal = currentDraftExpenses.reduce((sum, e) => sum + e.twdAmount, 0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{current: number, total: number} | null>(null);

  // AI Planning State
  const [tripDescription, setTripDescription] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{item: string, reason: string, selected: boolean}>>([]);
  const [plannedCountry, setPlannedCountry] = useState<string>(''); // Store detected country
  
  // Target Selection Modal State
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
          setIsScanning(true);
          setScanProgress({ current: 0, total: files.length });
          try {
            await onSmartScan(files);
          } finally {
            setIsScanning(false);
            setScanProgress(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
      }
  };

  const handleGetSuggestions = async () => {
      if (!tripDescription.trim()) return;
      setIsPlanning(true);
      setSuggestions([]); // Clear previous
      setPlannedCountry('');
      try {
          const { suggestions: items, country } = await fetchShoppingSuggestions(tripDescription);
          setSuggestions(items.map(i => ({ ...i, selected: false })));
          if (country) setPlannedCountry(country);
      } finally {
          setIsPlanning(false);
      }
  };

  const toggleSelection = (index: number) => {
      const newSuggestions = [...suggestions];
      newSuggestions[index].selected = !newSuggestions[index].selected;
      setSuggestions(newSuggestions);
  };

  const selectedCount = suggestions.filter(s => s.selected).length;

  const handleConfirmAddToTrip = (targetId: string | 'new' | 'draft') => {
      const itemsToAdd = suggestions.filter(s => s.selected).map(s => s.item);
      // If creating new, use the description as the default name
      const potentialName = targetId === 'new' ? (tripDescription + ' 之旅') : undefined;
      
      // Pass the detected country if creating a new trip
      onBatchAddShoppingItems(itemsToAdd, targetId, potentialName, targetId === 'new' ? plannedCountry : undefined);
      
      // Reset UI
      setIsTargetModalOpen(false);
      setSuggestions([]);
      setTripDescription('');
      setPlannedCountry('');
  };

  return (
    <div className="p-4 space-y-8 pb-10">
        {/* Loading Overlay */}
        {isScanning && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white animate-fade-in">
                <Loader2 size={48} className="animate-spin mb-4 text-brand-400" />
                <h3 className="text-xl font-bold mb-2">
                    {scanProgress && scanProgress.total > 1 
                        ? '正在批次處理單據...' 
                        : '正在分析單據...'}
                </h3>
                <p className="text-white/70 text-sm">
                   AI 正在識別日期與金額，並為您歸檔
                   {scanProgress && scanProgress.total > 1 && (
                       <span className="block mt-2 text-brand-300 font-mono text-lg">
                           請稍候...
                       </span>
                   )}
                </p>
            </div>
        )}

        {/* Stats Summary */}
        <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Trophy size={40} />
                </div>
                <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-2">封存總額</div>
                <div className="font-mono font-black text-2xl text-gray-900">
                    <span className="text-brand-600 text-sm mr-1">$</span>
                    {Math.round(tripHistory.reduce((acc, t) => acc + t.totalCost, 0)).toLocaleString()}
                </div>
                <div className="mt-2 h-1 w-12 bg-brand-500 rounded-full"></div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    <MapPin size={40} />
                </div>
                <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-2">平均每趟花費</div>
                <div className="font-mono font-black text-2xl text-gray-900">
                    <span className="text-gray-400 text-sm mr-1">$</span>
                    {tripHistory.length > 0 
                        ? Math.round(tripHistory.reduce((acc, t) => acc + t.totalCost, 0) / tripHistory.length).toLocaleString() 
                        : '0'}
                </div>
                <div className="mt-2 h-1 w-12 bg-gray-200 rounded-full"></div>
            </div>
        </div>

        {/* AI TRIP PLANNER SECTION */}
        <div className="w-full">
            <div className="bg-white rounded-2xl shadow-sm border border-purple-100 overflow-hidden transition-all duration-300">
                <div className="p-6 bg-gradient-to-br from-purple-50/50 via-white to-white">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-purple-600 p-2 rounded-xl text-white shadow-lg shadow-purple-200">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-gray-900">AI 旅程行前規劃</h2>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Smart Trip Assistant</p>
                        </div>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                        告訴我您的目的地與計畫，我將為您推薦必備的採買清單與行前準備。
                    </p>

                    <div className="flex gap-2 relative">
                        <div className="relative flex-1">
                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input 
                                type="text" 
                                value={tripDescription}
                                onChange={(e) => setTripDescription(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleGetSuggestions()}
                                placeholder="例如: 冬天去北海道滑雪..."
                                className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-gray-700 font-medium"
                            />
                        </div>
                        <button 
                            onClick={handleGetSuggestions}
                            disabled={isPlanning || !tripDescription.trim()}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-6 rounded-2xl font-black flex items-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-purple-200 active:scale-95 shrink-0"
                        >
                            {isPlanning ? <Loader2 className="animate-spin" size={20} /> : <ArrowRight size={20} />}
                        </button>
                    </div>

                    {/* NEW: Action Bar for Selection (Inline) */}
                    {selectedCount > 0 && (
                        <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in">
                            <div className="text-purple-800 font-bold text-sm flex items-center gap-2">
                                <div className="bg-purple-100 p-1 rounded-full"><CheckCircle size={16} className="text-purple-600" /></div>
                                <span>已選擇 <span className="text-lg">{selectedCount}</span> 個建議項目</span>
                            </div>
                            <button 
                                onClick={() => setIsTargetModalOpen(true)}
                                className="w-full sm:w-auto bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-purple-200 hover:shadow-lg hover:-translate-y-0.5"
                            >
                                <ShoppingBag size={16} className="text-purple-300" />
                                下一步：加入帳本 <ArrowRight size={14} />
                            </button>
                        </div>
                    )}

                    {/* Suggestions Grid */}
                    {suggestions.length > 0 && (
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-in-up pb-4">
                            {suggestions.map((item, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => toggleSelection(idx)}
                                    className={`p-3 rounded-xl border transition-all flex justify-between items-center gap-3 cursor-pointer select-none group ${
                                        item.selected 
                                            ? 'bg-purple-600 border-purple-600 shadow-md transform scale-[1.02]' 
                                            : 'bg-white border-gray-200 hover:border-purple-300 hover:shadow-sm'
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className={`font-bold text-sm ${item.selected ? 'text-white' : 'text-gray-800'}`}>
                                            {item.item}
                                        </div>
                                        <div className={`text-[10px] line-clamp-2 leading-tight mt-0.5 ${item.selected ? 'text-purple-100' : 'text-gray-500'}`}>
                                            {item.reason}
                                        </div>
                                    </div>
                                    <div 
                                        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                                            item.selected 
                                                ? 'bg-white text-purple-600 border-white' 
                                                : 'bg-gray-100 text-gray-300 border-gray-200 group-hover:border-purple-200'
                                        }`}
                                    >
                                        {item.selected ? <Check size={14} strokeWidth={3} /> : <Plus size={14} />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* TARGET SELECTION MODAL */}
        {isTargetModalOpen && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
                    <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2">
                            <ShoppingBag className="text-purple-600" size={20} /> 選擇目標帳本
                        </h2>
                        <button onClick={() => setIsTargetModalOpen(false)} className="p-1 hover:bg-gray-200 rounded-full">
                            <X size={20} className="text-gray-500" />
                        </button>
                    </div>
                    
                    <div className="p-5 space-y-3">
                        <p className="text-sm text-gray-500 mb-2">
                            請問您要將這 <span className="font-bold text-purple-600">{selectedCount}</span> 個待買項目加入哪裡？
                        </p>

                        {/* Option 1: Create New (Top Priority) */}
                        <button 
                            onClick={() => handleConfirmAddToTrip('new')}
                            className="w-full text-left p-4 rounded-xl border-2 border-dashed border-purple-200 hover:border-purple-500 hover:bg-purple-50 transition-all group relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 bg-purple-100 text-purple-600 text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">
                                推薦
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="bg-purple-100 text-purple-600 p-2 rounded-lg group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                    <Plus size={20} />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-800 group-hover:text-purple-700">建立新旅程並加入</div>
                                    <div className="text-xs text-gray-400">
                                        將命名為「{tripDescription || '新旅程'}」
                                        {plannedCountry && <span className="block text-purple-600 font-bold mt-0.5">✨ 自動設定國家：{plannedCountry}</span>}
                                    </div>
                                </div>
                            </div>
                        </button>

                        <div className="relative py-2">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-400">或是加入現有帳本</span></div>
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                            {/* Option 2: Current Draft */}
                            {hasDraft && (
                                <button 
                                    onClick={() => handleConfirmAddToTrip('draft')}
                                    className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-all flex items-center gap-3"
                                >
                                    <div className="bg-brand-100 text-brand-600 p-2 rounded-lg">
                                        <Trophy size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-gray-800 truncate">{draftName || '未命名草稿'}</div>
                                        <div className="text-xs text-gray-500">正在進行中的旅程</div>
                                    </div>
                                </button>
                            )}

                            {/* Option 3: History */}
                            {tripHistory.map(trip => (
                                <button 
                                    key={trip.id}
                                    onClick={() => handleConfirmAddToTrip(trip.id)}
                                    className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all flex items-center gap-3"
                                >
                                    <div className="bg-gray-100 text-gray-500 p-2 rounded-lg">
                                        <Check size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-gray-800 truncate">{trip.name}</div>
                                        <div className="text-xs text-gray-400">已封存</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* SMART ACTION AREA */}
        <div className="w-full">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                multiple // Enabled multiple file selection
                onChange={handleFileChange}
            />
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-white border border-gray-100 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all group text-left relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-50 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-110 transition-transform"></div>
                
                <div className="flex items-center gap-5 relative z-10">
                    <div className="bg-brand-600 text-white p-4 rounded-2xl shadow-lg shadow-brand-100 group-hover:scale-110 transition-transform">
                        <Camera size={28} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                            智慧識別 / 批次匯入
                            <span className="text-[10px] bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full font-black border border-brand-100">
                                AI POWERED
                            </span>
                        </h2>
                        <p className="text-gray-500 text-sm mt-1 font-medium">
                            一次選擇多張收據、機票或截圖，AI 自動辨識並歸入對應旅程。
                        </p>
                    </div>
                </div>
            </button>
        </div>

        {/* Bookshelf Grid */}
        <div className="w-full">
            {/* Shelf Level 1 - Active & New */}
            <div className="mb-12">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-6 bg-brand-500 rounded-full"></div>
                        <h2 className="text-xl font-bold text-gray-800">準備出發</h2>
                    </div>
                    <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-md">
                        {hasDraft ? 2 : 1} 個項目
                    </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <TripBook onClick={onCreateNew} />
                    {hasDraft && (
                        <TripBook 
                            isDraft
                            draftName={draftName}
                            draftExpenseCount={currentDraftExpenses.length}
                            draftTotal={draftTotal}
                            startDate={draftStartDate}
                            endDate={draftEndDate}
                            onClick={onOpenDraft} 
                            onRename={(name) => onRenameTrip(null, name)}
                        />
                    )}
                </div>
            </div>

            {/* Shelf Level 2 - History */}
            {tripHistory.length > 0 && (
                 <div>
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-6 bg-gray-400 rounded-full"></div>
                            <h2 className="text-xl font-bold text-gray-800">回憶錄</h2>
                        </div>
                        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-md">
                            {tripHistory.length} 本藏書
                        </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {tripHistory.map(trip => (
                            <TripBook 
                                key={trip.id} 
                                trip={trip} 
                                onClick={() => onOpenTrip(trip)}
                                onDelete={() => onDeleteTrip(trip.id)}
                                onRename={(name) => onRenameTrip(trip.id, name)}
                            />
                        ))}
                    </div>
                </div>
            )}
            
            {tripHistory.length === 0 && !hasDraft && (
                <div className="text-center py-20 opacity-50">
                    <Trophy size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-400">書架上空空的，快開始第一趟旅程吧！</p>
                </div>
            )}
        </div>
    </div>
  );
};

export default TripSelectionScreen;
