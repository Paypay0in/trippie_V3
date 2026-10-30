
import { OVERLAY } from '../constants/layers';
import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { X, Copy, Check, Share2, AlertTriangle } from 'lucide-react';

interface Props {
  link: string;
  onClose: () => void;
}

const ShareModal: React.FC<Props> = ({ link, onClose }) => {
  const { t } = useTranslation();
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
          title: t('ledger.share.shareTitle'),
          text: t('ledger.share.shareText'),
          url: link,
        });
      } catch (err) {
        console.error('Share failed', err);
      }
    }
  };

  return (
    <div className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 ${OVERLAY.sheet} animate-fade-in`}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        <div className="bg-brand-600 p-4 text-white flex justify-between items-center">
            <h2 className="font-bold flex items-center gap-2">
                <Share2 size={20} /> {t('ledger.share.heading')}
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                <X size={20} />
            </button>
        </div>
        
        <div className="p-5 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-3">
                <AlertTriangle className="text-amber-500 shrink-0" size={20} />
                <div className="text-xs text-amber-800">
                    <p className="font-bold mb-1">{t('ledger.share.collabTitle')}</p>
                    <p>
                        <Trans
                            i18nKey="ledger.share.collabBody"
                            components={{ strong: <span className="font-bold underline" /> }}
                        />
                    </p>
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">{t('ledger.share.linkLabel')}</label>
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
                        {copied ? t('tripShare.copied') : t('common.copy')}
                    </button>
                </div>
            </div>

            {navigator.share && (
                <button 
                    onClick={handleShareNative}
                    className="w-full py-3 border border-gray-300 rounded-xl text-gray-700 font-bold hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                    <Share2 size={18} /> {t('ledger.share.systemShare')}
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
