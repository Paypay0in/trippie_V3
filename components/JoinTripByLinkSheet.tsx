import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OVERLAY } from '../constants/layers';
import { X, Link2, Loader2, AlertTriangle } from 'lucide-react';
import { inviteTokenFromUrl } from '../services/tripInvites';

interface Props {
  onClose: () => void;
  /** Hands the token to the same claim path an opened invite link uses. */
  onToken: (token: string) => void;
}

/**
 * Joining a trip someone else owns, without a camera.
 *
 * The invite arrives as a link, and tapping it is the fast path. This exists
 * for when that fails: the link opened inside LINE's browser, or it was read
 * aloud, or the phone's camera scanned the QR and the traveller ended up
 * copying the address instead of opening it.
 *
 * Deliberately not a QR scanner. The person joining has no trip yet, so there
 * is no screen of their own to put a scanner on, and asking for camera access
 * inside a home-screen web app is the least reliable thing iOS does. Their
 * phone's own camera already reads the code and offers to open the URL.
 */
const JoinTripByLinkSheet: React.FC<Props> = ({ onClose, onToken }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    const entered = value.trim();
    if (!entered) return;

    // A whole link, or just the token out of one. Someone forwarding an
    // invite sends whichever their messaging app left them holding.
    const token = inviteTokenFromUrl(entered) || (/^[a-z0-9]{16,}$/i.test(entered) ? entered : '');
    if (!token) {
      setError(t('joinTrip.byLink.notALink'));
      return;
    }
    setError('');
    onToken(token);
  };

  return (
    <div className={`fixed inset-0 ${OVERLAY.modal} flex items-end justify-center bg-slate-950/35 p-4 sm:items-center`} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-label={t('joinTrip.byLink.title')}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[#11183d]">{t('joinTrip.byLink.title')}</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {t('joinTrip.byLink.blurb')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e8e7f4] text-slate-400"
          >
            <X size={17} />
          </button>
        </div>

        <label className="block">
          <span className="text-[11px] font-black text-slate-500">{t('joinTrip.byLink.linkLabel')}</span>
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-[#e4e2f2] bg-white px-3">
            <Link2 size={15} className="shrink-0 text-slate-400" />
            <input
              value={value}
              onChange={event => { setValue(event.target.value); setError(''); }}
              onKeyDown={event => { if (event.key === 'Enter') submit(); }}
              placeholder="https://…/?join=…"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-[#111A4A] outline-none"
            />
          </div>
        </label>

        {error && (
          <p className="mt-2 flex items-start gap-1.5 text-xs font-bold text-rose-600">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2F5BFF] to-[#8B3DFF] text-sm font-black text-white disabled:opacity-40"
        >
          {t('joinTrip.byLink.join')}
        </button>
      </div>
    </div>
  );
};

export default JoinTripByLinkSheet;
