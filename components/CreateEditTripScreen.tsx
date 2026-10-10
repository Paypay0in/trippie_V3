import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { Companion } from '../types';
import { COMMON_CURRENCIES } from '../constants';
import {
  DestinationImage,
  fetchDestinationImage,
} from '../services/destinationImageService';
import CompanionsModal from './CompanionsModal';

export type TripSetupValues = {
  destination: string;
  startDate: string;
  endDate: string;
  currency: string;
  budget?: number;
  companions: Companion[];
};

type Props = {
  mode: 'create' | 'edit';
  initialDestination: string;
  initialStartDate: string;
  initialEndDate: string;
  initialCurrency?: string;
  initialBudget?: number;
  initialCompanions: Companion[];
  friends: Companion[];
  onBack: () => void;
  onSubmit: (values: TripSetupValues) => void;
  onOpenAiPlanner: () => void;
};

const normalizeDestinationQuery = (value: string) =>
  value.trim().replace(/\s+/g, ' ');

const CreateEditTripScreen: React.FC<Props> = ({
  mode,
  initialDestination,
  initialStartDate,
  initialEndDate,
  initialCurrency,
  initialBudget,
  initialCompanions,
  friends,
  onBack,
  onSubmit,
  onOpenAiPlanner,
}) => {
  const [destination, setDestination] = useState(initialDestination);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [currency, setCurrency] = useState(initialCurrency || 'TWD');
  const [budget, setBudget] = useState(initialBudget === undefined ? '' : String(initialBudget));
  const [draftCompanions, setDraftCompanions] = useState<Companion[]>(initialCompanions);
  const [isCompanionsOpen, setIsCompanionsOpen] = useState(false);
  const [debouncedDestination, setDebouncedDestination] = useState(() =>
    normalizeDestinationQuery(initialDestination),
  );
  const [destinationImage, setDestinationImage] = useState<DestinationImage | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [destinationImageFailed, setDestinationImageFailed] = useState(false);
  const latestDestinationRef = useRef(normalizeDestinationQuery(initialDestination));

  useEffect(() => {
    const normalizedDestination = normalizeDestinationQuery(destination);
    latestDestinationRef.current = normalizedDestination;
    setDestinationImage(null);
    setDestinationImageFailed(false);

    const timer = window.setTimeout(() => {
      setDebouncedDestination(normalizedDestination);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [destination]);

  useEffect(() => {
    let active = true;
    if (!debouncedDestination) {
      setIsImageLoading(false);
      return () => {
        active = false;
      };
    }

    setIsImageLoading(true);
    fetchDestinationImage(debouncedDestination).then((image) => {
      if (!active || latestDestinationRef.current !== debouncedDestination) return;
      setDestinationImage(image);
      setIsImageLoading(false);
    });

    return () => {
      active = false;
    };
  }, [debouncedDestination]);

  const dateRangeInvalid = Boolean(startDate && endDate && endDate < startDate);
  const travelerCount = 1 + draftCompanions.length;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (dateRangeInvalid || (budget !== '' && (!Number.isFinite(Number(budget)) || Number(budget) < 0))) return;

    onSubmit({
      destination: normalizeDestinationQuery(destination),
      startDate,
      endDate,
      currency,
      budget: budget === '' ? undefined : Number(budget),
      companions: draftCompanions,
    });
  };

  const handleAddCompanion = (name: string) => {
    setDraftCompanions((current) => [
      ...current,
      {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        name,
      },
    ]);
  };

  const handleAddFriend = (friend: Companion) => {
    setDraftCompanions((current) =>
      current.some((companion) => companion.id === friend.id) ? current : [...current, friend],
    );
  };

  return (
    <div className="min-h-screen bg-[#fbfcff] text-[#10204a]">
      {/*
        Inset further than the screens it sits beside.

        「這個就太滿版 需要內縮」. Elsewhere in the app a 20px page margin is right
        because the content inside it is white cards, which carry their own
        padding and read as objects lying on the page. Here the fields are the
        cards: the cover, the selects, the date row and the traveller row all
        meet the page margin directly, so the same 20px puts every edge on the
        screen at the same place and the page reads as one slab pushed to the
        bezel.
      */}
      <main data-safe-top style={{ ["--safe-top-base" as string]: "1.75rem" }} className="mx-auto flex min-h-[100dvh] flex-col w-full max-w-xl px-7 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-9">
        <header className="relative flex min-h-12 items-center justify-center">
          <button
            type="button"
            onClick={onBack}
            className="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full text-[#10204a] transition hover:bg-blue-50"
            aria-label="返回"
          >
            <ArrowLeft size={25} strokeWidth={2.4} />
          </button>
          <h1 className="px-14 text-center text-xl font-black tracking-tight sm:text-2xl">
            {mode === 'create' ? 'Create a new trip' : 'Edit trip'}
          </h1>
        </header>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-1 flex-col gap-4">
          <section className="relative h-[clamp(6rem,17vh,9.5rem)] shrink-0 overflow-hidden rounded-[26px] bg-gradient-to-br from-slate-100 via-blue-50 to-cyan-100 shadow-[0_18px_45px_-32px_rgba(15,49,99,0.55)]">
            {destinationImage && !destinationImageFailed ? (
              <>
                <img
                  src={destinationImage.imageUrl}
                  alt={`${destinationImage.destinationQuery} destination scenery`}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={() => setDestinationImageFailed(true)}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#071a3d]/50 via-transparent to-black/5" />
                <p className="absolute bottom-3 left-4 right-4 z-10 text-[10px] font-semibold text-white/90 drop-shadow">
                  Photo by{' '}
                  <a
                    href={destinationImage.photographerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-white/50 underline-offset-2 hover:text-white"
                  >
                    {destinationImage.photographer}
                  </a>{' '}
                  on{' '}
                  <a
                    href={destinationImage.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-white/50 underline-offset-2 hover:text-white"
                  >
                    Pexels
                  </a>
                </p>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-blue-300">
                {isImageLoading ? (
                  <Loader2 size={30} className="animate-spin" />
                ) : (
                  <ImageIcon size={38} strokeWidth={1.6} />
                )}
              </div>
            )}
          </section>

          <section>
            <p className="text-base font-black tracking-tight">Trip budget</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-slate-500">Currency
                <select value={currency} onChange={event => setCurrency(event.target.value)} className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#10204a] outline-none focus:border-blue-400">
                  {COMMON_CURRENCIES.map(option => <option key={option.code} value={option.code}>{option.code}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-500">Total budget
                <input type="number" min="0" step="1" value={budget} onChange={event => setBudget(event.target.value)} placeholder="Optional" className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#10204a] outline-none focus:border-blue-400" />
              </label>
            </div>
          </section>

          <section>
            <label htmlFor="trip-destination" className="text-base font-black tracking-tight">
              Where are you going?
            </label>
            <div className="relative mt-2">
              <Search
                size={22}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="trip-destination"
                type="text"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="e.g. Tokyo, Japan"
                autoComplete="off"
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-13 pr-4 text-base font-semibold text-[#10204a] outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </section>

          <section>
            <p className="text-base font-black tracking-tight">When?</p>
            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2.5">
              <label className="relative min-w-0">
                <CalendarDays
                  size={19}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  aria-label="開始日期"
                  className="h-11 w-full min-w-0 rounded-xl bg-slate-50 pl-8 pr-1 text-xs font-bold text-[#10204a] outline-none focus:ring-2 focus:ring-blue-200 sm:text-sm"
                />
              </label>
              <ArrowRight size={18} className="shrink-0 text-[#10204a]" />
              <label className="relative min-w-0">
                <CalendarDays
                  size={19}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(event) => setEndDate(event.target.value)}
                  aria-label="結束日期"
                  className="h-11 w-full min-w-0 rounded-xl bg-slate-50 pl-8 pr-1 text-xs font-bold text-[#10204a] outline-none focus:ring-2 focus:ring-blue-200 sm:text-sm"
                />
              </label>
            </div>
            {dateRangeInvalid && (
              <p className="mt-2 px-1 text-xs font-semibold text-red-500">
                結束日期不能早於開始日期。
              </p>
            )}
          </section>

          <section>
            <p className="text-base font-black tracking-tight">Travelers</p>
            <button
              type="button"
              onClick={() => setIsCompanionsOpen(true)}
              className="mt-2 flex h-14 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-[#10204a]">
                <Users size={21} />
              </span>
              <span className="flex-1 text-base font-bold">
                {travelerCount} {travelerCount === 1 ? 'person' : 'people'}
              </span>
              <MapPin size={17} className="rotate-90 text-slate-300" />
            </button>
          </section>

          <section className="mt-auto space-y-2 pt-1">
            <button
              type="submit"
              disabled={dateRangeInvalid}
              className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-blue-600 px-5 py-4 text-base font-black text-white shadow-[0_16px_28px_-18px_rgba(37,99,235,0.9)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {mode === 'create' ? 'Create Trip' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onOpenAiPlanner}
              className="flex w-full items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-blue-600 transition hover:text-blue-700"
            >
              <Sparkles size={17} className="text-purple-500" />
              讓 AI 幫你準備這趟旅程
            </button>
          </section>
        </form>
      </main>

      {isCompanionsOpen && (
        <CompanionsModal
          companions={draftCompanions}
          friends={friends}
          onAdd={handleAddCompanion}
          onAddFriendToTrip={handleAddFriend}
          onRemove={(id) =>
            setDraftCompanions((current) => current.filter((companion) => companion.id !== id))
          }
          onClose={() => setIsCompanionsOpen(false)}
        />
      )}
    </div>
  );
};

export default CreateEditTripScreen;
