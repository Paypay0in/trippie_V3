import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OVERLAY } from '../constants/layers';
import { ArrowRight, Banknote, Coins, CreditCard } from 'lucide-react';
import { PaymentMethod } from '../types';

interface Props {
  isOpen: boolean;
  currency: string;
  estimatedRefund?: number;
  onClose: () => void;
  onConfirm: (amount: number, method: PaymentMethod) => void;
}

const RefundSettlementModal: React.FC<Props> = ({ isOpen, currency, estimatedRefund, onClose, onConfirm }) => {
  /*
    The wording here is the same sentence the ledger card already says when it
    offers this action, so it is the same key. A second copy would be the same
    label with two spellings, which is the same label with two answers.
  */
  const { t } = useTranslation();
  const [amount, setAmount] = useState(estimatedRefund ? Math.floor(estimatedRefund).toString() : '');
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CREDIT_CARD);
  if (!isOpen) return null;
  const parsedAmount = Number(amount);
  return <div className={`fixed inset-0 ${OVERLAY.modal} flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm`}>
    <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
      <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-gray-800"><Coins className="text-amber-500" />{t('ledger.recordRefundTitle')}</h3>
      <p className="mb-4 text-xs text-gray-500">{t('ledger.recordRefundBlurb')}</p>
      <div className="space-y-4">
        <div><label className="mb-1 block text-xs font-bold text-gray-700">{t('ledger.refundReceivedAmount', { currency })}</label><input type="number" autoFocus value={amount} onChange={e => setAmount(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg font-mono font-bold outline-none focus:ring-2 focus:ring-amber-500" placeholder="0" /></div>
        <div><label className="mb-2 block text-xs font-bold text-gray-700">{t('ledger.refundMethod')}</label><div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMethod(PaymentMethod.CREDIT_CARD)} className={`flex flex-col items-center gap-1 rounded-xl border p-3 ${method === PaymentMethod.CREDIT_CARD ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}><CreditCard size={24} /><span className="text-xs font-bold">{t('ledger.refundToCard')}</span></button>
          <button type="button" onClick={() => setMethod(PaymentMethod.CASH_FOREIGN)} className={`flex flex-col items-center gap-1 rounded-xl border p-3 ${method === PaymentMethod.CASH_FOREIGN ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500'}`}><Banknote size={24} /><span className="text-xs font-bold">{t('ledger.refundAsCash')}</span></button>
        </div></div>
        <div className="flex gap-3 pt-2"><button onClick={onClose} className="flex-1 rounded-xl bg-gray-100 py-3 font-bold text-gray-500">{t('common.cancel')}</button><button onClick={() => onConfirm(parsedAmount, method)} disabled={!Number.isFinite(parsedAmount) || parsedAmount <= 0} className="flex-1 rounded-xl bg-amber-500 py-3 font-bold text-white shadow-lg disabled:opacity-50">{t('ledger.confirmRefund')} <ArrowRight size={16} className="inline" /></button></div>
      </div>
    </div>
  </div>;
};

export default RefundSettlementModal;
