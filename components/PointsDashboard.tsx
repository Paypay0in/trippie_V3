import React from 'react';
import { useTranslation } from 'react-i18next';
import { UserProfile } from '../types';
import { Coins, Trophy, Star, ArrowUpRight, Gift, CreditCard } from 'lucide-react';

interface Props {
  profile: UserProfile;
}

const PointsDashboard: React.FC<Props> = ({ profile }) => {
  const { t } = useTranslation();
  /**
   * The ways to earn, resolved at render.
   *
   * Kept inside the component rather than at module scope on purpose: a const
   * array of `t()` calls outside would freeze the language at import.
   */
  const earnWays = [
    { id: 'shareLedger', points: '+500' },
    { id: 'uploadReceipt', points: '+50' },
    { id: 'helpBook', points: '+2000' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-brand-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center font-bold text-xl">
              {profile.name[0]}
            </div>
            <div>
              <h3 className="font-bold">{profile.name}</h3>
              <div className="flex items-center gap-1 text-[10px] opacity-80 uppercase tracking-wider">
                <Trophy size={10} />
                Level {profile.level} Explorer
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur px-3 py-1 rounded-full text-xs font-bold">
            {t('points.pointsCount', { points: profile.points })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10">
            <div className="flex items-center gap-2 mb-1 text-brand-100">
              <Coins size={16} />
              <span className="text-xs font-bold">Trippie Coins</span>
            </div>
            <div className="text-2xl font-bold">{profile.trippieCoins}</div>
            <div className="text-[10px] opacity-60 mt-1">{t('points.coinsWorth')}</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10 flex flex-col justify-center items-center">
            <button className="bg-white text-brand-600 px-4 py-2 rounded-xl text-xs font-bold shadow-lg hover:bg-brand-50 transition-colors">
              {t('points.redeem')}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-col items-center gap-2 hover:border-brand-200 transition-colors">
          <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-600">
            <Gift size={20} />
          </div>
          <span className="text-[10px] font-bold text-gray-600">{t('points.coupons')}</span>
        </button>
        <button className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-col items-center gap-2 hover:border-brand-200 transition-colors">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
            <Star size={20} />
          </div>
          <span className="text-[10px] font-bold text-gray-600">{t('points.quests')}</span>
        </button>
        <button className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-col items-center gap-2 hover:border-brand-200 transition-colors">
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CreditCard size={20} />
          </div>
          <span className="text-[10px] font-bold text-gray-600">{t('points.topUp')}</span>
        </button>
      </div>

      <section>
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-2">{t('points.earnTitle')}</h4>
        <div className="space-y-2">
          {earnWays.map((item, i) => (
            <div key={i} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between group cursor-pointer hover:border-brand-200 transition-colors">
              <div>
                <h5 className="text-sm font-bold text-gray-800">{t(`points.earn.${item.id}.title`)}</h5>
                <p className="text-[10px] text-gray-400">{t(`points.earn.${item.id}.desc`)}</p>
              </div>
              <div className="flex items-center gap-1 text-brand-600 font-bold text-sm">
                {item.points}
                <ArrowUpRight size={14} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default PointsDashboard;
