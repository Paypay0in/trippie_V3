import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  BookUser,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Home,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Plane,
  Search,
  Users,
} from 'lucide-react';
import { Companion } from '../types';
import { COMMON_CURRENCIES } from '../constants';
import {
  DestinationImage,
  fetchDestinationImage,
} from '../services/destinationImageService';
import {
  TripScope,
  deriveTripScope,
  popularDestinations,
  suggestedCurrency,
} from '../services/tripScope';
import CompanionsModal from './CompanionsModal';
import PopularDestinationTile from './PopularDestinationTile';

export type TripSetupValues = {
  destination: string;
  startDate: string;
  endDate: string;
  currency: string;
  budget?: number;
  companions: Companion[];
  /**
   * 國內 or 國外, as the traveller left the toggle.
   *
   * Absent means they never resolved it — the derivation had nothing to go on
   * and nothing was preselected. The trip keeps saying nobody decided rather
   * than being recorded as 國外 by omission.
   */
  tripScope?: TripScope;
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
  /** Where the traveller lives. Absent is the common case and must stay safe. */
  residenceCountryCode?: string;
  /** What this trip already said its country was, for the preselection only. */
  initialTravelCountry?: string;
  /** A scope already chosen on this trip, which outranks any derivation. */
  initialTripScope?: TripScope;
  /** The default passport, shown on 國外 trips the way the mockup has it. */
  passportLabel?: string;
  passportExpiry?: string;
  passportValid?: boolean;
  onOpenPassport?: () => void;
  onBack: () => void;
  onSubmit: (values: TripSetupValues) => void;
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
  residenceCountryCode,
  initialTravelCountry,
  initialTripScope,
  passportLabel,
  passportExpiry,
  passportValid,
  onOpenPassport,
  onBack,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [destination, setDestination] = useState(initialDestination);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [currency, setCurrency] = useState(initialCurrency || 'TWD');
  /*
    What the toggle shows before anybody touches it.

    A scope already on the trip wins; otherwise the two country fields are
    asked, and when either is missing NOTHING is selected. 「自動判斷」 is a
    convenience, and a convenience that answers when it does not know is just
    a wrong answer delivered faster.
  */
  const [tripScope, setTripScope] = useState<TripScope | undefined>(() => {
    if (initialTripScope) return initialTripScope;
    const derived = deriveTripScope(residenceCountryCode, initialTravelCountry);
    return derived === 'unknown' ? undefined : derived;
  });
  /*
    Whether the currency is still the app's idea or the traveller's.

    The switch may update a suggestion; it may never overwrite a decision.
    Once this is true the scope toggle stops touching the currency for the
    rest of the session — 「不得靜默清除已輸入資料」 covers the field somebody
    deliberately set, not only the ones they typed into.
  */
  const [currencyTouched, setCurrencyTouched] = useState(false);
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
  const shortcuts = tripScope ? popularDestinations(tripScope, residenceCountryCode) : [];

  /**
   * Choose a scope, and let the currency follow only if it may.
   *
   * Nothing else on the form is read or cleared here. That is the whole of
   * 「切換類型時，不得靜默清除已輸入資料」 — destination, dates, budget,
   * companions and cover are not this handler's business.
   */
  const handleScope = (next: TripScope) => {
    setTripScope(next);
    if (currencyTouched) return;
    const home = next === 'domestic' ? suggestedCurrency(residenceCountryCode) : undefined;
    if (home) setCurrency(home);
  };

  /*
    A destination implies a currency only while nobody has set one.

    Typing 日本 on a 國外 trip should land JPY in the box; typing it after
    deliberately choosing TWD should not. Domestic currency comes from the
    residence country instead, which the toggle already handled.
  */
  useEffect(() => {
    if (currencyTouched || tripScope !== 'international') return;
    const abroad = suggestedCurrency(normalizeDestinationQuery(destination));
    if (abroad) setCurrency(abroad);
  }, [destination, tripScope, currencyTouched]);

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
      tripScope,
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
            aria-label={t('common.back')}
          >
            <ArrowLeft size={22} strokeWidth={2.2} />
          </button>
          <h1 className="px-12 text-center text-screen-title font-bold tracking-tight">
            {mode === 'create' ? t('trips.setup.createTitle') : t('trips.setup.editTitle')}
          </h1>
        </header>

        <form onSubmit={handleSubmit} className="mt-2 flex flex-1 flex-col gap-3">
          {/*
            The cover gives way rather than dictating the page length: it is the
            one element that was taking space in proportion to the phone instead
            of in proportion to its job.
          */}
          {/*
            國內 or 國外, before anything else on the form.

            It is first because it changes what the fields below mean — which
            places the shortcuts offer, which currency is suggested, whether a
            passport is any of the app's business. Asking it after the
            destination would be asking somebody to re-read what they just
            filled in.

            Two cards rather than a switch: a switch has a default, and the
            honest state here is frequently 「nobody said」. Neither card is
            selected until somebody selects one or the countries settle it.
          */}
          <section>
            <div className="grid grid-cols-2 gap-2.5" role="group" aria-label={t('trips.setup.scopeHeading')}>
              {([
                ['domestic', Home, 'trips.setup.scopeDomestic', 'trips.setup.scopeDomesticHint'],
                ['international', Plane, 'trips.setup.scopeInternational', 'trips.setup.scopeInternationalHint'],
              ] as const).map(([value, Icon, titleKey, hintKey]) => {
                const selected = tripScope === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleScope(value)}
                    aria-pressed={selected}
                    data-testid={`trip-scope-${value}`}
                    className={`flex items-center gap-2 rounded-cover px-3 py-2.5 text-left transition ${
                      selected
                        ? 'bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-[0_8px_20px_rgba(91,61,245,.28)]'
                        : 'border border-hairline bg-white text-ink hover:border-violet-200'
                    }`}
                  >
                    <Icon size={18} strokeWidth={2.1} className={selected ? 'text-white' : 'text-violet-600'} />
                    <span className="min-w-0">
                      <span className="block truncate text-support font-semibold">{t(titleKey)}</span>
                      <span className={`block truncate text-meta font-medium ${selected ? 'text-white/80' : 'text-ink-soft'}`}>
                        {t(hintKey)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <label htmlFor="trip-destination" className="text-section font-semibold tracking-tight">
              {tripScope === 'domestic'
                ? t('trips.setup.destinationHeadingDomestic')
                : tripScope === 'international'
                  ? t('trips.setup.destinationHeadingInternational')
                  : t('trips.setup.destinationHeading')}
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
                placeholder={
                  tripScope === 'domestic'
                    ? t('trips.setup.destinationPlaceholderDomestic')
                    : tripScope === 'international'
                      ? t('trips.setup.destinationPlaceholderInternational')
                      : t('trips.setup.destinationPlaceholder')
                }
                autoComplete="off"
                className="h-[var(--control-h)] w-full rounded-field border border-hairline bg-white pl-10 pr-3 text-field font-medium text-ink outline-none transition placeholder:text-slate-300 focus:border-violet-400"
              />
            </div>
          </section>

          {/*
            Shortcuts, and only ones that are true.

            An unknown residence yields no domestic list rather than a borrowed
            one, so this section simply does not appear — which is also the
            answer for a country the curated table does not cover.
          */}
          {shortcuts.length > 0 && (
            <section>
              <div className="flex items-end justify-between">
                <p className="text-section font-semibold tracking-tight">{t('trips.setup.popularHeading')}</p>
              </div>
              <div className="mt-2 flex items-start gap-2.5 overflow-x-auto pb-1">
                {shortcuts.map(place => (
                  <PopularDestinationTile
                    key={place.id}
                    place={place}
                    onSelect={selected => setDestination(selected.query)}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <p className="text-section font-semibold tracking-tight">{t('trips.setup.datesHeading')}</p>
            {/*
              Two fields side by side rather than one bordered row holding two
              more bordered fields — the nested frames were most of why this
              screen read as heavier than what it contains.
            */}
            {/*
              Two lines, one field each.

              「一樣」, twice. The row was two equal `minmax(0,1fr)` tracks with
              `w-full min-w-0 max-w-full` inputs, then with the arrow removed,
              then with Safari's native appearance turned off — and the second
              box still came out wider than the first and past the edge of the
              card. Three diagnoses, none of them observed anywhere but in a
              screenshot.

              So the question stops being interesting. A field that owns the
              whole line cannot be squeezed by the one beside it, whatever the
              control decides it wants to be. It costs one row of height and it
              is correct by construction rather than by argument.

              Each one is labelled now. Side by side, 開始 and 結束 were implied
              by the order and by an arrow; stacked, the order says nothing.
            */}
            <div className="mt-2 space-y-2">
              <label className="block">
                <span className="mb-1 block text-support font-medium text-ink-soft">{t('trips.setup.start')}</span>
                <span className="relative block">
                  <CalendarDays
                    size={17}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    aria-label={t('trips.setup.startDateAria')}
                    className="block h-[var(--control-h)] w-full min-w-0 max-w-full rounded-field border border-hairline bg-white pl-8 pr-2 text-support font-medium text-ink outline-none focus:border-violet-400"
                  />
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-support font-medium text-ink-soft">{t('trips.setup.end')}</span>
                <span className="relative block">
                  <CalendarDays
                    size={17}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(event) => setEndDate(event.target.value)}
                    aria-label={t('trips.setup.endDateAria')}
                    className="block h-[var(--control-h)] w-full min-w-0 max-w-full rounded-field border border-hairline bg-white pl-8 pr-2 text-support font-medium text-ink outline-none focus:border-violet-400"
                  />
                </span>
              </label>
            </div>
            {dateRangeInvalid && (
              <p className="mt-1.5 text-support font-medium text-red-500">
                {t('trips.setup.endBeforeStart')}
              </p>
            )}
          </section>

          <section>
            <p className="text-section font-semibold tracking-tight">{t('trips.setup.budgetHeading')}</p>
            {/*
              Currency is a three-letter code and takes a three-letter column;
              the amount takes the rest. Two equal halves gave a wide select
              holding 「TWD」 beside an input that had to hold six digits.
            */}
            <div className="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2.5">
              <label className="text-support font-medium text-ink-soft">
                {t('trips.setup.currency')}
                <select
                  value={currency}
                  onChange={event => {
                    setCurrencyTouched(true);
                    setCurrency(event.target.value);
                  }}
                  className="mt-1 h-[var(--control-h)] w-full rounded-field border border-hairline bg-white px-2.5 text-field font-medium text-ink outline-none focus:border-violet-400"
                >
                  {COMMON_CURRENCIES.map(option => <option key={option.code} value={option.code}>{option.code}</option>)}
                </select>
              </label>
              <label className="text-support font-medium text-ink-soft">
                {t('trips.setup.totalBudget')}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={budget}
                  onChange={event => setBudget(event.target.value)}
                  placeholder={t('trips.setup.optional')}
                  className="mt-1 h-[var(--control-h)] w-full rounded-field border border-hairline bg-white px-3 text-field font-medium text-ink outline-none placeholder:text-slate-300 focus:border-violet-400"
                />
              </label>
            </div>
          </section>

          {/*
            The passport, only where it is anybody's business.

            A domestic weekend has no entry requirements, and an expiry date
            sitting on that form teaches the traveller that the preparation
            items are decoration. On 國外 it is the first thing worth knowing
            before the dates are locked in, which is why it reads here and not
            three screens later.
          */}
          {tripScope === 'international' && passportLabel && (
            <section>
              <p className="text-section font-semibold tracking-tight">{t('trips.setup.passportHeading')}</p>
              <button
                type="button"
                onClick={onOpenPassport}
                disabled={!onOpenPassport}
                data-testid="trip-passport-card"
                className="mt-2 flex w-full items-center gap-2.5 rounded-cover border border-hairline bg-white px-3 py-2.5 text-left transition disabled:cursor-default hover:border-violet-200"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <BookUser size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-support font-semibold text-ink">{passportLabel}</span>
                  <span className="block truncate text-meta font-medium text-ink-soft">
                    {passportExpiry
                      ? t('trips.setup.passportExpiresOn', { date: passportExpiry })
                      : t('trips.setup.passportCheckExpiry')}
                  </span>
                </span>
                {passportValid && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-meta font-semibold text-emerald-600">
                    <CheckCircle2 size={13} />
                    {t('trips.setup.passportValid')}
                  </span>
                )}
                {onOpenPassport && <ChevronRight size={16} className="shrink-0 text-slate-300" />}
              </button>
            </section>
          )}

          <section>
            <p className="text-section font-semibold tracking-tight">{t('trips.setup.companionsHeading')}</p>
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
              {[{ id: 'owner', name: t('trips.setup.me') }, ...draftCompanions].map((person) => (
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
                aria-label={t('trips.setup.addCompanion')}
                data-testid="add-traveler"
                className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-3.5 text-support font-semibold text-ink-soft transition hover:border-violet-300 hover:text-violet-600"
              >
                <Users size={16} />
                {/*
                  The same one/many choice the screen already made, kept as a
                  ternary over two keys rather than an i18next plural: zh-Hant
                  has a single plural category, so a `_other` form would answer
                  「1 people」 for a solo trip.
                */}
                {travelerCount} {travelerCount === 1 ? t('trips.setup.travellerOne') : t('trips.setup.travellerMany')}
              </button>
            </div>
          </section>

          {/*
            The actions take the room left over rather than adding to the pile,
            so 「不用上下滑就能看完並儲存」 survives the restyle.
          */}
          <section>
            <p className="text-section font-semibold tracking-tight">{t('trips.setup.coverHeading')}</p>
            <div className="relative mt-2 h-[clamp(5rem,13vh,7.5rem)] shrink-0 overflow-hidden rounded-cover bg-gradient-to-br from-slate-100 to-blue-50">
            {destinationImage && !destinationImageFailed ? (
              <>
                <img
                  src={destinationImage.imageUrl}
                  alt={t('trips.setup.coverAlt', { destination: destinationImage.destinationQuery })}
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
            </div>
          </section>

          <section className="mt-auto space-y-0.5 pt-2">
            <button
              type="submit"
              disabled={dateRangeInvalid}
              className="flex h-[var(--cta-h)] w-full items-center justify-center rounded-control bg-violet-600 px-5 text-action font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {mode === 'create' ? t('trips.setup.create') : t('trips.setup.saveChanges')}
            </button>
            {/*
              「讓ai 幫你排行程 點擊下去會清空上面所有欄位 直接拿掉」.

              It navigated to the shelf and scrolled to the planner tile, which
              throws away everything typed on this screen — the destination, the
              dates, the companions just added. A link that silently discards a
              half-filled form is worse than no link, and 「AI 幫我排行程」 is on
              the home screen anyway, where nothing is lost by going there.
            */}
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
