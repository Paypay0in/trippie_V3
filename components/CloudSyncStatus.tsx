import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, CloudOff, RefreshCw, Check, AlertTriangle } from 'lucide-react';
import { fetchMyTrips, isSyncAvailable } from '../services/tripSync';

interface Props {
  signedIn: boolean;
  email?: string;
  /** Trips held on this device, for comparing against what the cloud has. */
  localTripCount: number;
}

type Probe =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; cloudTripCount: number }
  | { state: 'failed'; message: string };

/**
 * Whether this device is actually sharing anything, on demand.
 *
 * Until now the only sync indicator was a development-mode banner, so in
 * production nobody could tell a working trip from a silently failing one —
 * which is exactly the state the Founder was in when a phone and a laptop on
 * the same account disagreed, with nothing on either screen to say why.
 *
 * It asks the real question a traveller has: does the cloud have my trips, and
 * does this device have the same ones. Answering with both numbers is the
 * point — "the cloud has 2" and "this device has 2" are different facts, and
 * only seeing both tells you whether they met.
 */
const CloudSyncStatus: React.FC<Props> = ({ signedIn, email, localTripCount }) => {
  const { t } = useTranslation();
  const [probe, setProbe] = useState<Probe>({ state: 'idle' });

  const configured = isSyncAvailable();

  const check = async () => {
    setProbe({ state: 'checking' });
    const result = await fetchMyTrips();
    if (result.status === 'ok') {
      setProbe({ state: 'ok', cloudTripCount: result.data.length });
    } else {
      setProbe({
        state: 'failed',
        message: result.status === 'error' ? result.message : t('cloudSync.notConfiguredMessage'),
      });
    }
  };

  return (
    <section className="rounded-[24px] border border-[#e8e7f4] bg-white p-5">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${signedIn && configured ? 'bg-[#f0edff] text-[#5b3df5]' : 'bg-slate-100 text-slate-400'}`}>
          {signedIn && configured ? <Cloud size={19} /> : <CloudOff size={19} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-black text-[#111A4A]">{t('cloudSync.title')}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {!configured
              ? t('cloudSync.notConfigured')
              : !signedIn
                ? t('cloudSync.signedOut')
                : <>{t('cloudSync.signedInPrefix')} <span className="font-bold text-slate-600">{email || t('cloudSync.noEmail')}</span>{t('cloudSync.signedInSuffix', { count: localTripCount })}</>}
          </p>
        </div>
      </div>

      {signedIn && configured && (
        <>
          <button
            type="button"
            onClick={() => void check()}
            disabled={probe.state === 'checking'}
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#f3f0ff] px-3 py-2 text-xs font-black text-[#5b3df5] disabled:opacity-50"
          >
            <RefreshCw size={14} className={probe.state === 'checking' ? 'animate-spin' : ''} />
            {probe.state === 'checking' ? t('cloudSync.checking') : t('cloudSync.checkConnection')}
          </button>

          {probe.state === 'ok' && (
            <div className="mt-3 rounded-2xl bg-[#fbfaff] px-4 py-3 text-xs">
              <p className="flex items-center gap-1.5 font-black text-emerald-600">
                <Check size={14} /> {t('cloudSync.connectionOk')}
              </p>
              <p className="mt-1 font-bold text-slate-600">
                {t('cloudSync.counts', { cloud: probe.cloudTripCount, local: localTripCount })}
              </p>
              {/*
                The two numbers disagreeing is the whole reason to look. Saying
                so beats leaving the traveller to compare them and guess whether
                a difference is a problem.
              */}
              {probe.cloudTripCount > localTripCount && (
                <p className="mt-1 leading-relaxed text-slate-500">
                  {t('cloudSync.cloudAhead')}
                </p>
              )}
              {probe.cloudTripCount < localTripCount && (
                <p className="mt-1 leading-relaxed text-slate-500">
                  {t('cloudSync.deviceAhead')}
                </p>
              )}
            </div>
          )}

          {probe.state === 'failed' && (
            <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs">
              <p className="flex items-center gap-1.5 font-black text-rose-600">
                <AlertTriangle size={14} /> {t('cloudSync.connectionFailed')}
              </p>
              {/* The provider's own words: a paraphrase loses the one detail
                  that identifies which of a dozen causes this is. */}
              <p className="mt-1 break-words font-bold text-rose-500">{probe.message}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default CloudSyncStatus;
