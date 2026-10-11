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

  /*
    A card over the app, not a page instead of it.

    「我希望這頁跳出來是卡片 不是滿版的一整頁」. Editing a trip is something you do
    to the thing behind you and then return from — a full-bleed page says the
    opposite, that you have gone somewhere, and gives a six-field form the
    weight of a destination.

    The backdrop does not dismiss. Everywhere else in the app a tap outside
    closes a sheet, and everywhere else there is nothing to lose; here there is
    a half-filled form, and losing it to a mistimed thumb is a worse failure
    than one extra tap on the arrow.

    The inset is the safe area on all four sides, so the card clears the island
    and the home indicator without the page underneath needing to know.
  */
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0b1430]/45 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] text-ink">
      {/*
        One card, one scale.

        「The screen feels like an enlarged responsive website rather than a
        native mobile app.」 Every size here was chosen locally — an 18px heading
        beside a 16px one, 64px rows beside 48px ones, 26px corners beside 16px
        ones — so nothing was wrong on its own and none of it agreed.

        Sizes now come from the tokens in index.css, named by the job they do.
        The screen asks for a section heading rather than picking a number,
        which is how the next screen inherits the decision instead of making it
        again.
      */}
      <main
        className="flex max-h-full w-full max-w-xl flex-col overflow-y-auto rounded-sheet bg-[#f7f8fc] px-[var(--screen-pad)] pb-4 pt-3 shadow-[0_24px_60px_rgba(11,20,48,.35)]"
      >
        <header className="relative flex min-h-11 items-center justify-center">
          <button
            type="button"
            onClick={onBack}
            className="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full text-ink transition hover:bg-slate-100"
            aria-label="返回"
          >
            <ArrowLeft size={22} strokeWidth={2.2} />
          </button>
          <h1 className="px-12 text-center text-screen-title font-bold tracking-tight">
            {mode === 'create' ? 'Create a new trip' : 'Edit trip'}
          </h1>
        </header>

        <form onSubmit={handleSubmit} className="mt-3 flex flex-1 flex-col gap-5">
          {/*
            The cover gives way rather than dictating the page length: it is the
            one element that was taking space in proportion to the phone instead
            of in proportion to its job.
          */}
          <section className="relative h-[clamp(8rem,20vh,11.5rem)] shrink-0 overflow-hidden rounded-cover bg-gradient-to-br from-slate-100 to-blue-50">
            {destinationImage && !destinationImageFailed ? (
              <>
                <img
                  src={destinationImage.imageUrl}
                  alt={`${destinationImage.destinationQuery} destination scenery`}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={() => setDestinationImageFailed(true)}
                />
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
                {/* Attribution is a licence condition, so it stays legible and its links stay real. */}
                <p className="absolute bottom-2.5 left-3.5 right-3.5 z-10 text-meta font-medium text-white/90">
                  Photo by{' '}
                  <a
                    href={destinationImage.photographerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-white/50 underline-offset-2"
                  >
                    {destinationImage.photographer}
                  </a>{' '}
                  on{' '}
                  <a
                    href={destinationImage.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-white/50 underline-offset-2"
                  >
                    Pexels
                  </a>
                </p>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                {isImageLoading ? (
                  <Loader2 size={24} className="animate-spin" />
                ) : (
                  <ImageIcon size={28} strokeWidth={1.6} />
                )}
              </div>
            )}
          </section>

          <section>
            <p className="text-section font-semibold tracking-tight">Trip budget</p>
            {/*
              Currency is a three-letter code and takes a three-letter column;
              the amount takes the rest. Two equal halves gave a wide select
              holding 「TWD」 beside an input that had to hold six digits.
            */}
            <div className="mt-2 grid grid-cols-[5.5rem_1fr] gap-2.5">
              <label className="text-support font-medium text-ink-soft">
                Currency
                <select
                  value={currency}
                  onChange={event => setCurrency(event.target.value)}
                  className="mt-1 h-[var(--control-h)] w-full rounded-field border border-hairline bg-white px-2.5 text-field font-medium text-ink outline-none focus:border-violet-400"
                >
                  {COMMON_CURRENCIES.map(option => <option key={option.code} value={option.code}>{option.code}</option>)}
                </select>
              </label>
              <label className="text-support font-medium text-ink-soft">
                Total budget
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={budget}
                  onChange={event => setBudget(event.target.value)}
                  placeholder="Optional"
                  className="mt-1 h-[var(--control-h)] w-full rounded-field border border-hairline bg-white px-3 text-field font-medium text-ink outline-none placeholder:text-slate-300 focus:border-violet-400"
                />
              </label>
            </div>
          </section>

          <section>
            <label htmlFor="trip-destination" className="text-section font-semibold tracking-tight">
              Where are you going?
            </label>
            <div className="relative mt-2">
              <Search
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="trip-destination"
                type="text"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="e.g. Tokyo, Japan"
                autoComplete="off"
                className="h-[var(--control-h)] w-full rounded-field border border-hairline bg-white pl-10 pr-3 text-field font-medium text-ink outline-none transition placeholder:text-slate-300 focus:border-violet-400"
              />
            </div>
          </section>

          <section>
            <p className="text-section font-semibold tracking-tight">When?</p>
            {/*
              Two fields side by side rather than one bordered row holding two
              more bordered fields — the nested frames were most of why this
              screen read as heavier than what it contains.
            */}
            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <label className="relative min-w-0">
                <CalendarDays
                  size={17}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  aria-label="開始日期"
                  className="h-[var(--control-h)] w-full min-w-0 rounded-field border border-hairline bg-white pl-8 pr-2 text-support font-medium text-ink outline-none focus:border-violet-400"
                />
              </label>
              <ArrowRight size={15} className="shrink-0 text-slate-400" />
              <label className="relative min-w-0">
                <CalendarDays
                  size={17}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(event) => setEndDate(event.target.value)}
                  aria-label="結束日期"
                  className="h-[var(--control-h)] w-full min-w-0 rounded-field border border-hairline bg-white pl-8 pr-2 text-support font-medium text-ink outline-none focus:border-violet-400"
                />
              </label>
            </div>
            {dateRangeInvalid && (
              <p className="mt-1.5 text-support font-medium text-red-500">
                結束日期不能早於開始日期。
              </p>
            )}
          </section>

          <section>
            <p className="text-section font-semibold tracking-tight">Travelers</p>
            {/*
              The people, not a count of them.

              「Display travelers horizontally」. A row reading 「2 people」 named a
              number where the answer is faces: who is on this trip is the thing
              being edited, and it was being summarised instead of shown. The
              same sheet opens, so nothing about membership or permissions
              changes — only what you can see before you open it.
            */}
            <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
              {/* The owner is on every trip and is not in the companion list. */}
              {[{ id: 'owner', name: '我' }, ...draftCompanions].map((person) => (
                <span
                  key={person.id}
                  data-testid={`traveler-${person.id}`}
                  title={person.name}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-support font-semibold text-violet-700"
                >
                  {person.name.trim().charAt(0) || '?'}
                </span>
              ))}
              <button
                type="button"
                onClick={() => setIsCompanionsOpen(true)}
                aria-label="新增旅伴"
                data-testid="add-traveler"
                className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-3.5 text-support font-semibold text-ink-soft transition hover:border-violet-300 hover:text-violet-600"
              >
                <Users size={16} />
                {travelerCount} {travelerCount === 1 ? 'person' : 'people'}
              </button>
            </div>
          </section>

          {/*
            The actions take the room left over rather than adding to the pile,
            so 「不用上下滑就能看完並儲存」 survives the restyle.
          */}
          <section className="mt-auto space-y-1 pt-2">
            <button
              type="submit"
              disabled={dateRangeInvalid}
              className="flex h-[var(--cta-h)] w-full items-center justify-center rounded-control bg-violet-600 px-5 text-action font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {mode === 'create' ? 'Create Trip' : 'Save Changes'}
            </button>
            {/*
              Secondary, and shaped like it. A second filled button beside the
              first asks the traveller which one the screen is for.
            */}
            <button
              type="button"
              onClick={onOpenAiPlanner}
              className="flex h-[var(--control-h-sm)] w-full items-center justify-center gap-1.5 rounded-control text-action font-medium text-ink-soft transition hover:text-violet-600"
            >
              <Sparkles size={16} className="text-violet-500" />
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
