import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OVERLAY } from '../constants/layers';
import { CHECKED_OUT_LABEL, stayRowState } from '../services/lastNightStay';
import { ItineraryItem, PlaceCategory, PlaceCommerceInfo, TripMember } from '../types';
import { optimiseTripRoute, RoutePlan } from '../services/optimiseTripRoute';
import { betterOnAnotherDay, DayMoveSuggestion } from '../services/betterOnAnotherDay';
import { betweenNeighbours, nearerRestaurants } from '../services/nearerRestaurants';
import { fetchNearbyRestaurants, NearbyRestaurant } from '../services/nearbyRestaurantsService';
import SuggestedPlaceCards from './SuggestedPlaceCards';
import { fetchPlaceBasics, hoursForDate, outsideOpeningHours, PlaceBasics, summarizePlaceBasics } from '../services/placeBasicsService';
import { isPersonal, OWN_PERSONAL_LABEL, ownerLabelFor, partitionDayByViewer } from '../services/itineraryVisibility';
import { Clock, MapPin, Plane, Hotel, BedDouble, Utensils, Ticket, Car, CalendarDays, Sparkles, Map, List, Plus, MoreHorizontal, Image as ImageIcon, Info, NotebookPen, Clock3 } from 'lucide-react';
import { fetchPlacePhoto, PlacePhoto } from '../services/placePhotoService';
import { fetchAirportPhoto } from '../services/airportPhoto';
import { fetchPlaceCommerce, hasDisplayableCommerce } from '../services/placeCommerceService';
import { itemsForDay, orderItemsForDay, hasTimeOrderConflict } from '../services/itineraryOrdering';
import {
  detectCollisions,
  describeCollision,
  durationFromEnd,
  durationOf,
  endTimeOf,
  hasLateItem,
  isTimedItem,
  minutesToTime,
  rescheduleFromItem,
  snapMinutes,
  stepsFromDragDistance,
  SNAP_MINUTES,
  timeToMinutes,
} from '../services/itineraryTimeline';
import { GripVertical, Lock, AlertTriangle, Pin, PinOff, User, Users } from 'lucide-react';
import {
  applyFixedEventAdjustment,
  buildFixedEventAdjustment,
  describeUnresolvedConflicts,
  FixedEventAdjustment,
  fixedKindOf,
  isFixedItem,
} from '../services/itineraryFixedEvents';
import { estimateRoute } from '../services/routesService';
import { defaultItineraryDate, enumerateLocalDates, localToday, weekdayOf } from '../services/localDate';
import { StaySpan, stayForNight, staysFromItinerary } from '../services/stayIntake';
import { stayDepartedFrom, stayIsLocated } from '../services/dayOrigin';
import { isStayItem, stayRoleOf } from '../services/stayConflicts';
import { AREA_COLORS } from '../constants/areaColors';
import { TripAreas } from '../services/tripAreas';
import DayBlockPlanner from './DayBlockPlanner';
import DayTransportCheck from './DayTransportCheck';
import { fixedAnchorSchedule } from '../services/itineraryDayFloor';
import SavedPlaceCard from './SavedPlaceCard';
import StayDetailSheet from './StayDetailSheet';
import TransportLeg from './TransportLeg';
import DayMap from './DayMap';
import { hasGroundJourneyBetween } from '../services/transportLegVisibility';

interface Props {
  items: ItineraryItem[];
  onAddToCalendar?: (item: ItineraryItem) => void;
  startDate?: string;
  endDate?: string;
  /** `time` joins date and completion so the card can edit the hour in place. */
  onUpdateItem?: (id: string, updates: Partial<Pick<ItineraryItem, 'date' | 'isCompleted' | 'time' | 'durationMinutes'>>) => void;
  onAdd?: (date?: string) => void;
  onEdit?: (item: ItineraryItem) => void;
  /** Takes the traveller to the stay card, for a night with no room booked. */
  onAddStay?: () => void;
  onDelete?: (id: string) => void;
  /** Trip city/country, used only to disambiguate a ticket lookup by name. */
  destination?: string;
  destinationCountry?: string;
  /**
   * Commits a drag. Returns false when the move was rejected or failed to
   * persist, which is the signal to drop the optimistic order and snap back.
   */
  onReorder?: (
    itemId: string,
    target: { toIndex: number } | { toDate: string; toIndex?: number },
  ) => boolean;
  /** Runs 「重新安排時間」 for the day on screen. */
  onResequenceTimes?: (date?: string) => boolean;
  /**
   * A drag changed an activity's start time. Later activities cascade with it.
   * Returns false when the change was rejected or failed to persist.
   */
  /** Toggles the user's pin on one item. Persisted immediately by the caller. */
  onTogglePin?: (itemId: string, nextPinned: boolean) => void;
  /**
   * Puts the day's cards back into clock order, touching no time.
   *
   * The opposite of `onResequenceTimes`, which keeps the order and rewrites
   * the clocks. 「順序還是錯 第一個怎麼會是四點」.
   */
  onSortByTime?: (date: string) => void;
  /** Start on the map rather than the list. See `mapMode`. */
  initialMapMode?: boolean;
  /**
   * Blocks the traveller has said are meant to be empty. See `emptiedSlots`.
   *
   * 「要有『無』的選項」 — a gap nobody has chosen for and a gap decided against
   * look identical in an itinerary, so the planner kept offering restaurants
   * under a lunch already answered.
   */
  emptiedSlotIds?: string[];
  /** Says a block is empty on purpose, or takes it back. Caller persists. */
  onToggleEmptied?: (slotId: string) => void;
  onRescheduleItem?: (
    itemId: string,
    newStartMinutes: number,
  ) => { ok: boolean; pushedLate?: boolean; startTime?: string };
  /**
   * An activity's length changed. Anything it would now run into moves later.
   * Falls back to a plain write when the caller does not provide it.
   */
  onChangeDuration?: (itemId: string, durationMinutes: number) => boolean;
  /** Writes a confirmed fixed-event adjustment. Never called before confirmation. */
  onApplyFixedAdjustment?: (adjustment: FixedEventAdjustment) => boolean;
  /**
   * AI suggestions waiting on the traveller, shown green inside the day they
   * were proposed for. They are not part of the itinerary and are not persisted
   * until one is ticked.
   */
  pendingSuggestions?: PendingItinerarySuggestion[];
  /** Ticking a suggestion. Resolves to an error message when the write failed. */
  onAcceptSuggestion?: (suggestionId: string) => Promise<string | null>;
  /** Removes one suggestion without writing anything. */
  onDismissSuggestion?: (suggestionId: string) => void;
  /**
   * The traveller's saved places, for the block planner's dropdowns.
   *
   * Omit to hide the planner entirely: a day of empty blocks with nothing to
   * put in them is a form that cannot be filled in.
   */
  savedPlaces?: Array<{
    id: string;
    placeName: string;
    areaLabel?: string;
    areaColorIndex?: number;
    alreadyPlanned?: boolean;
    /** 🏷️ 景點 / 餐廳 / … The block picker groups by it. */
    category?: PlaceCategory;
    district?: string;
    latitude?: number;
    longitude?: number;
    /*
      Why it was saved. 「不然只列餐廳名稱怎麼知道」 — App has been handing these
      over since the picker needed them; this type had never been widened to
      admit they were arriving, so every screen below read a narrower place
      than the one it was given.
    */
    photoUrl?: string;
    notes?: string[];
    placeId?: string;
  }>;
  /**
   * The 🏷️ tag for an itinerary item, so 優化動線 can put meals at mealtimes.
   *
   * 「早上10點吃拉麵嗎？」 — an item does not store the tag; the saved place it
   * came from does, and only the caller can see both.
   */
  categoryOf?: (item: ItineraryItem) => string | undefined;
  /** Writes a place into a block. The caller owns the item and its persistence. */
  /**
   * Fills a block with a saved place.
   *
   * Returns `false` when the stop did not go in, so the picker can stay open
   * rather than close on a refusal. 「我就是點下去就跳掉啦」.
   */
  onFillBlock?: (input: { date: string; time: string; durationMinutes: number; placeGroupId: string }) => void | boolean | string;
  /** A slot filled with a name the traveller typed, carrying no map location. */
  onFillBlockManually?: (input: { date: string; time: string; durationMinutes: number; title: string }) => void;
  /**
   * The trip's areas, computed once from the plan and the collection together.
   *
   * 「行程就需要也有分顏色 讓用戶知道大行程在哪區」. Passed in rather than computed
   * here so 海雲台 is the same colour on this screen as on the collection —
   * each list clustering its own would give one area two colours the moment
   * one list holds a place the other does not, which is most of the time.
   */
  areas?: TripAreas;
  /**
   * Who is looking.
   *
   * 「你的朋友可以在他的行程表上看到你的行程」 — so the same day renders differently
   * for each traveller: their own plan, plus what their companions are doing
   * beside it. Absent means every personal item reads as the viewer's own,
   * which is the right answer for a trip nobody has signed into.
   */
  viewerUserId?: string;
  /** The trip's members, used only to say whose a companion's item is. */
  members?: TripMember[];
}

/** One un-accepted AI suggestion, flattened for display. */
export interface PendingItinerarySuggestion {
  id: string;
  date?: string;
  time?: string;
  placeName: string;
  durationMinutes?: number;
  note?: string;
  reason?: string;
  address?: string;
  /**
   * The lookup answered and no map has this name — 「廣安里海景早午餐咖啡廳」 is
   * a description, not a business. Accepted it becomes a line of text with no
   * address, photo or hours, so the card says so before it is ticked.
   */
  unresolved?: boolean;
  /** 收藏靈感 vs a place the AI proposed on its own. */
  source?: 'saved_inspiration' | 'ai_suggestion';
}

/**
 * Renders a price in its own currency. Falls back to "<code> <amount>" for a
 * currency Intl does not know, rather than dropping the number.
 */
const formatPrice = (amount: number, currency: string): string => {
  try {
    return new Intl.NumberFormat('zh-TW', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('zh-TW')}`;
  }
};

/** Saved notes shown before 查看全部 is offered. */
const VISIBLE_NOTE_COUNT = 3;

const ItineraryCalendar: React.FC<Props> = ({ items, startDate, endDate, onUpdateItem, onAdd, onEdit, onAddStay, onDelete, destination, destinationCountry, onReorder, onResequenceTimes, onRescheduleItem, onChangeDuration, onApplyFixedAdjustment, onTogglePin, pendingSuggestions, onAcceptSuggestion, onDismissSuggestion, areas, savedPlaces, onFillBlock, onFillBlockManually, categoryOf, viewerUserId, members = [], emptiedSlotIds, onToggleEmptied, onSortByTime, initialMapMode }) => {
  const { t } = useTranslation();
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  /** The suggestion currently being written, so a double tap cannot add it twice. */
  const [acceptingSuggestionId, setAcceptingSuggestionId] = useState<string | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ItineraryItem | null>(null);
  const [stayDetail, setStayDetail] = useState<StaySpan | null>(null);

  const dates = useMemo(() => (startDate && endDate ? enumerateLocalDates(startDate, endDate) : []), [startDate, endDate]);
  /*
    Today, where the traveller is standing.

    Read once per render rather than held in state: a trip is not open across a
    midnight often, and a stale value here would grey out the day somebody is
    currently living.
  */
  const today = localToday();
  /*
    The day on screen: whichever one the traveller tapped, or today.

    「比方說今日已經 day 3 打開行程表的時候 預設就不要再從 day1 開始」. Opening on the
    first day is right exactly once — before the trip starts. On the third
    morning it is two taps before the screen says anything about today, every
    time the app is opened.

    Derived rather than set in an effect: the trip's dates arrive after the
    first render, and a default written into state then would either flicker
    through Day 1 or overwrite a day the traveller had already tapped.
  */
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  /*
    「行程的地圖模式」. The button for this has existed in the header since before
    this state did — rendered, styled, and wired to nothing at all.
  */
  /*
    「100%還原」 — the overview's 地圖 tile opens this screen already in map
    mode. The toggle in the header still owns it from then on; this only says
    which one it starts on.
  */
  const [mapMode, setMapMode] = useState(Boolean(initialMapMode));
  /*
    A request, not a setting. This screen stays mounted while the sections
    change, so a prop read only at mount would open the map once and never
    again. Asked for → shown; the header's toggle owns it from then on, and
    turning the request off never closes a map the traveller opened.
  */
  useEffect(() => { if (initialMapMode) setMapMode(true); }, [initialMapMode]);
  /** The proposal on screen, or null. Nothing is written until it is taken. */
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null);
  /** Which day the open plan was asked about, or the whole trip. */
  const [routeScope, setRouteScope] = useState<string | 'trip'>('trip');
  const [dayMoves, setDayMoves] = useState<DayMoveSuggestion[]>([]);
  /*
    「或是 Ai 搜尋後推薦結果出現三個問用戶嗎」.

    Asked only for the restaurants the plan has already flagged, and only once
    the preview is open — nobody should pay a lookup for a warning they never
    saw. Keyed by the item being replaced, never applied: three names and a
    rating is an offer, and which one somebody wants is not a distance.
  */
  const [nearbyByItem, setNearbyByItem] = useState<Record<string, NearbyRestaurant[]>>({});

  /*
    「優化動線的建議應該可以限縮當日？」

    Scoping is the input, not a mode: handed only one day's stops, the planner
    has one date to assign areas to and reorders inside it. Nothing in
    `optimiseTripRoute` needs to know, and the apply writes only what the plan
    contains — so a day-scoped plan cannot touch another day even by accident.
  */
  const planRoute = (scope: string | 'trip') => {
    const scoped = scope === 'trip' ? items : items.filter(item => item.date === scope);
    setRouteScope(scope);
    setRoutePlan(optimiseTripRoute(scoped, { country: destinationCountry, categoryOf }));
    /*
      「假設某個行程移去另一天更順 也可以建議」.

      Always read across the whole trip, even when the plan is scoped to one
      day — the question is precisely about the days this plan is not touching.
      Suggested, never applied: see `betterOnAnotherDay`.
    */
    setDayMoves(betterOnAnotherDay(items));
  };

  /*
    Three from Google for each restaurant the plan flagged. Fired off the open
    plan rather than from the click, so it costs nothing on a trip with no
    detours to report — which is most of them.
  */
  useEffect(() => {
    if (!routePlan || routePlan.mealsNeedingANearerPlace.length === 0) return;
    let cancelled = false;

    void Promise.all(routePlan.mealsNeedingANearerPlace.map(async entry => {
      const day = (routePlan.days.find(candidate => candidate.date === entry.date)?.items || [])
        .slice()
        .sort((left, right) => (left.time || '').localeCompare(right.time || ''));
      const near = betweenNeighbours(day, entry.itemId);
      if (!near) return null;
      const found = await fetchNearbyRestaurants(near.latitude, near.longitude);
      // Never offer something already on the plan: that is not a replacement.
      const planned = new Set(items.map(item => item.placeId).filter(Boolean));
      return [entry.itemId, found.filter(place => !planned.has(place.placeId))] as const;
    })).then(results => {
      if (cancelled) return;
      const found = results.filter((entry): entry is readonly [string, NearbyRestaurant[]] => entry !== null);
      if (found.length === 0) return;
      setNearbyByItem(current => ({ ...current, ...Object.fromEntries(found) }));
    });

    return () => { cancelled = true; };
  }, [routePlan, items]);

  /*
    Google's own line for the places on this plan that carry no notes. See the
    card below, and `placeBasicsService` for why none of it is model-written.
  */
  /*
    The whole record, not a sentence built from it.

    「像這個開放時間也都要寫成行程表上」 — opening hours are in here and were being
    thrown away one line after they arrived, because this screen only ever
    wanted the rating. And it is asked for every place now rather than only
    the ones carrying no notes: whether a museum is shut on the Monday it is
    planned for has nothing to do with whether somebody wrote a note about it.
  */
  const [basicsByItemId, setBasicsByItemId] = useState<Record<string, PlaceBasics>>({});
  const placeKey = items
    .filter(item => item.placeId)
    .map(item => `${item.id}:${item.placeId}`)
    .join('|');

  useEffect(() => {
    if (!placeKey) return;
    let cancelled = false;
    const wanted = placeKey.split('|').map(entry => {
      const separator = entry.lastIndexOf(':');
      return { itemId: entry.slice(0, separator), placeId: entry.slice(separator + 1) };
    });

    void Promise.all(wanted.map(async ({ itemId, placeId }) => {
      const basics = await fetchPlaceBasics(placeId);
      return basics ? [itemId, basics] as const : null;
    })).then(found => {
      if (cancelled) return;
      const resolved = found.filter((entry): entry is readonly [string, PlaceBasics] => entry !== null);
      if (resolved.length === 0) return;
      setBasicsByItemId(current => ({ ...current, ...Object.fromEntries(resolved) }));
    });

    return () => { cancelled = true; };
  }, [placeKey]);
  const activeDate = dates.includes(selectedDate || '') ? selectedDate : defaultItineraryDate(dates);

  /**
   * The suggestions proposed for the day on screen. A suggestion with no date is
   * shown on the first day rather than hidden, so nothing proposed disappears.
   */
  const daySuggestions = useMemo(() => {
    const pending = pendingSuggestions || [];
    if (pending.length === 0) return [];
    return pending
      .filter(suggestion => (suggestion.date ? suggestion.date === activeDate : activeDate === dates[0]))
      .slice()
      .sort((left, right) => (left.time || '99:99').localeCompare(right.time || '99:99'));
  }, [pendingSuggestions, activeDate, dates]);

  // Derived from the whole itinerary, not from this day: the check-in and
  // check-out cards that define the span sit on other days.
  /*
    The hotel this day starts from.

    「每天第一個行程要記得由旅館到第一個行程的交通要顯示在行程表」 — the morning leg
    out of the hotel is the one the traveller plans around, and it was the only
    leg the timeline never drew. Separate from `tonightsStay`, which is where
    they sleep at the end of the day: on a check-out morning those are two
    different answers, and only one of them is where they are standing.
  */
  const morningStay = useMemo(
    () => (activeDate ? stayDepartedFrom(staysFromItinerary(items), activeDate) : undefined),
    [items, activeDate],
  );
  const tonightsStay = useMemo(
    () => (activeDate ? stayForNight(staysFromItinerary(items), activeDate) : undefined),
    [items, activeDate],
  );
  // The day's cards, in the order the user arranged them (or chronological until
  // they arrange one). This is a journey list, not a calendar: the gap between
  // two cards is always the same, whatever the gap between their times.
  /*
    The day, split by whose it is.

    Everything below — ordering, overlap detection, the blocks, the drag
    targets, the AI's bounds — runs on `dayItems`, and `dayItems` is only the
    viewer's own. A companion's haircut is worth seeing but must not make my
    14:00 look taken, must not trip my overlap warning, and must not be
    something I can drag.
  */
  const dayPartition = useMemo(
    () => partitionDayByViewer(orderItemsForDay(itemsForDay(items, activeDate)), viewerUserId),
    [items, activeDate, viewerUserId],
  );
  /*
    入住 and 退房 are reminders, not stops.

    「入住與退房 不是一個行程 是一個提醒事項」. As timeline cards they took a slot
    on the day, sat between two real stops in the sequence, and made the
    journey either side uncomputable — a 11:00 退房 card is why a day read as
    though the traveller travelled to their own hotel room in the middle of the
    afternoon. They are still the same items, still the thing the stay is
    derived from; they simply do not belong in the line of places visited.
  */
  const dayItems = useMemo(() => dayPartition.mine.filter(entry => !isStayItem(entry)), [dayPartition]);
  /** The day's check-in / check-out, shown as a line rather than a stop. */
  /* Which of the three the accommodation row is on this day. */
  const stayRow = stayRowState({
    date: activeDate,
    endDate,
    hasStay: Boolean(tonightsStay),
  });
  const stayReminders = useMemo(
    () => dayPartition.mine.filter(isStayItem).slice()
      .sort((left, right) => (left.time || '').localeCompare(right.time || '')),
    [dayPartition],
  );
  /** What the viewer's companions have on this day, for the strip below. */
  const companionItems = useMemo(
    () => dayPartition.theirs.slice().sort((left, right) => (left.time || '99:99').localeCompare(right.time || '99:99')),
    [dayPartition],
  );
  const timedItems = useMemo(() => dayItems.filter(isTimedItem), [dayItems]);
  const untimedItems = useMemo(() => dayItems.filter(item => !isTimedItem(item)), [dayItems]);

  /** True when the arranged order no longer reads chronologically. */
  const outOfOrder = useMemo(() => hasTimeOrderConflict(timedItems), [timedItems]);
  /** Ids whose scheduled spans overlap, regardless of card order. */
  const collidingIds = useMemo(() => new Set(detectCollisions(timedItems)), [timedItems]);
  /**
   * Every conflict signal on this screen is derived from the CURRENT day, never
   * remembered from the drag that caused it. A stored flag is why a card stayed
   * red and a banner stayed up after the user had already fixed the overlap.
   */
  const lateNotice = useMemo(() => hasLateItem(timedItems), [timedItems]);

  // Drag state. A timed card's drag buys 30-minute steps; an untimed one has no
  // clock to change, so it keeps the plain reorder.
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dragStartY, setDragStartY] = useState(0);
  const [previewMinutes, setPreviewMinutes] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [overDate, setOverDate] = useState<string | null>(null);

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dayTabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const draggingTimed = Boolean(dragItemId && timedItems.some(entry => entry.id === dragItemId));

  /**
   * Travel time to each fixed event on this day, measured where the route
   * service can answer. A missing entry falls back to a conservative estimate
   * and the proposal says so, rather than quietly assuming the journey is short.
   */
  const [transitByFixedId, setTransitByFixedId] = useState<Record<string, number>>({});
  useEffect(() => {
    const fixedWithCoords = timedItems.filter(entry =>
      isFixedItem(entry) && typeof entry.latitude === 'number' && typeof entry.longitude === 'number');
    fixedWithCoords.forEach(target => {
      if (transitByFixedId[target.id] !== undefined) return;
      const before = timedItems.filter(entry => !isFixedItem(entry) && entry.time < target.time);
      const origin = [...before].reverse().find(entry =>
        typeof entry.latitude === 'number' && typeof entry.longitude === 'number');
      if (!origin) return;
      estimateRoute(
        { latitude: origin.latitude!, longitude: origin.longitude! },
        { latitude: target.latitude!, longitude: target.longitude! },
      )
        .then(route => {
          setTransitByFixedId(current => (current[target.id] === undefined
            ? { ...current, [target.id]: Math.ceil(route.durationSeconds / 60) }
            : current));
        })
        // A failed lookup is left absent on purpose: the proposal then uses the
        // fallback buffer and tells the user the timing is an estimate.
        .catch(() => undefined);
    });
  }, [timedItems.map(entry => `${entry.id}:${entry.time}`).join('|')]);

  /** Where an activity goes when it no longer fits: the day before this one. */
  const previousDate = useMemo(() => {
    const index = dates.indexOf(activeDate || '');
    return index > 0 ? dates[index - 1] : undefined;
  }, [dates, activeDate]);

  const fixedContext = useMemo(
    () => ({ transitMinutesByFixedId: transitByFixedId, previousDate }),
    [transitByFixedId, previousDate],
  );

  /*
    Taking one of the offered restaurants.

    「按下去沒有添加行程」 — the cards were rendered with no handler at all, so
    they were disabled buttons that looked tappable. A suggestion nobody can
    act on is worse than no suggestion: it costs a tap to learn it is scenery.

    The swap is 「out with the old, in at its hour」: the replacement takes the
    date, time and length of the restaurant it replaces, because that slot is
    what the whole warning is about.
  */
  const swapMealFor = (
    itemId: string,
    add: (slot: { date: string; time: string; durationMinutes: number }) => void,
  ) => {
    const replacing = items.find(item => item.id === itemId);
    if (!replacing?.date || !replacing.time) return;
    add({
      date: replacing.date,
      time: replacing.time,
      durationMinutes: Number.isFinite(replacing.durationMinutes) && (replacing.durationMinutes as number) > 0
        ? (replacing.durationMinutes as number)
        : 60,
    });
    onDelete?.(itemId);
    setRoutePlan(null);
  };

  /** What this day would need in order to work. Built, never applied. */
  const adjustment = useMemo(
    () => buildFixedEventAdjustment(dayItems, fixedContext),
    [dayItems, fixedContext],
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dismissedSummary, setDismissedSummary] = useState<string | null>(null);
  const needsAdjustment = adjustment.changes.length > 0 || adjustment.unresolved.length > 0;

  /** The day as it would look if the drag were released now. */
  const previewItemsTimed = useMemo(() => {
    if (!draggingTimed || previewMinutes === null || overDate) return null;
    return rescheduleFromItem(dayItems, dragItemId!, previewMinutes).items.filter(isTimedItem);
  }, [draggingTimed, previewMinutes, overDate, dayItems, dragItemId]);

  /** The order shown mid-drag: the lifted card previewed in its candidate slot. */
  const previewItems = useMemo(() => {
    if (!dragItemId || overIndex === null || overDate) return dayItems;
    const from = dayItems.findIndex(entry => entry.id === dragItemId);
    if (from === -1) return dayItems;
    const preview = [...dayItems];
    const [lifted] = preview.splice(from, 1);
    preview.splice(Math.max(0, Math.min(overIndex, preview.length)), 0, lifted);
    return preview;
  }, [dayItems, dragItemId, overIndex, overDate]);

  const dayCards = previewItems;

  const endDrag = () => {
    setDragItemId(null);
    setOverIndex(null);
    setOverDate(null);
    setPreviewMinutes(null);
  };

  /**
   * Follows the pointer. For a timed card the distance dragged buys discrete
   * 30-minute steps; the list is not a ruler, so absolute position is not a time.
   */
  const handleDragMove = (event: React.PointerEvent) => {
    if (!dragItemId) return;
    const { clientX, clientY } = event;

    const tabHit = Object.entries(dayTabRefs.current).find(([, node]: [string, HTMLButtonElement | null]) => {
      if (!node) return false;
      const box = node.getBoundingClientRect();
      return clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom;
    });
    if (tabHit && tabHit[0] !== activeDate) { setOverDate(tabHit[0]); setOverIndex(null); setPreviewMinutes(null); return; }
    setOverDate(null);

    if (draggingTimed) {
      const original = timeToMinutes(dayItems.find(entry => entry.id === dragItemId)?.time || '');
      if (original === undefined) return;
      const steps = stepsFromDragDistance(clientY - dragStartY);
      setPreviewMinutes(snapMinutes(original + steps * SNAP_MINUTES));
      return;
    }

    let slot = dayItems.length - 1;
    for (let index = 0; index < dayItems.length; index += 1) {
      const node = cardRefs.current[dayItems[index].id];
      if (!node) continue;
      const box = node.getBoundingClientRect();
      if (clientY < box.top + box.height / 2) { slot = index; break; }
    }
    setOverIndex(slot);
  };

  const handleDragEnd = () => {
    if (!dragItemId) return;
    const movedId = dragItemId;
    const toDate = overDate;
    const toIndex = overIndex;
    const minutes = previewMinutes;
    const wasTimed = draggingTimed;
    endDrag();

    // A failed commit needs no undo: the preview lived only in drag state, which
    // has already been cleared, so the list snaps back.
    if (toDate) { onReorder?.(movedId, { toDate }); return; }
    if (wasTimed) {
      if (minutes === null || !onRescheduleItem) return;
      const result = onRescheduleItem(movedId, minutes);
      return;
    }
    if (toIndex !== null) onReorder?.(movedId, { toIndex });
  };

  const [photos, setPhotos] = useState<Record<string, PlacePhoto | null>>({});
  /** Airport photos, by airport name. See the effect below. */
  const [airportPhotos, setAirportPhotos] = useState<Record<string, PlacePhoto | null>>({});
  // Item ids whose saved travel notes the user chose to see in full.
  const [expandedNoteIds, setExpandedNoteIds] = useState<string[]>([]);
  /** The itinerary item whose place card is open, if any. */
  const [openPlaceItemId, setOpenPlaceItemId] = useState<string | null>(null);
  // Ticket/booking info per itinerary item id. undefined = still looking.
  const [commerce, setCommerce] = useState<Record<string, PlaceCommerceInfo | null>>({});

  useEffect(() => {
    const placeIds: string[] = [];
    dayCards.forEach(item => {
      const placeId = item.placeId;
      if (placeId && !placeIds.includes(placeId)) placeIds.push(placeId);
    });
    placeIds.forEach(placeId => {
      if (photos[placeId] !== undefined) return;
      fetchPlacePhoto(placeId).then(photo => { setPhotos(current => current[placeId] === undefined ? { ...current, [placeId]: photo } : current); });
    });
  }, [dayCards.map(item => `${item.id}:${item.placeId || ''}`).join('|')]);

  /*
    The flight cards, which have an airport and no place id.

    「這為啥都沒圖」 — this lookup has been keyed on `placeId` for months, and an
    item written from a boarding pass has never had one. 航班起飛 and 抵達機場
    carry the airport's full name, which is enough. See `fetchAirportPhoto`,
    and note it is airports only: resolving a typed name would put a photo of
    somebody else's café on the card and not say so.

    Keyed by name rather than by item, because 出發 and 抵達 at the same airport
    are one picture.
  */
  const airportNames = dayCards
    .filter(item => !item.placeId && item.derivedFromFlightAnchorId)
    .map(item => (item.location || '').trim())
    .filter(Boolean);
  const wantedAirports = Array.from(new Set(airportNames)).join('|');

  useEffect(() => {
    if (!wantedAirports) return;
    let cancelled = false;
    wantedAirports.split('|').forEach(name => {
      if (airportPhotos[name] !== undefined) return;
      void fetchAirportPhoto(name).then(photo => {
        if (!cancelled) setAirportPhotos(current => (current[name] === undefined ? { ...current, [name]: photo } : current));
      });
    });
    return () => { cancelled = true; };
  }, [wantedAirports]);

  // Ticket / booking lookup, keyed by itinerary item so each card can render as
  // soon as its own answer lands. Entirely optional: a null result, a failed
  // request or a slow one simply leaves the card exactly as it is today.
  useEffect(() => {
    dayCards.forEach(item => {
      if (commerce[item.id] !== undefined) return;
      fetchPlaceCommerce({
        // Canonical identity first; the name is only a fallback for a place that
        // has none yet.
        placeId: item.placeId,
        placeName: item.location || item.title,
        city: destination,
        country: destinationCountry,
      })
        .then(info => { setCommerce(current => (current[item.id] === undefined ? { ...current, [item.id]: info } : current)); })
        .catch(() => { setCommerce(current => (current[item.id] === undefined ? { ...current, [item.id]: null } : current)); });
    });
  }, [dayCards.map(item => `${item.id}:${item.placeId || ''}`).join('|'), destination, destinationCountry]);

  const getIcon = (type: ItineraryItem['type']) => {
    switch (type) {
      case 'FLIGHT': return <Plane size={16} />;
      case 'HOTEL': return <Hotel size={16} />;
      case 'FOOD': return <Utensils size={16} />;
      case 'ACTIVITY': return <Ticket size={16} />;
      case 'TRANSPORT': return <Car size={16} />;
      default: return <Clock size={16} />;
    }
  };

  const getDotColor = (type: ItineraryItem['type']) => {
    switch (type) {
      case 'FLIGHT': return 'bg-sky-500';
      case 'HOTEL': return 'bg-rose-500';
      case 'FOOD': return 'bg-amber-500';
      case 'ACTIVITY': return 'bg-indigo-500';
      case 'TRANSPORT': return 'bg-slate-500';
      default: return 'bg-gray-500';
    }
  };

  /** One itinerary card. Shared by the timed blocks and the untimed section. */
  const renderCard = (item: ItineraryItem) => (
            <div className="relative">
              
              <div className="rounded-[20px] border border-[#ecebf5] bg-white p-3.5 shadow-[0_10px_26px_rgba(17,26,74,0.06)]">
                {/*
                  Wraps rather than overflows.

                  ?overflow=1 named four elements past the right edge of a
                  393px screen: a span reading 「ACTIVITY」 and three 1px circles,
                  which are the three dots of the ⋯ button. All four are this
                  one row — a drag handle, two 74px time fields, a pin, a type
                  badge and a menu, adding up to more than the phone with
                  nothing allowed to give.

                  Neither group could shrink and the row could not wrap, so it
                  simply ran off, and the page ran off with it. Letting the
                  action group drop to a second line costs a few pixels of
                  height on a narrow phone and loses nothing.
                */}
                <div className="mb-1 flex flex-wrap items-center justify-between gap-y-1">
                  <div className="flex min-w-0 items-center gap-2">
                    {isFixedItem(item) ? (
                      // A fixed event is not casually draggable: changing a
                      // flight is an explicit edit, not a list gesture.
                      <span
                        data-testid={`fixed-badge-${item.id}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#11183d] px-1.5 py-0.5 text-[9px] font-black text-white"
                      >
                        <Lock size={9} />
                        {fixedKindOf(item) === 'flight' ? t('itinerary.fixedFlight')
                          : fixedKindOf(item) === 'train' ? t('itinerary.fixedTrain')
                          : fixedKindOf(item) === 'reservation' ? t('itinerary.fixedReservation')
                          : fixedKindOf(item) === 'accommodation' ? t('itinerary.fixedStay')
                          : t('itinerary.fixedTime')}
                      </span>
                    ) : onReorder && (
                      <button
                        type="button"
                        aria-label={t('itinerary.dragToReorder', { title: item.title })}
                        // touch-none keeps a drag from scrolling the page; the
                        // handle is the only draggable surface, so tapping the
                        // card, 完成 or the overflow menu still behaves normally.
                        className="-ml-1 cursor-grab touch-none rounded-lg p-1 text-slate-300 hover:bg-[#f3f0ff] hover:text-[#5b3df5]"
                        onPointerDown={event => {
                          event.preventDefault();
                          (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
                          setDragStartY(event.clientY);
                          setPreviewMinutes(null);
                          setDragItemId(item.id);
                          setOverIndex(dayItems.findIndex(entry => entry.id === item.id));
                        }}
                        onPointerMove={handleDragMove}
                        onPointerUp={handleDragEnd}
                      >
                        <GripVertical size={14} />
                      </button>
                    )}
                    <span className="text-[#6b4df6]">{getIcon(item.type)}</span>
                    {/*
                      The time, editable where it is shown.

                      「拖曳時間不方便」 — dragging moves a card in 30-minute steps,
                      which is fine for nudging a day along and useless for
                      「這家店 11:20 才開」. The date beside it has been a real
                      input all along; the time was text you could only change by
                      dragging or by opening the edit sheet. A native time input
                      hands the job to the phone's own picker.

                      Anchor-derived cards stay read-only: their time comes from
                      the flight, and editing it here would be overwritten the
                      next time the anchor rebuilt.
                    */}
                    {item.derivedFromFlightAnchorId ? (
                      <span className="font-mono text-xs font-black text-[#6b4df6]">{item.time}</span>
                    ) : (
                      <span className="flex items-center gap-0.5">
                        <input
                          type="time"
                          value={item.time || ''}
                          aria-label={t('itinerary.startTimeOf', { title: item.title })}
                          data-testid={`time-input-${item.id}`}
                          onChange={event => {
                            /*
                              Through the same path a drag takes.

                              「後面行程就需要回避掉已經被 book 的時間」 — dragging a
                              card has always carried the rest of the day with it,
                              preserving the gaps. Writing the time straight onto
                              the item would have made the picker the one way to
                              create an overlap, which is the opposite of the point.
                            */
                            const next = timeToMinutes(event.target.value);
                            if (next === undefined) return;
                            if (onRescheduleItem) onRescheduleItem(item.id, next);
                            else onUpdateItem(item.id, { time: event.target.value });
                          }}
                          className="w-[4.6rem] rounded-lg bg-transparent px-1 py-0.5 font-mono text-xs font-black text-[#6b4df6] outline-none hover:bg-[#f3f0ff] focus:bg-[#f3f0ff]"
                        />
                        <span className="text-[10px] font-bold text-slate-300">–</span>
                        {/*
                          The end, which is the duration said in the way people
                          think about it. 「每個行程起訖時間都要可以填寫 目前只有起的
                          時間 若沒有填寫訖的時間一律以 60 分鐘為主」 — the 60 was
                          already the assumption; it was simply never shown, so a
                          day could not be read and the overlap warnings came out
                          of nowhere.
                        */}
                        <input
                          type="time"
                          value={endTimeOf(item)}
                          aria-label={t('itinerary.endTimeOf', { title: item.title })}
                          data-testid={`end-time-input-${item.id}`}
                          onChange={event => {
                            const minutes = durationFromEnd(item.time, event.target.value);
                            if (minutes === undefined) return;
                            // Later cards get out of the way of the longer span.
                            if (onChangeDuration) onChangeDuration(item.id, minutes);
                            else onUpdateItem(item.id, { durationMinutes: minutes });
                          }}
                          className={`w-[4.6rem] rounded-lg bg-transparent px-1 py-0.5 font-mono text-xs font-black outline-none hover:bg-[#f3f0ff] focus:bg-[#f3f0ff] ${
                            typeof item.durationMinutes === 'number' && item.durationMinutes > 0
                              ? 'text-[#6b4df6]'
                              : 'text-slate-400'
                          }`}
                        />
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {onTogglePin && (
                      // Pinning protects the item from AI adjustment only; the
                      // overflow menu still edits and deletes it by hand.
                      <button
                        type="button"
                        data-testid={`pin-toggle-${item.id}`}
                        aria-pressed={item.isPinned === true}
                        aria-label={item.isPinned ? t('itinerary.unpinItem', { title: item.title }) : t('itinerary.pinItem', { title: item.title })}
                        title={item.isPinned ? t('itinerary.unpin') : t('itinerary.pin')}
                        onClick={() => onTogglePin(item.id, item.isPinned !== true)}
                        className={`inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[9px] font-black ${
                          item.isPinned
                            ? 'bg-[#f0edff] text-[#5b3df5]'
                            : 'text-slate-300 hover:bg-[#f3f0ff] hover:text-[#5b3df5]'
                        }`}
                      >
                        {item.isPinned ? <Pin size={11} fill="currentColor" /> : <PinOff size={11} />}
                        {item.isPinned && <span data-testid={`pinned-label-${item.id}`}>{t('itinerary.pinned')}</span>}
                      </button>
                    )}
                    {/*
                      「像這個景點，若需要買票，就要在行程上提醒用戶」.

                      The 門票 / 預約 block has carried this fact for a while, at
                      the bottom of an expanded card and worded as an offer —
                      「查看最新票價」. That is a place to look something up, not a
                      reminder that something has to be done before leaving.
                      Said here, where a day is scanned.
                    */}
                    {commerce[item.id]?.admissionRequired === true && (
                      <span
                        data-testid={`needs-ticket-${item.id}`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f0edff] px-2 py-0.5 text-[9px] font-black text-[#5b3df5]"
                      >
                        <Ticket size={9} />{commerce[item.id]?.advanceBookingRequired === true ? t('itinerary.bookAhead') : t('itinerary.ticketNeeded')}
                      </span>
                    )}
                    <span className="shrink-0 rounded-full border border-[#eeeefa] bg-[#fafaff] px-2 py-0.5 text-[9px] font-bold text-slate-400">{item.type}</span>
                    {(onEdit || onDelete) && <div className="relative">
                      <button type="button" onClick={() => setMenuItemId(current => current === item.id ? null : item.id)} aria-label={t('itinerary.moreOptionsFor', { title: item.title })} aria-expanded={menuItemId === item.id} className="rounded-lg p-2 text-slate-300 transition hover:bg-[#f3f0ff] hover:text-[#5b3df5]"><MoreHorizontal size={16} /></button>
                      {menuItemId === item.id && <div className="absolute right-0 top-10 z-20 w-44 rounded-2xl border border-slate-100 bg-white p-1.5 text-left shadow-xl">
                        {onEdit && !item.derivedFromFlightAnchorId && <button type="button" onClick={() => { setMenuItemId(null); onEdit(item); }} className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-violet-50">{t('itinerary.editItem')}</button>}
                        {/* Editing here writes to an item the anchor owns and
                            rebuilds, so the entry points at the anchor instead. */}
                        {onEdit && item.derivedFromFlightAnchorId && <p className="px-3 py-2 text-[11px] font-bold text-slate-400">{t('itinerary.flightTimeElsewhere')}</p>}
                        {onDelete && <button type="button" onClick={() => { setMenuItemId(null); setRemoveTarget(item); }} className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50">{t('itinerary.deleteItem')}</button>}
                      </div>}
                    </div>}
                  </div>
                </div>

                {onUpdateItem && <div className="mb-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                  {/*
                    A flight's date belongs to the flight, not to this card.
                    These two items are re-derived from the anchor whenever it
                    changes, so an edit here would be accepted, look saved, and
                    silently revert. Showing the date read-only and naming
                    where it can actually be changed is the honest version.
                  */}
                  {item.derivedFromFlightAnchorId ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                      {t('summary.colDate')}
                      <span className="rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] text-slate-500">
                        {item.date ? item.date.replace(/-/g, '/') : '—'}
                      </span>
                      <span className="text-[10px] font-bold text-slate-300">{t('itinerary.editInFlightInfo')}</span>
                    </span>
                  ) : (
                    <label className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                      {t('summary.colDate')}
                      <input type="date" value={item.date || ''} min={startDate || undefined} max={endDate || undefined} onChange={event => onUpdateItem(item.id, { date: event.target.value || undefined })} className="min-w-0 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-600" />
                    </label>
                  )}
                  {!item.date && !item.derivedFromFlightAnchorId && <span className="text-[10px] font-bold text-slate-400">{t('itinerary.noDateYet')}</span>}
                  <label className="ml-auto flex items-center gap-1 text-[10px] font-bold text-slate-400">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded accent-[#5b3df5]" checked={item.isCompleted === true} onChange={event => onUpdateItem(item.id, { isCompleted: event.target.checked })} /> {t('common.done')}
                  </label>
                </div>}
                
                <div className="flex items-start gap-3">
                  <div className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#f3f0ff] text-[#6b4df6]">
                    {(() => {
                      /* The place's own photo, or the airport's. See `fetchAirportPhoto`. */
                      const photo = item.placeId
                        ? photos[item.placeId]
                        : item.derivedFromFlightAnchorId
                          ? airportPhotos[(item.location || '').trim()]
                          : null;
                      const asked = Boolean(item.placeId)
                        || Boolean(item.derivedFromFlightAnchorId && (item.location || '').trim());
                      if (photo?.imageUrl) {
                        return <>
                          <img src={photo.imageUrl} alt="" className="h-full w-full object-cover" />
                          {photo.attribution?.uri && <a href={photo.attribution.uri} target="_blank" rel="noreferrer" aria-label={t('itinerary.photoSource')} className="absolute bottom-1 right-1 rounded bg-black/55 p-0.5 text-white"><Info size={10} /></a>}
                        </>;
                      }
                      // Still looking: the icon would say 「there is none」.
                      if (asked && photo === undefined) return <ImageIcon size={22} className="animate-pulse opacity-50" />;
                      return getIcon(item.type);
                    })()}
                  </div>
                  <div className="min-w-0 flex-1">
                    {/*
                      The place on the plan opens like the place on the list.

                      「目前行程也要點擊後讓用戶看到小卡 另外，地址要可以一鍵複製」.
                      The address was printed here and nothing more, so getting
                      to it meant selecting grey 10px text on a phone — or
                      retyping a Busan street address into another app.

                      Same card as the collection uses, deliberately: a place is
                      a place, and a second one would drift from this one.
                    */}
                    {/*
                      Which part of the city this is, in the colour that area
                      wears everywhere else.

                      「讓用戶知道大行程在哪區」 — a day reads as a sequence of names
                      until the colours show that two of them are the same
                      afternoon and the third is forty minutes away.
                    */}
                    {(() => {
                      const area = areas?.areaOfItem(item.id);
                      return area ? (
                        <span
                          data-testid={`item-area-${item.id}`}
                          className={`mb-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-black ${AREA_COLORS[area.colorIndex % AREA_COLORS.length].soft}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${AREA_COLORS[area.colorIndex % AREA_COLORS.length].dot}`} />
                          {area.label}
                        </span>
                      ) : null;
                    })()}
                    <button
                      type="button"
                      data-testid={`open-itinerary-place-${item.id}`}
                      onClick={() => setOpenPlaceItemId(item.id)}
                      className="block w-full text-left"
                    >
                      <h4 className="mb-1 text-base font-black leading-tight text-[#111A4A]">{item.title}</h4>
                      {item.location && <span className="flex items-start gap-1 text-xs font-semibold text-slate-600"><MapPin size={11} className="mt-0.5 shrink-0 text-[#6b4df6]" />{item.location}</span>}
                      {item.address && <span className="mt-1 block pl-4 text-[10px] font-medium leading-snug text-slate-400">{item.address}</span>}
                    </button>
                    {/*
                      An item no map knows. 「廣安里海景早午餐咖啡廳」 is a
                      description, not a business, so it has no address, no photo
                      and no hours — and until now it looked like an ordinary card
                      that happened to be missing them. The repair already exists
                      inside the edit sheet; this is what says it is needed.
                    */}
                    {!item.placeId && !item.derivedFromFlightAnchorId && (
                      <div data-testid={`unlinked-place-${item.id}`} className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-bold leading-4 text-amber-700">
                        <AlertTriangle size={11} className="shrink-0" />
                        <span className="min-w-0 flex-1">{t('itinerary.notOnMap')}</span>
                        {onEdit && (
                          <button type="button" onClick={() => onEdit(item)} className="shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-black text-amber-700 shadow-sm">
                            {t('itinerary.linkPlace')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                {item.notes && (
                  <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] italic text-slate-400">
                    {item.notes}
                  </p>
                )}

                {/*
                  Travel notes the user saved on this place, shown only when the item
                  actually came from that saved place. Kept visually secondary to the
                  time, name and location, and capped so a heavily-noted place cannot
                  stretch the card.
                */}
                {/*
                  What is known about a place nobody wrote anything about.

                  「這是從收藏放上來的店 是不是要將收藏筆記也顯示在行程表上」 — the
                  notes were already here, and Lonich simply has none, so its
                  card read as a name over a blank. The collection screen solved
                  that months ago with `placeBasics`; this screen never got it.
                  Same gap, one screen either side of it.

                  No extra request: `fetchPlaceBasics` is cached per place id,
                  and these are places the collection has usually asked about
                  already.
                */}
                {(!item.savedTravelNotes || item.savedTravelNotes.length === 0)
                  && (summarizePlaceBasics(basicsByItemId[item.id] || null) || basicsByItemId[item.id]?.summary) && (
                  <p data-testid={`item-basics-${item.id}`} className="mt-1.5 text-[11px] font-bold text-slate-500">
                    {summarizePlaceBasics(basicsByItemId[item.id] || null) || basicsByItemId[item.id]?.summary}
                  </p>
                )}

                {/*
                  The hours for the day this stop is actually on.

                  Not today's. A museum open today and shut on the Monday he
                  has it planned for is the case worth catching, and
                  「10:00–18:00」 beside that Monday is a reassuring lie.
                  See `hoursForDate`.
                */}
                {(() => {
                  const hours = hoursForDate(basicsByItemId[item.id] || null, item.date);
                  if (!hours) return null;
                  /*
                    「因此要提醒用戶」.

                    Printing the hours puts the fact on the card and still
                    leaves somebody comparing two clocks, on every card, for
                    every day. The comparison is arithmetic. See
                    `outsideOpeningHours`, which stays quiet about everything
                    it cannot be sure of.
                  */
                  const problem = outsideOpeningHours(hours, item.time, item.durationMinutes);
                  const warning = problem === 'closed-day' ? t('itinerary.warnClosedDay')
                    : problem === 'before-opening' ? t('itinerary.warnBeforeOpening')
                    : problem === 'after-closing' ? t('itinerary.warnAfterClosing')
                    : '';
                  return (
                    <p
                      data-testid={`item-hours-${item.id}`}
                      className={`mt-1 flex items-start gap-1 text-[11px] font-bold leading-4 ${
                        warning ? 'text-rose-600' : 'text-slate-500'
                      }`}
                    >
                      <Clock3 size={11} className="mt-0.5 shrink-0" />
                      <span>{warning ? `${warning}・${hours}` : hours}</span>
                    </p>
                  );
                })()}
                {item.savedTravelNotes && item.savedTravelNotes.length > 0 && (() => {
                  const isExpanded = expandedNoteIds.includes(item.id);
                  const visible = isExpanded ? item.savedTravelNotes : item.savedTravelNotes.slice(0, VISIBLE_NOTE_COUNT);
                  const hidden = item.savedTravelNotes.length - visible.length;
                  return (
                    <div className="mt-2 rounded-xl border-t border-slate-100 bg-[#faf9ff] px-2.5 py-2">
                      <div className="flex items-center gap-1 text-[10px] font-black text-[#6b4df6]"><NotebookPen size={11} />{t('itinerary.travelNotes')}</div>
                      <ul className="mt-1 space-y-1">
                        {visible.map(note => (
                          <li key={note.id} className="flex items-start gap-1.5 text-[11px] leading-5 text-slate-600">
                            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-violet-300" />
                            <span className="min-w-0 flex-1 break-words">{note.text}</span>
                          </li>
                        ))}
                      </ul>
                      {(hidden > 0 || isExpanded) && (
                        <button
                          type="button"
                          onClick={() => setExpandedNoteIds(current => isExpanded ? current.filter(id => id !== item.id) : [...current, item.id])}
                          className="mt-1 text-[10px] font-black text-[#6b4df6]"
                        >
                          {isExpanded ? t('home.collapse') : t('itinerary.seeAllNotes', { count: item.savedTravelNotes!.length })}
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/*
                  Ticket / booking, shown only for a place that actually charges
                  admission. A free beach renders nothing at all rather than an
                  empty section, and a place we know nothing about is also silent.
                */}
                {hasDisplayableCommerce(commerce[item.id]) && (() => {
                  const info = commerce[item.id]!;
                  return (
                    <div className="mt-2 rounded-xl border border-[#eceaf5] bg-white px-2.5 py-2">
                      <div className="flex items-center gap-1 text-[10px] font-black text-slate-500"><Ticket size={11} className="text-[#6b4df6]" />{t('itinerary.ticketsAndBookings')}</div>

                      {/*
                        「若需要買票，就要在行程上提醒用戶」.

                        Kept apart from the price slot below on purpose. 「this
                        needs a ticket」 and 「we have no verified price」 are two
                        different facts, and the section only ever stated the
                        second — 「查看最新票價」 is somewhere to look something up,
                        not a thing to do before leaving.
                      */}
                      {info.admissionRequired === true && (
                        <div
                          data-testid={`admission-required-${item.id}`}
                          className="mt-1 text-[11px] font-black leading-4 text-[#5b3df5]"
                        >
                          {info.advanceBookingRequired === true
                            ? t('itinerary.bookAheadBlurb')
                            : t('itinerary.ticketNeededBlurb')}
                        </div>
                      )}

                      <div className="mt-1.5">
                        {info.officialPrice ? (
                          <>
                            {/* Source and check date travel with every number shown. */}
                            <div className="text-[10px] font-bold text-slate-400">
                              {info.officialPrice.label ? t('itinerary.officialPriceLabelled', { label: info.officialPrice.label }) : t('itinerary.officialPrice')}
                              {' · '}{t('itinerary.updatedOn', { date: info.officialPrice.checkedAt.replace(/-/g, '/') })}
                            </div>
                            <div className="text-sm font-black text-[#111A4A]">
                              {formatPrice(info.officialPrice.amount, info.officialPrice.currency)}
                            </div>
                          </>
                        ) : (
                          // No current verified price, so no number at all — never ₩0,
                          // never "unknown", never an estimate.
                          <div className="text-xs font-bold text-slate-500">{t('itinerary.seeLatestPrice')}</div>
                        )}
                      </div>

                      {info.notes && info.notes.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {info.notes.map(note => (
                            <li key={note} className="flex items-start gap-1.5 text-[10px] leading-4 text-slate-500">
                              <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                              <span className="min-w-0 flex-1 break-words">{note}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {info.bookingOptions && info.bookingOptions.length > 0 && (
                        <>
                          <div className="mt-2 text-[10px] font-black text-slate-400">
                            {t('itinerary.buyOrCheckPrice')}
                            {/*
                              Disclosure, beside the links it is about.

                              Required wherever a commission is earned, and the
                              server marks the individual links rather than the
                              card guessing. Absent entirely until somebody has
                              signed up — see `affiliateLinks`.
                            */}
                            {info.bookingOptions.some(option => option.affiliate) && (
                              <span data-testid="affiliate-disclosure" className="ml-1 font-bold text-slate-400">
                                {t('itinerary.affiliateNote')}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {info.bookingOptions.map(option => (
                              <a
                                key={`${option.provider}:${option.url}`}
                                href={option.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#eceaf5] bg-[#fafaff] px-2.5 text-[11px] font-black text-[#5b3df5]"
                              >
                                {option.label}
                                {/*
                                  The label states exactly what is on the other
                                  side: a product page can show a price, a search
                                  result can only be searched.
                                */}
                                <span className="font-bold text-slate-400">
                                  {option.urlType === 'search' ? t('home.search') : t('itinerary.seePrice')}
                                </span>
                              </a>
                            ))}
                          </div>
                        </>
                      )}

                      <div className="mt-1.5 text-[9px] font-bold text-slate-300">
                        {info.officialPrice
                          ? (
                            <>
                              {t('itinerary.priceSource')}
                              <a href={info.officialPrice.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">
                                {info.officialPrice.sourceName}
                              </a>
                              {t('itinerary.officialPriceWins')}
                            </>
                          )
                          : <>{t('itinerary.officialAndPlatformsWin')}</>}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
  );

  return (
    <div className="rounded-[28px] border border-[#e9e9f5] bg-white p-4 shadow-[0_14px_38px_rgba(17,26,74,0.07)] sm:p-5">
      {/*
        Stacked on a phone, side by side from `sm` up.
        
        This was one row at every width. On a 393px screen the title kept its
        space and the buttons were squeezed until 「新增行程」 broke to one
        character per line — a button rendered as a vertical column of glyphs.
        `whitespace-nowrap` and `shrink-0` stop a label being taken apart; the
        stack is what gives it room in the first place.
      */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#6b4df6]">ITINERARY</p><h2 className="mt-1 text-xl font-black text-[#111A4A]">{t('itinerary.title')}</h2><p className="mt-1 text-xs text-slate-400">{t('itinerary.subtitle')}</p></div>
        <div className="flex shrink-0 items-center gap-2">{onAdd && <button type="button" onClick={() => onAdd(activeDate)} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-[#2F5BFF] to-[#8B3DFF] px-3 py-2 text-xs font-black text-white shadow-[0_6px_14px_rgba(91,61,245,.16)]"><Plus size={14} />{t('itinerary.addItem')}</button>}<button type="button" data-testid="toggle-map-mode" aria-pressed={mapMode} onClick={() => setMapMode(value => !value)} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold shadow-sm ${mapMode ? 'bg-gradient-to-r from-[#2F5BFF] to-[#8B3DFF] text-white' : 'border border-[#eceaf5] bg-white text-[#5b3df5]'}`}>{mapMode ? <List size={14} /> : <Map size={14} />}{mapMode ? t('itinerary.listMode') : t('itinerary.mapMode')}</button>{onUpdateItem && (
          /*
            「那 AI 要像一個規劃人員重新幫我想行程 動線才對」. Nothing is written
            until the preview is confirmed — this rewrites days the traveller
            arranged, and 「除非我按下固定的行程」 is the only promise it makes
            about what it will not touch. See `optimiseTripRoute`.
          */
          <button
            type="button"
            data-testid="optimise-route"
            onClick={() => planRoute('trip')}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#eceaf5] bg-white px-3 py-2 text-xs font-bold text-[#5b3df5] shadow-sm"
          >
            <Sparkles size={14} />{t('itinerary.optimiseRoute')}
          </button>
        )}<button type="button" aria-label={t('itinerary.moreOptions')} className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-[#f3f0ff] hover:text-[#5b3df5]"><MoreHorizontal size={17} /></button></div>
      </div>
      {dates.length > 0 && <div className="mb-5 flex gap-2 overflow-x-auto pb-1">{dates.map((date, index) => {
        /*
          A day that has already happened.

          「已經經過的日期 要變成灰色的」 — on 10/04 the first two tabs looked exactly
          like the days still ahead, so the part of the trip that is still a
          decision was indistinguishable from the part that is now a record.

          Still tappable: the plan for a day gone is where its photos, its notes
          and its spending are read back from.
        */
        const isPast = date < today;
        return <button type="button" key={date} ref={node => { dayTabRefs.current[date] = node; }} onClick={() => setSelectedDate(date)} aria-label={`Day ${index + 1}`} data-testid={`day-tab-${date}`} data-past={isPast ? 'true' : undefined} data-drop-day={date} className={`relative min-w-[84px] rounded-[18px] border px-3.5 py-3 text-left transition ${overDate === date ? 'border-[#6b4df6] bg-[#ece7ff] ring-2 ring-[#b9adff]' : dragItemId && date !== activeDate ? 'border-dashed border-[#b9adff] bg-white' : activeDate === date ? 'border-[#b9adff] bg-[#f4f1ff] text-[#4f35d7] shadow-[0_8px_18px_rgba(91,61,245,.12)]' : isPast ? 'border-[#eef1f5] bg-[#f6f7f9] text-slate-400 opacity-60' : 'border-[#edf0f6] bg-white text-slate-500 shadow-[0_3px_10px_rgba(17,26,74,.03)]'}`}><span className={`mb-2 block h-1.5 w-1.5 rounded-full ${activeDate === date ? 'bg-[#6b4df6]' : isPast ? 'bg-slate-300' : 'bg-slate-200'}`} /><span className="block text-[11px] font-black">Day {index + 1}</span><span className="mt-1 block text-xs font-bold">{date.slice(5).replace('-', '/')}</span>{/*
      「這邊要有星期幾」 — and which day is a Monday decides whether half the
      museums on it are open. The cards below say 「這天公休」; the tabs could
      not say which day was even at risk. See `weekdayOf`.
    */}<span className="mt-0.5 block text-[10px] font-bold opacity-70">{weekdayOf(date)}</span>{(() => {
      // A suggestion sitting on another day is invisible from here otherwise.
      const count = (pendingSuggestions || []).filter(suggestion => (suggestion.date ? suggestion.date === date : date === dates[0])).length;
      return count > 0 ? <span data-testid={`suggestion-badge-${date}`} className="absolute right-2 top-2 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-black text-white">{count}</span> : null;
    })()}</button>;
      })}</div>}

      {/*
        Whether today's travel actually works, on one tap.

        「最後再確認行程時，可以一鍵點選AI確認當日行程的交通規劃是否順暢」. Not gated
        on the collection the block planner needs: checking the day you have is
        a different question from building the day you do not.
      */}
      {activeDate && (
        <DayTransportCheck
          date={activeDate}
          items={timedItems}
          areas={areas}
          destinationCountry={destinationCountry}
          /*
            The same optimiser the header offers, opened from the advice that
            asks for it. 「點擊優化行程」 — one arrangement of a day, shown before
            it is written, rather than a second one that writes immediately.
          */
          /* The advice is about one day, so the plan it opens is too. */
          onOptimise={() => planRoute(activeDate || 'trip')}
        />
      )}

      {/*
        The day as blocks, above the day as cards.

        「我們根本無法用行程表的這個功能」 — the timeline below shows what the day
        is; this is where it gets built. Both read the same items, because a
        filled block is an item: a second store of 「the day's blocks」 would be
        a second answer to 「what is at 14:00」.
      */}
      {savedPlaces && onFillBlock && activeDate && (
        <DayBlockPlanner
          date={activeDate}
          items={timedItems}
          fixedSchedule={fixedAnchorSchedule(items)}
          country={destinationCountry}
          places={savedPlaces}
          areas={areas}
          isFixed={isFixedItem}
          /* The caller's answer is passed back through: see `replaceInSlot`. */
          onFillBlock={(slot, placeGroupId) => onFillBlock({
            date: activeDate,
            time: slot.startTime,
            durationMinutes: slot.durationMinutes,
            placeGroupId,
          })}
          onFillBlockManually={onFillBlockManually ? (slot, title) => onFillBlockManually({
            date: activeDate,
            time: slot.startTime,
            durationMinutes: slot.durationMinutes,
            title,
          }) : undefined}
          onChangeDuration={onChangeDuration ? (itemId, minutes) => { onChangeDuration(itemId, minutes); } : undefined}
          /*
            「選項也要有一個無」 — the way back to an empty block. The same
            deletion the card's own menu performs, so there is one answer to
            「this is no longer on the plan」 rather than two.
          */
          onClearBlock={onDelete}
          /*
            「要有『無』的選項」 on an empty row — a gap decided against, so the
            suggestions stop being offered under it.
          */
          emptiedSlotIds={emptiedSlotIds}
          onToggleEmptied={onToggleEmptied}
          /* The pin is undone from where its effect is visible. */
          onUnpin={onTogglePin ? (itemId) => onTogglePin(itemId, false) : undefined}
          /* So a meal row can ask whether a café was really meant as dinner. */
          categoryOf={categoryOf}
          /*
            「上下箭頭去移動排序」. A swap of clock times, so each stop keeps its
            own length and the day re-lays around them — the same change
            `mealsAtMealtimes` makes, and the only one that cannot lose a slot.
          */
          onSwapBlocks={onUpdateItem ? (firstId, secondId) => {
            const first = items.find(entry => entry.id === firstId);
            const second = items.find(entry => entry.id === secondId);
            if (!first?.time || !second?.time) return;
            onUpdateItem(firstId, { time: second.time });
            onUpdateItem(secondId, { time: first.time });
          } : undefined}
          /* Into an empty row: the stop simply takes that row's hour. */
          onShiftBlock={onUpdateItem ? (itemId, startTime) => onUpdateItem(itemId, { time: startTime }) : undefined}
          /*
            Written one item at a time through the path that already persists a
            time change — the same one the inline time field uses. 「橘色處調 紅色
            處是不是就要調」 moves the whole day, but it is not a new kind of
            write, and a second writer would be a second thing to keep in step.
          */
          onShiftDay={onUpdateItem ? (shifted) => {
            // A plain record, not a Map: `Map` in this file is lucide's icon.
            const before: Record<string, string | undefined> = {};
            items.forEach(entry => { before[entry.id] = entry.time; });
            shifted.forEach(entry => {
              if (before[entry.id] !== entry.time) onUpdateItem(entry.id, { time: entry.time });
            });
          } : undefined}
        />
      )}

      {/*
        The arranged order no longer reads chronologically. The times are shown
        as they are — never silently rewritten — with an explicit way to fix them.
      */}
      {outOfOrder && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2.5 text-xs font-bold leading-5 text-amber-700">
          <span className="min-w-0 flex-1">{t('itinerary.orderMismatch')}</span>
          {/*
            Two different answers, both offered. 「順序還是錯 第一個怎麼會是四
            點」 — the banner only had the one that rewrites the clocks to match
            the cards, which is the opposite of what he meant. Which of the two
            a traveller wants is not something to guess from a list that
            disagrees with itself.
          */}
          {onSortByTime && (
            <button
              type="button"
              data-testid="sort-day-by-time"
              onClick={() => onSortByTime(activeDate)}
              className="shrink-0 rounded-xl bg-white px-2.5 py-1 text-[11px] font-black text-amber-700 shadow-sm"
            >
              {t('itinerary.reorderByTime')}
            </button>
          )}
          {onResequenceTimes && (
            <button
              type="button"
              onClick={() => onResequenceTimes(activeDate)}
              className="shrink-0 rounded-xl bg-white px-2.5 py-1 text-[11px] font-black text-amber-700 shadow-sm"
            >
              {t('itinerary.retimeItems')}
            </button>
          )}
        </div>
      )}

      {/*
        A fixed event has made this day impossible as it stands. The user is told
        plainly, and nothing changes until they choose to look and apply.
      */}
      {needsAdjustment && dismissedSummary !== adjustment.summary && (
        <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-black text-amber-800">
                {/*
                  「這天明明沒有航班但他會寫說有航班」. The heading was a constant,
                  so a day rearranged around a lunch he had pinned announced a
                  flight. It is named by what the day is actually built around
                  now — see `aboutTheFixedItem`.
                */}
                {adjustment.unresolved.length > 0 ? t('itinerary.twoFixedConflict') : adjustment.headline}
              </div>
              {/*
                The heading already says there is a conflict. Repeating the
                same sentence underneath it — which is what `summary` held —
                said nothing twice while leaving the traveller to work out
                which two of six cards were fighting.
              */}
              {adjustment.unresolved.length > 0 ? (
                <div className="mt-0.5 text-[11px] leading-5 text-amber-700">
                  {describeUnresolvedConflicts(adjustment.unresolved, items)}
                </div>
              ) : (
                <div className="mt-0.5 text-[11px] leading-5 text-amber-700">{adjustment.summary}</div>
              )}
              {adjustment.warnings.map(warning => (
                <div key={warning} className="mt-1 text-[11px] font-bold leading-5 text-amber-700">⚠ {warning}</div>
              ))}
              {adjustment.unresolved.length > 0 && (
                <div className="mt-1 text-[11px] leading-5 text-amber-700">
                  {t('itinerary.fixedNotAutoAdjusted')}
                </div>
              )}
            </div>
          </div>
          {adjustment.changes.length > 0 && (
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="min-h-9 flex-1 rounded-xl bg-white px-3 text-xs font-black text-amber-700 shadow-sm"
              >
                {t('itinerary.seeAdjustment')}
              </button>
              <button
                type="button"
                onClick={() => setDismissedSummary(adjustment.summary)}
                className="min-h-9 flex-1 rounded-xl px-3 text-xs font-bold text-amber-700"
              >
                {t('itinerary.later')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* The structured diff. Nothing is written until 套用調整. */}
      {previewOpen && adjustment.changes.length > 0 && (
        <div className="mb-3 rounded-2xl border border-[#eceaf5] bg-white p-4 shadow-sm">
          <div className="text-xs font-black text-[#11183d]">{t('itinerary.suggestedAdjustment')}</div>
          <div className="mt-2 space-y-2">
            {adjustment.changes.map(change => {
              const target = dayItems.find(entry => entry.id === change.itemId);
              return (
                <div key={change.itemId} data-testid={`adjust-${change.itemId}`} className="rounded-xl bg-[#faf9ff] px-3 py-2">
                  <div className="text-[11px] font-black text-[#11183d]">
                    {change.fromTime} {target?.title || ''}
                  </div>
                  <div className="mt-0.5 text-[11px] font-bold text-[#6b4df6]">
                    {change.type === 'move'
                      ? <>→ {change.toTime}</>
                      : <>{t('itinerary.movedTo', { date: change.toDate ? change.toDate.slice(5).replace('-', '/') : t('itinerary.anotherDay') })}</>}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-4 text-slate-500">{change.reason}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="min-h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (onApplyFixedAdjustment?.(adjustment)) setPreviewOpen(false);
              }}
              className="min-h-10 flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-3 text-xs font-black text-white shadow"
            >
              {t('itinerary.applyAdjustment')}
            </button>
          </div>
        </div>
      )}

      {lateNotice && (
        <div className="mb-3 rounded-2xl bg-amber-50 px-4 py-2.5 text-xs font-bold leading-5 text-amber-700">
          {t('itinerary.someItemsLater')}
        </div>
      )}

      {/*
        Where they sleep tonight, on every night of the stay.
        
        A booking produces a check-in card and a check-out card, which leaves
        every night in between — most of a trip — saying nothing about where
        the traveller is staying. This is derived from the same two cards, so
        it needs no extra data and stays true when either one is edited.
      */}
      {/*
        The two times the room decides, said as reminders.

        Beside the property rather than inside the day: 「入住與退房 不是一個行程
        是一個提醒事項」. They answer 「when do I have to be out」, which is a
        constraint on the day, not a place in it.
      */}
      {stayReminders.length > 0 && (
        <div data-testid="stay-reminders" className="mb-2 flex flex-wrap gap-1.5">
          {stayReminders.map(reminder => (
            <span
              key={reminder.id}
              data-testid={`stay-reminder-${reminder.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#ecebf5] bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-500"
            >
              <BedDouble size={12} className="shrink-0 text-[#5b3df5]" />
              {stayRoleOf(reminder) === 'check_out' ? t('itinerary.checkOut') : t('itinerary.checkIn')}
              <span className="font-mono text-[#6b4df6]">{reminder.time}</span>
            </span>
          ))}
        </div>
      )}

      {tonightsStay ? (
        <button
          type="button"
          data-testid="stay-banner"
          onClick={() => setStayDetail(tonightsStay)}
          className="mb-4 flex w-full items-center gap-3 rounded-[20px] border border-[#ecebf5] bg-white px-4 py-3 text-left shadow-[0_6px_18px_rgba(17,26,74,0.05)]"
        >
          {/*
            The name gets the room. The bed icon already says 住宿, so a text
            label beside it spends the width twice on the same word — and a
            property name is the part that is long and the part worth reading.
          */}
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f0edff] text-[#5b3df5]">
            <BedDouble size={17} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-black text-[#111A4A]">{tonightsStay.name}</span>
          <span className="shrink-0 rounded-xl border border-[#e8e7f4] px-2.5 py-1.5 text-[11px] font-black text-slate-500">
            {t('itinerary.details')}
          </span>
        </button>
      ) : stayRow === 'checked_out' ? (
        /*
          「最後一天的住宿資訊要寫成：今日退房」.

          The row had one empty state, and on the last day it was an invitation
          to book a room for a night the traveller is not there — directly
          under 退房 11:00, which had already said they were leaving.

          A statement, not a button: there is nothing here to do. It stays on
          the screen rather than disappearing, because a blank row reads as
          「住宿還沒填」 to somebody scanning the day.
        */
        <div
          data-testid="stay-banner-checked-out"
          className="mb-4 flex w-full items-center gap-3 rounded-[20px] border border-[#ecebf5] bg-white px-4 py-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f0edff] text-[#5b3df5]">
            <BedDouble size={17} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-black text-[#111A4A]">
            {CHECKED_OUT_LABEL}
          </span>
        </div>
      ) : activeDate && onAddStay ? (
        // A night with no room booked says so. Leaving the row blank makes an
        // unbooked night look identical to a booked one.
        //
        // Reached only when a night remains: somebody changing hotels on day
        // three checks out in the morning and has nothing booked too, and that
        // night is a real gap this row is the only thing to point at.
        <button
          type="button"
          data-testid="stay-banner-empty"
          onClick={onAddStay}
          className="mb-4 flex w-full items-center gap-3 rounded-[20px] border border-dashed border-[#d9d5f5] bg-[#fbfaff] px-4 py-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#a99df0]">
            <BedDouble size={17} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-black text-[#5b3df5]">{t('itinerary.addStayInfo')}</span>
          <span className="shrink-0 text-[11px] font-black text-slate-300">›</span>
        </button>
      ) : null}

      {/*
        A journey line, not a time axis: every card gets the same spacing however
        far apart the real times are. The time label belongs to its own row.
      */}
      <div
        aria-label={t('itinerary.timeline')}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={endDrag}
        className="relative"
      >
        {/*
          The day drawn, above the day listed.

          Kept above rather than instead of: the list is where times are
          edited, dragged and ticked, and a map that replaced it would take all
          of that away to show where the stops are.
        */}
        {mapMode && dayItems.length > 0 && (
          <div className="mb-4">
            {/*
              「住宿點的圖釘呢」 — the stay is a span over nights, not a stop on
              any one day, so a day with no 住宿 card drew no house. The one
              the day starts from, which is also where it ends on every night
              but a check-out. See `morningStay`.
            */}
            <DayMap
              items={previewItemsTimed ?? previewItems.filter(isTimedItem)}
              lodging={(() => {
                const stay = morningStay || tonightsStay;
                return stay && typeof stay.latitude === 'number' && typeof stay.longitude === 'number'
                  ? { name: stay.name, latitude: stay.latitude, longitude: stay.longitude }
                  : undefined;
              })()}
            />
          </div>
        )}
        {dayItems.length === 0 ? (
          <div className="rounded-[22px] border border-[#eeeaff] bg-[#faf9ff] px-5 py-10 text-center text-sm text-slate-500">
            <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#f0edff] text-[#6b4df6] shadow-inner"><CalendarDays size={27} strokeWidth={1.7} /><Sparkles className="absolute -right-1 -top-1 rounded-full bg-white p-1 text-[#8b3dff]" size={18} /></div><div className="font-black text-[#111A4A]">{activeDate ? t('itinerary.emptyThisDay') : t('itinerary.emptyNoPlan')}</div><div className="mx-auto mt-2 max-w-[240px] text-xs leading-relaxed text-slate-400">{t('itinerary.emptyHint')}</div>
          </div>
        ) : (
          <div className="space-y-3">
            {(previewItemsTimed ?? previewItems.filter(isTimedItem)).map((item, index, rendered) => (
              <React.Fragment key={item.id}>
              {/*
                Out of the hotel, to the first stop.

                Only before the first card of the day, and only while nothing is
                being dragged — mid-drag the first card is not yet the first
                card, and a leg redrawn on every pointer move would be a
                flicker rather than an answer.
              */}
              {index === 0 && !dragItemId && morningStay && (
                stayIsLocated(morningStay) && typeof item.latitude === 'number' && typeof item.longitude === 'number' ? (
                  <div data-testid={`morning-leg-${item.id}`}>
                    <p className="ml-[62px] mb-1 flex items-center gap-1 text-[10px] font-bold text-slate-400">
                      <BedDouble size={11} className="shrink-0" />{t('itinerary.departFrom', { name: morningStay.name })}
                    </p>
                    <TransportLeg
                    origin={{ latitude: morningStay.latitude!, longitude: morningStay.longitude!, title: morningStay.name }}
                    destination={{ latitude: item.latitude, longitude: item.longitude, title: item.title }}
                    destinationCountry={destinationCountry}
                    /*
                      No `availableMinutes` and no push-back.

                      Nothing before this leg has an end time — when they leave
                      the room is theirs to decide — so there is no gap to
                      measure and no earlier item to cascade from. Inventing a
                      departure time would be telling them they are late by a
                      clock they never set.
                    */
                    departureTime={activeDate ? new Date(`${activeDate}T${item.time}:00`).toISOString() : undefined}
                    />
                  </div>
                ) : (
                  <div
                    data-testid={`morning-leg-unavailable-${item.id}`}
                    className="ml-[62px] rounded-2xl border border-dashed border-[#e6e3f3] px-3 py-2 text-[10px] font-bold leading-4 text-slate-400"
                  >
                    {stayIsLocated(morningStay)
                      ? t('itinerary.firstStopNotLinked')
                      : t('itinerary.stayNotLinked', { name: morningStay.name })}
                  </div>
                )
              )}
              <div
                ref={node => { cardRefs.current[item.id] = node; }}
                data-item-id={item.id}
                data-start={item.time}
                data-collision={collidingIds.has(item.id) ? 'true' : 'false'}
                className={`relative flex gap-1.5 ${item.isCompleted ? 'opacity-60' : ''} ${dragItemId === item.id ? 'opacity-70 shadow-lg transition-transform' : ''}`}
              >
                {/* Insertion indicator: where the lifted card would land. */}
                {dragItemId && !overDate && overIndex === index && dragItemId !== item.id && (
                  <div data-testid="drop-indicator" className="absolute -top-1.5 left-[62px] right-0 h-0.5 rounded bg-[#6b4df6]" />
                )}

                {/*
                  Left: this row's own start time, and the journey line.

                  「這塊還是太大 要讓行程的版面更大」. The rail measures
                  40 + 6 + 10 + 6 = 62px, and seven blocks in this file already
                  hardcode `62px` to line up with it — they were written against
                  that number while the rail was actually 76px wide, so they all
                  hung 14px left of the cards they belong to. Changing this
                  arithmetic means changing those offsets with it.
                */}
                <div className="relative flex w-10 shrink-0 flex-col items-end pt-3.5">
                  <span className={`font-mono text-[11px] font-black ${dragItemId === item.id && previewMinutes !== null ? 'text-white' : 'text-[#6b4df6]'}`}>
                    {item.time}
                  </span>
                  {/* Floating preview: the time this drop would produce. */}
                  {dragItemId === item.id && previewMinutes !== null && (
                    <span
                      data-testid="drag-time-preview"
                      className="absolute -top-0.5 right-0 rounded-lg bg-[#6b4df6] px-1.5 py-0.5 font-mono text-[11px] font-black text-white shadow"
                    >
                      {minutesToTime(previewMinutes)}
                    </span>
                  )}
                  {item.durationMinutes ? (
                    <span className="mt-0.5 whitespace-nowrap text-[9px] font-bold text-slate-400">{t('itinerary.approxMinutes', { minutes: durationOf(item) })}</span>
                  ) : null}
                </div>
                <div className="relative w-2.5 shrink-0">
                  <span className={`absolute left-1/2 top-4 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white shadow-sm ${collidingIds.has(item.id) ? 'bg-rose-400' : 'bg-[#6b4df6]'}`} />
                  <span className="absolute left-1/2 top-7 bottom-[-12px] w-0.5 -translate-x-1/2 bg-[#ece9fb]" />
                </div>

                <div className={`min-w-0 flex-1 ${collidingIds.has(item.id) ? 'rounded-[20px] ring-2 ring-rose-200' : ''}`}>
                  {/*
                    A warning that says what it is.

                    「為何有紅框」 — the ring was drawn and never explained
                    anywhere on the screen, so the only way to find out what it
                    meant was to ask. A mark nobody can read is not a warning.
                  */}
                  {collidingIds.has(item.id) && (
                    <p
                      data-testid={`collision-note-${item.id}`}
                      className="mb-1.5 flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-bold leading-4 text-rose-600"
                    >
                      <AlertTriangle size={11} className="shrink-0" />
                      {describeCollision(item, timedItems)}
                    </p>
                  )}
                  {/*
                    Mine alone, said on the card.

                    Without it a personal item is indistinguishable from a joint
                    one on my own plan, and the choice I made when I wrote it
                    becomes invisible the moment I stop looking at the form.
                  */}
                  {isPersonal(item) && (
                    <p
                      data-testid={`personal-badge-${item.id}`}
                      className="mb-1.5 inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500"
                    >
                      <User size={11} className="shrink-0" />{OWN_PERSONAL_LABEL}
                    </p>
                  )}
                  {renderCard(item)}
                </div>
              </div>

              {/*
                How you get to the next place. Between the two cards, because
                that is where the journey happens and where the traveller looks
                when wondering whether the next start time is possible.
              */}
              {(() => {
                const next = rendered[index + 1];
                if (!next || dragItemId) return null;
                // Nothing to arrange between two halves of the same flight.
                // See `hasGroundJourneyBetween`.
                if (!hasGroundJourneyBetween(item, next)) return null;
                const from = typeof item.latitude === 'number' && typeof item.longitude === 'number' ? item : null;
                const to = typeof next.latitude === 'number' && typeof next.longitude === 'number' ? next : null;
                if (!from || !to) {
                  // Said rather than skipped: a missing leg would otherwise look
                  // like the app had nothing to say about a long hop.
                  return (
                    <div data-testid={`transport-unavailable-${item.id}`} className="ml-[62px] rounded-2xl border border-dashed border-[#e6e3f3] px-3 py-2 text-[10px] font-bold leading-4 text-slate-400">
                      {t('itinerary.onePlaceNotLinked')}
                    </div>
                  );
                }
                const leaveMinutes = timeToMinutes(item.time) + durationOf(item);
                const gap = timeToMinutes(next.time) - leaveMinutes;
                return (
                  <TransportLeg
                    origin={{ latitude: from.latitude!, longitude: from.longitude!, title: from.title }}
                    destination={{ latitude: to.latitude!, longitude: to.longitude!, title: to.title }}
                    availableMinutes={Number.isFinite(gap) && gap >= 0 ? gap : undefined}
                    destinationCountry={destinationCountry}
                    // Reuses the cascade a drag already performs: the next item
                    // starts when this journey ends, and everything after it on
                    // the day follows. A fixed event refuses, and says so.
                    onPushBackNext={onRescheduleItem
                      ? journeyMinutes => onRescheduleItem(next.id, leaveMinutes + journeyMinutes).ok
                      : undefined}
                    departureTime={activeDate ? new Date(`${activeDate}T${minutesToTime(leaveMinutes)}:00`).toISOString() : undefined}
                  />
                );
              })()}
              </React.Fragment>
            ))}
          </div>
        )}

        {/*
          What the other travellers are doing today.

          「你的朋友可以在他的行程表上看到你的行程」. Read-only and outside the
          timeline on purpose: it is information about somebody else's day, not
          a row of mine to drag, retime or delete. Inside the timeline it would
          take a block, trip the overlap warning, and invite me to edit a plan
          that is not mine.
        */}
        {companionItems.length > 0 && (
          <div data-testid="companion-itinerary" className="mt-4 rounded-[22px] border border-[#e8e7f4] bg-[#fbfaff] p-3">
            <h4 className="flex items-center gap-1.5 text-[11px] font-black text-slate-500">
              <Users size={12} className="text-slate-400" />{t('itinerary.companionOwnPlans')}
            </h4>
            <ul className="mt-2 space-y-1.5">
              {companionItems.map(item => (
                <li
                  key={item.id}
                  data-testid={`companion-item-${item.id}`}
                  className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-2.5 py-2"
                >
                  <span className="w-11 shrink-0 font-mono text-[11px] font-black text-slate-400">{item.time || '—'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-[#11183d]">{item.title || item.location}</span>
                    {item.location && item.title !== item.location && (
                      <span className="block truncate text-[10px] font-medium text-slate-400">{item.location}</span>
                    )}
                  </span>
                  <span className="shrink-0 rounded-lg bg-slate-100 px-1.5 py-1 text-[10px] font-bold text-slate-500">
                    {ownerLabelFor(item, members, viewerUserId)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/*
          The AI's suggestions for this day, sitting in the timeline where the
          plan is actually read. Green means proposed, not scheduled: ticking one
          is what writes it, and it writes only that one.
        */}
        {daySuggestions.length > 0 && (
          <div data-testid="pending-suggestions" className="mt-3 space-y-3">
            <div className="flex items-center gap-1.5 pl-[62px] text-[11px] font-black text-emerald-700">
              <Sparkles size={12} />{t('itinerary.aiSuggestions')}
            </div>
            {daySuggestions.map(suggestion => (
              <div key={suggestion.id} data-testid={`suggestion-${suggestion.id}`} className="relative flex gap-1.5">
                <div className="flex w-10 shrink-0 flex-col items-end pt-3.5">
                  <span className="font-mono text-[11px] font-black text-emerald-600">{suggestion.time || '—'}</span>
                  {suggestion.durationMinutes ? (
                    <span className="mt-0.5 whitespace-nowrap text-[9px] font-bold text-slate-400">{t('itinerary.approxMinutes', { minutes: suggestion.durationMinutes })}</span>
                  ) : null}
                </div>
                <div className="relative w-2.5 shrink-0">
                  <span className="absolute left-1/2 top-4 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-emerald-500 shadow-sm" />
                  <span className="absolute left-1/2 top-7 bottom-[-12px] w-0.5 -translate-x-1/2 border-l-2 border-dashed border-emerald-200" />
                </div>
                <div className="min-w-0 flex-1 rounded-[20px] border border-dashed border-emerald-300 bg-emerald-50/70 p-3.5">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      aria-label={t('itinerary.addToItinerary', { name: suggestion.placeName })}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded accent-emerald-600"
                      checked={false}
                      disabled={acceptingSuggestionId !== null}
                      onChange={async () => {
                        if (!onAcceptSuggestion || acceptingSuggestionId) return;
                        setAcceptingSuggestionId(suggestion.id);
                        setSuggestionError(null);
                        const failure = await onAcceptSuggestion(suggestion.id).catch(
                          () => t('itinerary.addFailed'),
                        );
                        if (failure) setSuggestionError(failure);
                        setAcceptingSuggestionId(null);
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <b className="text-sm font-black text-[#11183d]">{suggestion.placeName}</b>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${suggestion.source === 'saved_inspiration' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {suggestion.source === 'saved_inspiration' ? t('itinerary.savedInspiration') : t('itinerary.aiSuggestion')}
                        </span>
                      </div>
                      {suggestion.address && (
                        <div className="mt-1 flex items-start gap-1 text-[11px] leading-5 text-slate-500">
                          <MapPin size={12} className="mt-0.5 shrink-0" />
                          <span className="min-w-0 flex-1">{suggestion.address}</span>
                        </div>
                      )}
                      {suggestion.unresolved && (
                        <div
                          data-testid={`suggestion-unresolved-${suggestion.id}`}
                          className="mt-1 flex items-start gap-1 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-5 text-amber-700"
                        >
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                          <span className="min-w-0 flex-1">
                            {t('itinerary.notARealPlace')}
                          </span>
                        </div>
                      )}
                      {suggestion.note && <div className="mt-1 text-[11px] leading-5 text-slate-500">{suggestion.note}</div>}
                      {suggestion.reason && <div className="mt-1 text-[11px] leading-5 text-slate-500">{t('itinerary.reason', { reason: suggestion.reason })}</div>}
                      <div className="mt-2 flex items-center gap-3">
                        <span className="text-[10px] font-bold text-emerald-700">
                          {acceptingSuggestionId === suggestion.id ? t('itinerary.adding') : t('itinerary.notYetAdded')}
                        </span>
                        {onDismissSuggestion && (
                          <button
                            type="button"
                            onClick={() => onDismissSuggestion(suggestion.id)}
                            disabled={acceptingSuggestionId !== null}
                            className="text-[10px] font-black text-slate-400 disabled:opacity-40"
                          >
                            {t('itinerary.notNeeded')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {suggestionError && (
              <div className="ml-[62px] rounded-2xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">{suggestionError}</div>
            )}
          </div>
        )}
      </div>

      {untimedItems.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-black text-slate-400">{t('itinerary.noTimeYet')}</div>
          <div className="space-y-3">
            {untimedItems.map(item => (
              <div key={item.id} data-item-id={item.id} className="pl-[62px]">
                {renderCard(item)}
              </div>
            ))}
          </div>
        </div>
      )}

      {onAdd && <button type="button" onClick={() => onAdd(activeDate)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 py-3 text-sm font-black text-brand-600">＋ {t('itinerary.addItem')}</button>}

      {removeTarget && onDelete && (
        <div className={`fixed inset-0 ${OVERLAY.modal} flex items-center justify-center bg-slate-950/35 p-6`}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black text-[#111A4A]">{t('itinerary.deleteItemConfirm')}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{t('itinerary.deleteItemBlurb', { title: removeTarget.title })}</p>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setRemoveTarget(null)} className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-black text-slate-600">{t('common.cancel')}</button>
              <button type="button" onClick={() => { onDelete(removeTarget.id); setRemoveTarget(null); }} className="flex-1 rounded-xl bg-rose-600 py-3 text-sm font-black text-white">{t('common.delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/*
        Read from the live list rather than held in state, so an item that is
        deleted or re-synced underneath the card closes it instead of leaving a
        dialog describing something that is no longer on the plan.
      */}
      {(() => {
        const openItem = items.find(item => item.id === openPlaceItemId);
        if (!openItem) return null;
        return (
          <SavedPlaceCard
            place={{
              placeName: openItem.location || openItem.title,
              placeId: openItem.placeId,
              formattedAddress: openItem.address,
              coordinates: Number.isFinite(openItem.latitude) && Number.isFinite(openItem.longitude)
                ? { latitude: openItem.latitude as number, longitude: openItem.longitude as number }
                : undefined,
              /*
                The trip's country, which an itinerary stop does not carry.

                Without it the card cannot tell a Seoul cafe from a Tokyo one,
                and 韓國 → NAVER would never fire on the screen where it
                matters most: somebody standing in Seoul with today's plan
                open. A stop belongs to the trip around it.
              */
              country: destinationCountry || destination,
            }}
            notes={openItem.savedTravelNotes || []}
            onClose={() => setOpenPlaceItemId(null)}
          />
        );
      })()}

      {stayDetail && (
        <StayDetailSheet
          stay={stayDetail}
          notes={items.find(item => item.id === stayDetail.itemId)?.notes}
          onClose={() => setStayDetail(null)}
        />
      )}
      {/*
        The proposal, before anything is written.

        「連我手排的都給建議才對 除非我按下固定的行程」 — so this moves days the
        traveller arranged, and the only honest way to do that is to show the
        whole thing first and let them say no. Every row says where it was and
        where it would go; unchanged rows are not listed, because a diff that
        lists everything is not a diff.
      */}
      {routePlan && (
        <div
          className={`fixed inset-0 ${OVERLAY.sheet} flex items-end justify-center bg-slate-950/40 p-3 sm:items-center sm:p-6`}
          onClick={() => setRoutePlan(null)}
        >
          <div
            data-testid="route-plan-preview"
            className="max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-white p-4 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            {/*
              The scope, and the way to change it, in one place.

              「這個按鈕移到這邊」 — the toggle was above the apply buttons, a
              screen away from the chip that says what the scope currently is.
              Reading 「只動 10/22」 and wanting the other answer meant scrolling
              past the whole plan to find out it was possible.
            */}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-[#11183d]">{t('itinerary.optimiseRoute')}</h2>
              {routeScope !== 'trip' && (
                <span data-testid="route-scope" className="rounded-lg bg-[#f0edff] px-2 py-0.5 text-[11px] font-black text-[#5b3df5]">
                  {t('itinerary.onlyThisDay', { date: routeScope.slice(5).replace('-', '/') })}
                </span>
              )}
              {activeDate && (
                <button
                  type="button"
                  data-testid="toggle-route-scope"
                  onClick={() => planRoute(routeScope === 'trip' ? activeDate : 'trip')}
                  className="min-h-7 shrink-0 rounded-lg border border-[#ded7fb] px-2 text-[11px] font-black text-[#5b3df5]"
                >
                  {routeScope === 'trip'
                    ? t('itinerary.switchToOneDay', { date: activeDate.slice(5).replace('-', '/') })
                    : t('itinerary.switchToWholeTrip')}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {t('itinerary.optimiseSafetyNote')}
            </p>
            <p className="mt-2 text-xs font-black text-[#5b3df5]">
              {t('itinerary.dailyDistance', { before: routePlan.beforeKm.toFixed(1), after: routePlan.afterKm.toFixed(1) })}
              {routePlan.afterKm >= routePlan.beforeKm && (
                <span className="ml-1 font-bold text-slate-400">{t('itinerary.alreadyOptimal')}</span>
              )}
            </p>

            {(() => {
              // A record, not a Map: `Map` in this file is lucide's icon.
              const before: Record<string, ItineraryItem> = {};
              items.forEach(entry => { before[entry.id] = entry; });
              const changes = routePlan.days.flatMap(day => day.items
                .filter(item => {
                  const was = before[item.id];
                  return was && (was.date !== item.date || was.time !== item.time);
                })
                .map(item => ({ item, was: before[item.id] })));

              if (changes.length === 0) {
                return <p className="mt-3 text-sm font-bold text-slate-500">{t('itinerary.noAdjustmentNeeded')}</p>;
              }
              return (
                <ul className="mt-3 space-y-1.5">
                  {changes.map(({ item, was }) => (
                    <li key={item.id} className="rounded-xl bg-[#faf9ff] px-3 py-2 text-xs leading-5">
                      <span className="font-black text-[#11183d]">{item.location || item.title}</span>
                      <span className="mt-0.5 block text-slate-500">
                        {was.date.slice(5).replace('-', '/')} {was.time || t('itinerary.unscheduled')}
                        {' → '}
                        <span className="font-black text-[#5b3df5]">
                          {item.date.slice(5).replace('-', '/')} {item.time}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()}

            {/*
              「吃飯時間也要規劃餐廳 不是塞景點」 — moving a restaurant into an
              empty window is arithmetic; conjuring one is not. Named rather
              than filled, so a day without lunch does not pass in silence.
            */}
            {routePlan.mealsMissing.length > 0 && (
              <p data-testid="meals-missing" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
                {t('itinerary.mealsWithoutRestaurant')}
                {routePlan.mealsMissing
                  .map(entry => `${entry.date.slice(5).replace('-', '/')} ${entry.label}`)
                  .join(t('settle.listSeparator'))}
                <span className="mt-0.5 block font-medium text-amber-600">
                  {t('itinerary.mealsHint')}
                </span>
              </p>
            )}

            {/*
              「假設某個行程移去另一天更順 也可以建議」.

              Read across the whole trip even when the plan is scoped to a day,
              because the question is about the days this plan is not touching.
              Said rather than done: which day somebody wants to do something
              on is not only a distance question, and this screen is already a
              proposal.
            */}
            {dayMoves.length > 0 && (
              <div data-testid="better-on-another-day" className="mt-3 rounded-xl bg-[#f0edff] px-3 py-2 text-[11px] leading-5 text-[#3c2fa8]">
                {t('itinerary.betterOnAnotherDay')}
                <ul className="mt-1 space-y-1">
                  {dayMoves.slice(0, 3).map(move => (
                    <li key={move.itemId} className="flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="font-black">{move.placeName}</span>
                        {t('itinerary.moveSaves', { from: move.fromDate.slice(5).replace('-', '/'), to: move.toDate.slice(5).replace('-', '/'), km: move.savesKm })}
                      </span>
                      {/*
                        「這個結果不能在這個介面就點擊套用嗎」.

                        It said 「要的話自己拖過去」 — a correct instruction that
                        costs a drag across a day tab for something this panel
                        had already worked out. The move is one call, the same
                        one the drag makes: `onReorder` with a date.

                        Per row, not 「apply all」: these are three separate
                        judgements about three separate days, and a button that
                        takes all of them would make the one somebody disagreed
                        with the price of the two they wanted.
                      */}
                      {onReorder && (
                        <button
                          type="button"
                          data-testid={`move-to-day-${move.itemId}`}
                          onClick={() => {
                            if (onReorder(move.itemId, { toDate: move.toDate }) === false) return;
                            /*
                              Gone from the list once it is done. Recomputing
                              here would read the items this render was given,
                              which are the ones from before the move.
                            */
                            setDayMoves(current => current.filter(entry => entry.itemId !== move.itemId));
                          }}
                          className="shrink-0 rounded-lg bg-[#5b3df5] px-2 py-0.5 text-[10px] font-black text-white"
                        >
                          {t('itinerary.moveTo', { date: move.toDate.slice(5).replace('-', '/') })}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <span className="mt-1 block font-medium text-[#5b3df5]">
                  {onReorder
                    ? t('itinerary.movesNotAppliedTogether')
                    : t('itinerary.movesDragYourself')}
                </span>
              </div>
            )}

            {/*
              「吃飯時間應該被固定 … 優先提示換餐廳」 — the meal keeps its hour and
              the route bends around it. The detour is said, not resolved:
              choosing a nearer restaurant is a decision, not arithmetic.
            */}
            {routePlan.mealsNeedingANearerPlace.length > 0 && (
              <p data-testid="meals-need-a-nearer-place" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
                {t('itinerary.restaurantsDetour')}
                <ul className="mt-1 space-y-1.5">
                  {routePlan.mealsNeedingANearerPlace.map(entry => {
                    /*
                      「能自動由我的收藏清單中推薦取代2的餐廳並列出」.

                      Naming the restaurant left somebody to open the
                      collection, read fifty places and work out which is near
                      that day's route. The collection is right here and the
                      comparison is arithmetic. See `nearerRestaurants`.
                    */
                    const day = (routePlan.days.find(entry2 => entry2.date === entry.date)?.items || [])
                      .slice()
                      .sort((left, right) => (left.time || '').localeCompare(right.time || ''));
                    const swaps = nearerRestaurants(day, entry.itemId, savedPlaces || []);
                    return (
                      <li key={entry.itemId}>
                        {`${entry.date.slice(5).replace('-', '/')} ${entry.placeName}`}
                        {/*
                          「我就希望像收藏卡片一樣 有帶入圖片 店名 一些旅行筆記讓
                          用戶可以有想法 不然只列餐廳名稱怎麼知道」.

                          Three names and three star ratings is not something
                          anybody picks a restaurant from. The collection
                          screen worked this out long ago. See
                          `SuggestedPlaceCards`.
                        */}
                        {swaps.length > 0 && (
                          <span data-testid={`nearer-than-${entry.itemId}`} className="mt-1 block">
                            <span className="font-medium text-amber-600">{t('itinerary.closerFromSaved')}</span>
                            <SuggestedPlaceCards
                              places={swaps.map(swap => {
                                const saved = (savedPlaces || []).find(place => place.id === swap.id);
                                return {
                                  id: swap.id,
                                  placeName: swap.placeName,
                                  placeId: saved?.placeId,
                                  photoUrl: saved?.photoUrl,
                                  notes: saved?.notes,
                                  detourLabel: t('itinerary.savesDetour', { km: swap.savesKm }),
                                };
                              })}
                              onPick={onFillBlock && onDelete
                                ? place => swapMealFor(entry.itemId, picked => onFillBlock({
                                  ...picked, placeGroupId: place.id,
                                }))
                                : undefined}
                            />
                          </span>
                        )}
                        {nearbyByItem[entry.itemId]?.length > 0 && (
                          <span data-testid={`nearby-for-${entry.itemId}`} className="mt-1 block">
                            <span className="font-medium text-amber-600">{t('itinerary.alsoNearby')}</span>
                            <SuggestedPlaceCards
                              places={nearbyByItem[entry.itemId].slice(0, 3).map(place => ({
                                id: place.placeId,
                                placeId: place.placeId,
                                placeName: place.placeName,
                                kind: place.kind,
                                rating: place.rating,
                              }))}
                              /*
                                A place nobody has saved has no group to point
                                at, so it goes in by name — the same path 自己
                                輸入地點 uses, which is honest about carrying no
                                coordinates until it is resolved.
                              */
                              onPick={onFillBlockManually && onDelete
                                ? place => swapMealFor(entry.itemId, picked => onFillBlockManually({
                                  ...picked, title: place.placeName,
                                }))
                                : undefined}
                            />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <span className="mt-1 block font-medium text-amber-600">
                  {t('itinerary.mealTimesKept')}
                </span>
              </p>
            )}

            {routePlan.unplaced.length > 0 && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
                {t('itinerary.unplacedItems', { count: routePlan.unplaced.length })}
                {routePlan.unplaced.map(entry => entry.item.location || entry.item.title).join(t('settle.listSeparator'))}
              </p>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                data-testid="apply-route-plan"
                onClick={() => {
                  const before: Record<string, ItineraryItem> = {};
                  items.forEach(entry => { before[entry.id] = entry; });
                  routePlan.days.forEach(day => day.items.forEach(item => {
                    const was = before[item.id];
                    if (!was || !onUpdateItem) return;
                    if (was.date !== item.date || was.time !== item.time) {
                      onUpdateItem(item.id, { date: item.date, time: item.time });
                    }
                  }));
                  setRoutePlan(null);
                }}
                className="min-h-11 flex-1 rounded-xl bg-gradient-to-r from-[#2F5BFF] to-[#8B3DFF] text-sm font-black text-white"
              >
                {t('itinerary.applyRoute')}
              </button>
              <button
                type="button"
                onClick={() => setRoutePlan(null)}
                className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-500"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItineraryCalendar;
