
import React, { useState } from 'react';
import { X, Copy, Check, Share2, AlertTriangle } from 'lucide-react';

interface Props {
  link: string;
  onClose: () => void;
}

const ShareModal: React.FC<Props> = ({ link, onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Trippie 旅費分享',
          text: '這是我目前的旅行帳本，點擊連結匯入查看或新增支出：',
          url: link,
        });
      } catch (err) {
        console.error('Share failed', err);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70] animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        <div className="bg-brand-600 p-4 text-white flex justify-between items-center">
            <h2 className="font-bold flex items-center gap-2">
                <Share2 size={20} /> 分享旅程帳本
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                <X size={20} />
            </button>
        </div>
        
        <div className="p-5 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-3">
                <AlertTriangle className="text-amber-500 shrink-0" size={20} />
                <div className="text-xs text-amber-800">
                    <p className="font-bold mb-1">關於協作編輯</p>
                    <p>這是一個「當前快照」連結。旅伴匯入後若有新增支出，<span className="font-bold underline">需要請對方再次產生連結回傳給您</span>，您匯入後才能看到更新。</p>
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">專屬分享連結</label>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        readOnly 
                        value={link} 
                        className="flex-1 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-600 outline-none select-all"
                    />
                    <button 
                        onClick={handleCopy}
                        className={`px-3 py-2 rounded-lg text-white font-bold transition-all flex items-center gap-1 min-w-[80px] justify-center ${copied ? 'bg-emerald-500' : 'bg-brand-600 hover:bg-brand-700'}`}
                    >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? '已複製' : '複製'}
                    </button>
                </div>
            </div>

            {navigator.share && (
                <button 
                    onClick={handleShareNative}
                    className="w-full py-3 border border-gray-300 rounded-xl text-gray-700 font-bold hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                    <Share2 size={18} /> 使用系統分享 (Line / AirDrop)
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
