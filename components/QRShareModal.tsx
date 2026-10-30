
import { OVERLAY } from '../constants/layers';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X, Camera, QrCode, Users, Share2, CheckCircle, AlertTriangle, Globe } from 'lucide-react';
import { inviteTokenFromUrl } from '../services/tripInvites';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentTripName?: string;
  /** Hands a scanned invite token to the same claim path a tapped link uses. */
  onScanToken: (token: string) => void;
  /** Opens 旅伴管理, where a link for one named seat is actually minted. */
  onManageTravelers: () => void;
  /**
   * Opens 分享設定 — publishing the trip for strangers to read.
   *
   * A different thing from this modal and kept visibly apart from it. An
   * invite adds a traveller, who sees the bills; publishing adds a reader,
   * who sees the days. Collapsing the two into one 分享 button is how
   * somebody publishes their spending by meaning to invite a friend.
   */
  onOpenPublicShare?: () => void;
}

/**
 * Sharing a trip, and joining one that was shared.
 *
 * The QR here used to encode `{type:'SHARE_TRIP', userId, tripId}` — a payload
 * from before invites existed. Scanning it granted nothing on the server: it
 * fabricated an empty local trip with a matching id, which then synced nothing
 * and looked like it had worked. A phone camera pointed at it went to Google
 * and searched the JSON.
 *
 * There is no generic trip QR any more, because there is no generic invite. A
 * link belongs to one named companion's seat so that two people cannot both
 * arrive as the same person. Minting one happens in 旅伴管理; this screen sends
 * you there rather than growing a second way to do it.
 */
const QRShareModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentTripName,
  onScanToken,
  onManageTravelers,
  onOpenPublicShare,
}) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'show' | 'scan'>('show');
  const [scanError, setScanError] = useState('');

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;

    if (mode === 'scan' && isOpen) {
      scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );

      scanner.render((decodedText) => {
        // An invite link, or the token out of one. Nothing else grants access:
        // authorisation comes from claiming the token, so a QR that decodes to
        // anything else cannot be honoured no matter what it claims to be.
        const token = inviteTokenFromUrl(decodedText)
          || (/^[a-z0-9]{16,}$/i.test(decodedText.trim()) ? decodedText.trim() : '');
        if (!token) {
          setScanError(t('qrShare.notAnInvite'));
          return;
        }
        setScanError('');
        scanner?.clear().catch(() => undefined);
        onScanToken(token);
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
  }, [mode, isOpen, onScanToken]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm ${OVERLAY.alert} flex items-center justify-center p-4 animate-fade-in`}>
      <div className="flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_rgba(17,24,61,.22)]">
        {/* Header — same shell and close-button placement as the other modals */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-4">
          <button onClick={onClose} aria-label={t('common.close')} className="-ml-2 rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <X size={20} />
          </button>
          <h2 className="flex items-center gap-2 text-xl font-black text-[#11183d]">
            <Share2 size={20} className="text-violet-600" /> {t('qrShare.title')}
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
              <QrCode size={17} /> {t('qrShare.inviteTab')}
            </button>
            <button
              onClick={() => setMode('scan')}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 transition-colors ${
                mode === 'scan' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-400'
              }`}
            >
              <Camera size={17} /> {t('qrShare.scanTab')}
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
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#f5f1ff]">
                <Users size={34} className="text-violet-600" />
              </div>
              <h3 className="mt-4 text-center text-lg font-black tracking-tight text-[#11183d]">
                {t('qrShare.inviteHeading')}
              </h3>
              <p className="mt-2 text-center text-[13px] font-medium leading-relaxed text-slate-500">
                {t('qrShare.inviteBlurb', {
                  trip: currentTripName
                    ? t('qrShare.namedTrip', { name: currentTripName })
                    : t('qrShare.thisTrip'),
                })}
              </p>
              <button
                type="button"
                onClick={() => { onClose(); onManageTravelers(); }}
                className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2F5BFF] to-[#8B3DFF] text-sm font-black text-white"
              >
                <Share2 size={16} /> {t('qrShare.goToCompanions')}
              </button>
              {onOpenPublicShare && (
                <>
                  <p className="mt-5 text-center text-[11px] font-bold text-slate-400">
                    {t('qrShare.publicPrompt')}
                  </p>
                  <button
                    type="button"
                    data-testid="qr-share-open-public"
                    onClick={() => { onClose(); onOpenPublicShare(); }}
                    className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-black text-[#5b3df5] ring-1 ring-violet-200"
                  >
                    <Globe size={16} /> {t('qrShare.publicShare')}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="flex w-full flex-col items-center animate-fade-in">
              <p className="mt-4 text-center text-[13px] font-medium text-slate-500">
                {t('qrShare.scanHint')}
              </p>
              {scanError && (
                <p className="mt-3 flex items-start gap-1.5 text-xs font-bold text-rose-600">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {scanError}
                </p>
              )}
            </div>
          )}

          <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
            <CheckCircle size={17} className="mt-0.5 shrink-0 text-emerald-500" />
            <p className="text-xs font-medium leading-relaxed text-slate-500">
              {t('qrShare.sharedNotice')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRShareModal;
