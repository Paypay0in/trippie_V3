import React, { useEffect, useState } from 'react';
import { AlertTriangle, Coins, Copy, LucideIcon, Trash2 } from 'lucide-react';

export type ConfirmTone = 'danger' | 'neutral';
export type ConfirmIcon = 'trash' | 'copy' | 'coins' | 'warning';

export interface ConfirmRequest {
  title: string;
  description?: React.ReactNode;
  /** Label of the action button. Say what happens, not "確定". */
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  icon?: ConfirmIcon;
  onConfirm: () => void;
}

interface Props {
  request: ConfirmRequest | null;
  onCancel: () => void;
  onConfirm: () => void;
  /** Shown inside the dialog after a failed attempt, so the reason stays put. */
  error?: string;
  /**
   * When set, the action stays disabled until the user types this exact text.
   * Reserved for the few actions that destroy something irreplaceable — used
   * everywhere it would become a reflex and stop meaning anything.
   */
  requireTypedText?: string;
  /** Stable hooks for runtime tests and accessibility. */
  dialogTestId?: string;
  cancelTestId?: string;
  confirmTestId?: string;
  inputTestId?: string;
  titleId?: string;
}

const ICONS: Record<ConfirmIcon, LucideIcon> = {
  trash: Trash2,
  copy: Copy,
  coins: Coins,
  warning: AlertTriangle,
};

/**
 * Shared confirmation dialog for consequential actions.
 *
 * The browser's window.confirm cannot be styled, cannot show context, and
 * labels its buttons "OK"/"Cancel" — so the riskiest actions in the app looked
 * more casual than deleting a single expense. One component now owns this
 * conversation, driven by a request object so every caller keeps its wording.
 *
 * Presentation only: it asks, then reports the answer. Nothing happens here.
 */
const ConfirmDialog: React.FC<Props> = ({
  request,
  onCancel,
  onConfirm,
  error,
  requireTypedText,
  dialogTestId,
  cancelTestId,
  confirmTestId,
  inputTestId,
  titleId,
}) => {
  const [typed, setTyped] = useState('');

  // A previous confirmation must never pre-arm the next dialog: closing or
  // switching targets clears the box.
  useEffect(() => {
    setTyped('');
  }, [request?.title, request?.description]);

  if (!request) return null;

  const tone = request.tone || 'danger';
  const Icon = ICONS[request.icon || (tone === 'danger' ? 'trash' : 'warning')];
  const isDanger = tone === 'danger';
  const isTypedOk = !requireTypedText || typed.trim() === requireTypedText;

  return (
    <div
      className="fixed inset-0 z-[92] flex items-center justify-center bg-[#08152f]/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-[0_24px_60px_rgba(17,24,61,.28)]"
        onClick={event => event.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={titleId ? undefined : request.title}
        data-testid={dialogTestId}
      >
        <div className="flex flex-col items-center text-center">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-full ${
              isDanger ? 'bg-red-50' : 'bg-violet-50'
            }`}
          >
            <Icon size={24} className={isDanger ? 'text-red-500' : 'text-violet-600'} />
          </div>
          <h2
            id={titleId}
            className="mt-4 text-[1.85rem] font-black leading-[1.2] tracking-tight text-[#11183d]"
          >
            {request.title}
          </h2>
          {request.description && (
            <p className="mt-3 text-[17px] font-medium leading-[1.6] text-slate-500">
              {request.description}
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 text-center text-[16px] font-bold text-red-600">
            {error}
          </p>
        )}

        {requireTypedText && (
          <>
            <label className="mt-6 block text-[15px] font-bold text-slate-500">
              請輸入「{requireTypedText}」以確認
            </label>
            <input
              type="text"
              data-testid={inputTestId}
              value={typed}
              onChange={event => setTyped(event.target.value)}
              placeholder={requireTypedText}
              aria-label={`請輸入${requireTypedText}以確認`}
              className="mt-2 h-[52px] w-full rounded-2xl border border-slate-200 px-4 text-center text-[19px] font-black tracking-[.2em] outline-none placeholder:text-[17px] placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
          </>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            data-testid={cancelTestId}
            onClick={onCancel}
            className="min-h-[56px] flex-1 rounded-2xl border border-slate-200 px-4 text-[17px] font-black text-slate-500 transition-colors hover:bg-slate-50"
          >
            {request.cancelLabel || '取消'}
          </button>
          <button
            type="button"
            data-testid={confirmTestId}
            disabled={!isTypedOk}
            onClick={onConfirm}
            className={`flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-[17px] font-black text-white transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none ${
              isDanger
                ? 'bg-red-500 shadow-[0_10px_24px_rgba(239,68,68,.32)] hover:bg-red-600'
                : 'bg-violet-600 shadow-[0_10px_24px_rgba(124,58,237,.3)] hover:bg-violet-700'
            }`}
          >
            <Icon size={18} />
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
