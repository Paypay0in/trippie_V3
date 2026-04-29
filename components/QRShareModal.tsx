
import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X, Camera, QrCode, UserPlus, Share2, CheckCircle, Loader2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  currentTripId: string | null;
  currentTripName?: string;
  onScanSuccess: (data: any) => void;
}

const QRShareModal: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  userId, 
  userName, 
  currentTripId, 
  currentTripName,
  onScanSuccess 
}) => {
  const [mode, setMode] = useState<'show' | 'scan'>('show');
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;

    if (mode === 'scan' && isOpen) {
      scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );

      scanner.render((decodedText) => {
        try {
          const data = JSON.parse(decodedText);
          onScanSuccess(data);
          scanner?.clear();
          setMode('show');
        } catch (e) {
          console.error("Invalid QR code data", e);
        }
      }, (error) => {
        // console.warn(error);
      });
    }

    return () => {
      if (scanner) {
        scanner.clear().catch(err => console.error("Failed to clear scanner", err));
      }
    };
  }, [mode, isOpen, onScanSuccess]);

  if (!isOpen) return null;

  const qrData = JSON.stringify({
    type: 'SHARE_TRIP',
    userId,
    userName,
    tripId: currentTripId,
    tripName: currentTripName
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight">共享旅程帳本</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Share & Connect</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X size={24} className="text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-white">
          <button 
            onClick={() => setMode('show')}
            className={`flex-1 py-4 font-bold text-sm flex items-center justify-center gap-2 transition-colors ${mode === 'show' ? 'text-brand-600 border-b-2 border-brand-600 bg-brand-50/30' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}
          >
            <QrCode size={18} /> 我的 QR Code
          </button>
          <button 
            onClick={() => setMode('scan')}
            className={`flex-1 py-4 font-bold text-sm flex items-center justify-center gap-2 transition-colors ${mode === 'scan' ? 'text-brand-600 border-b-2 border-brand-600 bg-brand-50/30' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}
          >
            <Camera size={18} /> 掃描對方
          </button>
        </div>

        {/* Content */}
        <div className="p-8 flex flex-col items-center justify-center min-h-[380px] bg-gray-50/50">
          {mode === 'show' ? (
            <div className="flex flex-col items-center animate-fade-in w-full">
              <div className="p-6 bg-white rounded-[2rem] shadow-xl shadow-brand-100/50 border border-gray-100 mb-6 group transition-transform hover:scale-105">
                <QRCodeSVG 
                  value={qrData} 
                  size={220} 
                  level="H"
                  includeMargin={true}
                  imageSettings={{
                    src: "https://picsum.photos/seed/trippie/40/40",
                    x: undefined,
                    y: undefined,
                    height: 40,
                    width: 40,
                    excavate: true,
                  }}
                />
              </div>
              <div className="text-center">
                <h3 className="font-black text-gray-900 text-2xl tracking-tight">{userName}</h3>
                <p className="text-sm text-gray-500 mt-2 font-medium">讓朋友掃描此碼，即可加入好友並共享目前帳本</p>
              </div>
              
              {currentTripName && (
                <div className="mt-6 bg-brand-50 px-5 py-2.5 rounded-xl border border-brand-100 flex items-center gap-2 shadow-sm">
                  <Share2 size={16} className="text-brand-600" />
                  <span className="text-xs font-black text-brand-700 tracking-wide">共享中：{currentTripName}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full flex flex-col items-center animate-fade-in">
              <div id="reader" className="w-full overflow-hidden rounded-3xl border-2 border-dashed border-brand-200 bg-white shadow-inner"></div>
              <p className="text-sm text-gray-500 mt-6 font-medium text-center bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100">
                請將對方的 QR Code 置於框內進行掃描
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-white border-t flex flex-col gap-3">
          <div className="flex items-start gap-3 text-xs text-gray-500 bg-gray-50 p-4 rounded-2xl border border-gray-100">
            <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5" />
            <p className="font-medium leading-relaxed">共享後，雙方皆可即時編輯消費、分攤金額，並同步更新至雲端。</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRShareModal;
