
import { OVERLAY } from '../constants/layers';
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
        // Clearing is async; the container stays mounted so there is nothing
        // for the library to race against.
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
    <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm ${OVERLAY.alert} flex items-center justify-center p-4 animate-fade-in`}>
      <div className="flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_rgba(17,24,61,.22)]">
        {/* Header — same shell and close-button placement as the other modals */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-4">
          <button onClick={onClose} aria-label="關閉" className="-ml-2 rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <X size={20} />
          </button>
          <h2 className="flex items-center gap-2 text-xl font-black text-[#11183d]">
            <Share2 size={20} className="text-violet-600" /> 共享旅程帳本
          </h2>
        </div>

        {/* Tabs — the pill pair used on the settlement screen */}
        <div className="flex-shrink-0 px-5 pt-4">
          <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1.5 text-center text-sm font-black">
            <button
              onClick={() => setMode('show')}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 transition-colors ${
                mode === 'show' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-400'
              }`}
            >
              <QrCode size={17} /> 我的 QR Code
            </button>
            <button
              onClick={() => setMode('scan')}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 transition-colors ${
                mode === 'scan' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-400'
              }`}
            >
              <Camera size={17} /> 掃描對方
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* The scanner library injects its own controls into this element and
              tears them down asynchronously. Unmounting the node on tab switch
              left those controls behind, on top of the QR code. It now lives
              here for the life of the modal and is simply hidden instead. */}
          <div
            id="reader"
            className={`w-full overflow-hidden rounded-2xl border-2 border-dashed border-violet-200 bg-white ${
              mode === 'scan' ? 'block' : 'hidden'
            }`}
          />
          {mode === 'show' ? (
            <div className="flex w-full flex-col items-center animate-fade-in">
              <div className="rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-100">
                <QRCodeSVG
                  value={qrData}
                  size={200}
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

              <h3 className="mt-4 text-xl font-black tracking-tight text-[#11183d]">{userName}</h3>
              <p className="mt-1.5 text-center text-[13px] font-medium leading-relaxed text-slate-500">
                讓朋友掃描此碼，即可加入好友並共享目前帳本
              </p>

              {currentTripName && (
                <div className="mt-4 flex items-center gap-2 rounded-full bg-[#f5f1ff] px-4 py-2 ring-1 ring-violet-100">
                  <Share2 size={15} className="text-violet-600" />
                  <span className="text-xs font-black text-violet-700">共享中：{currentTripName}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex w-full flex-col items-center animate-fade-in">
              <p className="mt-4 text-center text-[13px] font-medium text-slate-500">
                請將對方的 QR Code 置於框內進行掃描
              </p>
            </div>
          )}

          <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
            <CheckCircle size={17} className="mt-0.5 shrink-0 text-emerald-500" />
            <p className="text-xs font-medium leading-relaxed text-slate-500">
              共享後，雙方皆可即時編輯消費、分攤金額，並同步更新至雲端。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRShareModal;
