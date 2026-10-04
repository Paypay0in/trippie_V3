import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OVERLAY } from '../constants/layers';
import { ItineraryItem, PlaceCommerceInfo } from '../types';
import { Clock, MapPin, Plane, Hotel, BedDouble, Utensils, Ticket, Car, CalendarDays, Sparkles, Map, Plus, MoreHorizontal, Image as ImageIcon, Info, NotebookPen } from 'lucide-react';
import { fetchPlacePhoto, PlacePhoto } from '../services/placePhotoService';
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
import { GripVertical, Lock, AlertTriangle, Pin, PinOff } from 'lucide-react';
import {
  applyFixedEventAdjustment,
  buildFixedEventAdjustment,
  describeUnresolvedConflicts,
  FixedEventAdjustment,
  fixedKindOf,
  isFixedItem,
} from '../services/itineraryFixedEvents';
import { estimateRoute } from '../services/routesService';
import { enumerateLocalDates, localToday } from '../services/localDate';
import { StaySpan, stayForNight, staysFromItinerary } from '../services/stayIntake';
import { AREA_COLORS } from '../constants/areaColors';
import { TripAreas } from '../services/tripAreas';
import SavedPlaceCard from './SavedPlaceCard';
import StayDetailSheet from './StayDetailSheet';
import TransportLeg from './TransportLeg';

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
   * The trip's areas, computed once from the plan and the collection together.
   *
   * 「行程就需要也有分顏色 讓用戶知道大行程在哪區」. Passed in rather than computed
   * here so 海雲台 is the same colour on this screen as on the collection —
   * each list clustering its own would give one area two colours the moment
   * one list holds a place the other does not, which is most of the time.
   */
  areas?: TripAreas;
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

const ItineraryCalendar: React.FC<Props> = ({ items, startDate, endDate, onUpdateItem, onAdd, onEdit, onAddStay, onDelete, destination, destinationCountry, onReorder, onResequenceTimes, onRescheduleItem, onChangeDuration, onApplyFixedAdjustment, onTogglePin, pendingSuggestions, onAcceptSuggestion, onDismissSuggestion, areas }) => {
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
  const [selectedDate, setSelectedDate] = useState<string | undefined>(dates[0]);
  const activeDate = dates.includes(selectedDate || '') ? selectedDate : dates[0];

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
  const tonightsStay = useMemo(
    () => (activeDate ? stayForNight(staysFromItinerary(items), activeDate) : undefined),
    [items, activeDate],
  );
  // The day's cards, in the order the user arranged them (or chronological until
  // they arrange one). This is a journey list, not a calendar: the gap between
  // two cards is always the same, whatever the gap between their times.
  const dayItems = useMemo(() => orderItemsForDay(itemsForDay(items, activeDate)), [items, activeDate]);
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
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {isFixedItem(item) ? (
                      // A fixed event is not casually draggable: changing a
                      // flight is an explicit edit, not a list gesture.
                      <span
                        data-testid={`fixed-badge-${item.id}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#11183d] px-1.5 py-0.5 text-[9px] font-black text-white"
                      >
                        <Lock size={9} />
                        {fixedKindOf(item) === 'flight' ? '航班 · 固定'
                          : fixedKindOf(item) === 'train' ? '列車 · 固定'
                          : fixedKindOf(item) === 'reservation' ? '訂位 · 固定'
                          : fixedKindOf(item) === 'accommodation' ? '住宿 · 固定'
                          : '固定時間'}
                      </span>
                    ) : onReorder && (
                      <button
                        type="button"
                        aria-label={`拖曳排序 ${item.title}`}
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
                          aria-label={`${item.title} 的開始時間`}
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
                          aria-label={`${item.title} 的結束時間`}
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
                  <div className="flex items-center gap-1.5">
                    {onTogglePin && (
                      // Pinning protects the item from AI adjustment only; the
                      // overflow menu still edits and deletes it by hand.
                      <button
                        type="button"
                        data-testid={`pin-toggle-${item.id}`}
                        aria-pressed={item.isPinned === true}
                        aria-label={item.isPinned ? `取消固定 ${item.title}` : `固定這個行程 ${item.title}`}
                        title={item.isPinned ? '取消固定' : '固定這個行程'}
                        onClick={() => onTogglePin(item.id, item.isPinned !== true)}
                        className={`inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[9px] font-black ${
                          item.isPinned
                            ? 'bg-[#f0edff] text-[#5b3df5]'
                            : 'text-slate-300 hover:bg-[#f3f0ff] hover:text-[#5b3df5]'
                        }`}
                      >
                        {item.isPinned ? <Pin size={11} fill="currentColor" /> : <PinOff size={11} />}
                        {item.isPinned && <span data-testid={`pinned-label-${item.id}`}>已固定</span>}
                      </button>
                    )}
                    <span className="rounded-full border border-[#eeeefa] bg-[#fafaff] px-2 py-0.5 text-[9px] font-bold text-slate-400">{item.type}</span>
                    {(onEdit || onDelete) && <div className="relative">
                      <button type="button" onClick={() => setMenuItemId(current => current === item.id ? null : item.id)} aria-label={`${item.title} 更多選項`} aria-expanded={menuItemId === item.id} className="rounded-lg p-2 text-slate-300 transition hover:bg-[#f3f0ff] hover:text-[#5b3df5]"><MoreHorizontal size={16} /></button>
                      {menuItemId === item.id && <div className="absolute right-0 top-10 z-20 w-44 rounded-2xl border border-slate-100 bg-white p-1.5 text-left shadow-xl">
                        {onEdit && !item.derivedFromFlightAnchorId && <button type="button" onClick={() => { setMenuItemId(null); onEdit(item); }} className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-violet-50">編輯行程</button>}
                        {/* Editing here writes to an item the anchor owns and
                            rebuilds, so the entry points at the anchor instead. */}
                        {onEdit && item.derivedFromFlightAnchorId && <p className="px-3 py-2 text-[11px] font-bold text-slate-400">航班時間請於「航班資訊」修改</p>}
                        {onDelete && <button type="button" onClick={() => { setMenuItemId(null); setRemoveTarget(item); }} className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50">刪除行程</button>}
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
                      日期
                      <span className="rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] text-slate-500">
                        {item.date ? item.date.replace(/-/g, '/') : '—'}
                      </span>
                      <span className="text-[10px] font-bold text-slate-300">· 於航班資訊修改</span>
                    </span>
                  ) : (
                    <label className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                      日期
                      <input type="date" value={item.date || ''} min={startDate || undefined} max={endDate || undefined} onChange={event => onUpdateItem(item.id, { date: event.target.value || undefined })} className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-600" />
                    </label>
                  )}
                  {!item.date && !item.derivedFromFlightAnchorId && <span className="text-[10px] font-bold text-slate-400">尚未指定日期</span>}
                  <label className="ml-auto flex items-center gap-1 text-[10px] font-bold text-slate-400">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded accent-[#5b3df5]" checked={item.isCompleted === true} onChange={event => onUpdateItem(item.id, { isCompleted: event.target.checked })} /> 完成
                  </label>
                </div>}
                
                <div className="flex items-start gap-3">
                  <div className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#f3f0ff] text-[#6b4df6]">
                    {item.placeId && photos[item.placeId]?.imageUrl ? <img src={photos[item.placeId].imageUrl} alt="" className="h-full w-full object-cover" /> : item.placeId && photos[item.placeId] === undefined ? <ImageIcon size={22} className="animate-pulse opacity-50" /> : getIcon(item.type)}
                    {item.placeId && photos[item.placeId]?.attribution?.uri && <a href={photos[item.placeId]?.attribution?.uri} target="_blank" rel="noreferrer" aria-label="查看照片來源" className="absolute bottom-1 right-1 rounded bg-black/55 p-0.5 text-white"><Info size={10} /></a>}
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
                        <span className="min-w-0 flex-1">地圖上沒有這個地點，沒有地址與照片</span>
                        {onEdit && (
                          <button type="button" onClick={() => onEdit(item)} className="shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-black text-amber-700 shadow-sm">
                            連結地點
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
                {item.savedTravelNotes && item.savedTravelNotes.length > 0 && (() => {
                  const isExpanded = expandedNoteIds.includes(item.id);
                  const visible = isExpanded ? item.savedTravelNotes : item.savedTravelNotes.slice(0, VISIBLE_NOTE_COUNT);
                  const hidden = item.savedTravelNotes.length - visible.length;
                  return (
                    <div className="mt-2 rounded-xl border-t border-slate-100 bg-[#faf9ff] px-2.5 py-2">
                      <div className="flex items-center gap-1 text-[10px] font-black text-[#6b4df6]"><NotebookPen size={11} />旅行筆記</div>
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
                          {isExpanded ? '收合' : `查看全部（${item.savedTravelNotes!.length}）`}
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
                      <div className="flex items-center gap-1 text-[10px] font-black text-slate-500"><Ticket size={11} className="text-[#6b4df6]" />門票 / 預約</div>

                      <div className="mt-1.5">
                        {info.officialPrice ? (
                          <>
                            {/* Source and check date travel with every number shown. */}
                            <div className="text-[10px] font-bold text-slate-400">
                              {info.officialPrice.label ? `官方參考價・${info.officialPrice.label}` : '官方參考價'}
                              {' · '}更新於 {info.officialPrice.checkedAt.replace(/-/g, '/')}
                            </div>
                            <div className="text-sm font-black text-[#111A4A]">
                              {formatPrice(info.officialPrice.amount, info.officialPrice.currency)}
                            </div>
                          </>
                        ) : (
                          // No current verified price, so no number at all — never ₩0,
                          // never "unknown", never an estimate.
                          <div className="text-xs font-bold text-slate-500">查看最新票價</div>
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
                          <div className="mt-2 text-[10px] font-black text-slate-400">購票 / 查價</div>
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
                                  {option.urlType === 'search' ? '搜尋' : '查看價格'}
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
                              參考價來源：
                              <a href={info.officialPrice.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">
                                {info.officialPrice.sourceName}
                              </a>
                              ，實際價格以官方為準
                            </>
                          )
                          : <>實際票價以官方與各平台為準</>}
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
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#6b4df6]">ITINERARY</p><h2 className="mt-1 text-xl font-black text-[#111A4A]">行程規劃</h2><p className="mt-1 text-xs text-slate-400">規劃每日行程，讓旅程更順暢、更有趣。</p></div>
        <div className="flex shrink-0 items-center gap-2">{onAdd && <button type="button" onClick={() => onAdd(activeDate)} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-[#2F5BFF] to-[#8B3DFF] px-3 py-2 text-xs font-black text-white shadow-[0_6px_14px_rgba(91,61,245,.16)]"><Plus size={14} />新增行程</button>}<button type="button" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#eceaf5] bg-white px-3 py-2 text-xs font-bold text-[#5b3df5] shadow-sm"><Map size={14} />地圖模式</button><button type="button" aria-label="更多選項" className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-[#f3f0ff] hover:text-[#5b3df5]"><MoreHorizontal size={17} /></button></div>
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
        return <button type="button" key={date} ref={node => { dayTabRefs.current[date] = node; }} onClick={() => setSelectedDate(date)} aria-label={`Day ${index + 1}`} data-testid={`day-tab-${date}`} data-past={isPast ? 'true' : undefined} data-drop-day={date} className={`relative min-w-[84px] rounded-[18px] border px-3.5 py-3 text-left transition ${overDate === date ? 'border-[#6b4df6] bg-[#ece7ff] ring-2 ring-[#b9adff]' : dragItemId && date !== activeDate ? 'border-dashed border-[#b9adff] bg-white' : activeDate === date ? 'border-[#b9adff] bg-[#f4f1ff] text-[#4f35d7] shadow-[0_8px_18px_rgba(91,61,245,.12)]' : isPast ? 'border-[#eef1f5] bg-[#f6f7f9] text-slate-400 opacity-60' : 'border-[#edf0f6] bg-white text-slate-500 shadow-[0_3px_10px_rgba(17,26,74,.03)]'}`}><span className={`mb-2 block h-1.5 w-1.5 rounded-full ${activeDate === date ? 'bg-[#6b4df6]' : isPast ? 'bg-slate-300' : 'bg-slate-200'}`} /><span className="block text-[11px] font-black">Day {index + 1}</span><span className="mt-1 block text-xs font-bold">{date.slice(5).replace('-', '/')}</span>{(() => {
      // A suggestion sitting on another day is invisible from here otherwise.
      const count = (pendingSuggestions || []).filter(suggestion => (suggestion.date ? suggestion.date === date : date === dates[0])).length;
      return count > 0 ? <span data-testid={`suggestion-badge-${date}`} className="absolute right-2 top-2 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-black text-white">{count}</span> : null;
    })()}</button>;
      })}</div>}

      {/*
        The arranged order no longer reads chronologically. The times are shown
        as they are — never silently rewritten — with an explicit way to fix them.
      */}
      {outOfOrder && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2.5 text-xs font-bold leading-5 text-amber-700">
          <span className="min-w-0 flex-1">行程順序已更新，請確認時間安排。</span>
          {onResequenceTimes && (
            <button
              type="button"
              onClick={() => onResequenceTimes(activeDate)}
              className="shrink-0 rounded-xl bg-white px-2.5 py-1 text-[11px] font-black text-amber-700 shadow-sm"
            >
              重新安排時間
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
                {adjustment.unresolved.length > 0 ? '目前有兩個固定行程發生衝突' : '新增航班後，當日行程需要調整'}
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
                  固定行程不會自動調整，請自行修改其中一項。
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
                查看調整
              </button>
              <button
                type="button"
                onClick={() => setDismissedSummary(adjustment.summary)}
                className="min-h-9 flex-1 rounded-xl px-3 text-xs font-bold text-amber-700"
              >
                稍後處理
              </button>
            </div>
          )}
        </div>
      )}

      {/* The structured diff. Nothing is written until 套用調整. */}
      {previewOpen && adjustment.changes.length > 0 && (
        <div className="mb-3 rounded-2xl border border-[#eceaf5] bg-white p-4 shadow-sm">
          <div className="text-xs font-black text-[#11183d]">建議調整</div>
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
                      : <>→ 移至 {change.toDate ? change.toDate.slice(5).replace('-', '/') : '其他日期'}</>}
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
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                if (onApplyFixedAdjustment?.(adjustment)) setPreviewOpen(false);
              }}
              className="min-h-10 flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-3 text-xs font-black text-white shadow"
            >
              套用調整
            </button>
          </div>
        </div>
      )}

      {lateNotice && (
        <div className="mb-3 rounded-2xl bg-amber-50 px-4 py-2.5 text-xs font-bold leading-5 text-amber-700">
          調整後部分行程時間較晚，請確認安排。
        </div>
      )}

      {/*
        Where they sleep tonight, on every night of the stay.
        
        A booking produces a check-in card and a check-out card, which leaves
        every night in between — most of a trip — saying nothing about where
        the traveller is staying. This is derived from the same two cards, so
        it needs no extra data and stays true when either one is edited.
      */}
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
            詳情 ›
          </span>
        </button>
      ) : activeDate && onAddStay ? (
        // A night with no room booked says so. Leaving the row blank makes an
        // unbooked night look identical to a booked one.
        <button
          type="button"
          data-testid="stay-banner-empty"
          onClick={onAddStay}
          className="mb-4 flex w-full items-center gap-3 rounded-[20px] border border-dashed border-[#d9d5f5] bg-[#fbfaff] px-4 py-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#a99df0]">
            <BedDouble size={17} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-black text-[#5b3df5]">新增住宿資訊</span>
          <span className="shrink-0 text-[11px] font-black text-slate-300">›</span>
        </button>
      ) : null}

      {/*
        A journey line, not a time axis: every card gets the same spacing however
        far apart the real times are. The time label belongs to its own row.
      */}
      <div
        aria-label="行程時間軸"
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={endDrag}
        className="relative"
      >
        {dayItems.length === 0 ? (
          <div className="rounded-[22px] border border-[#eeeaff] bg-[#faf9ff] px-5 py-10 text-center text-sm text-slate-500">
            <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#f0edff] text-[#6b4df6] shadow-inner"><CalendarDays size={27} strokeWidth={1.7} /><Sparkles className="absolute -right-1 -top-1 rounded-full bg-white p-1 text-[#8b3dff]" size={18} /></div><div className="font-black text-[#111A4A]">{activeDate ? '這一天尚未安排行程' : '尚未有行程規劃'}</div><div className="mx-auto mt-2 max-w-[240px] text-xs leading-relaxed text-slate-400">馬上新增行程，或使用 AI 幫你規劃吧！</div>
          </div>
        ) : (
          <div className="space-y-3">
            {(previewItemsTimed ?? previewItems.filter(isTimedItem)).map((item, index, rendered) => (
              <React.Fragment key={item.id}>
              <div
                ref={node => { cardRefs.current[item.id] = node; }}
                data-item-id={item.id}
                data-start={item.time}
                data-collision={collidingIds.has(item.id) ? 'true' : 'false'}
                className={`relative flex gap-2 ${item.isCompleted ? 'opacity-60' : ''} ${dragItemId === item.id ? 'opacity-70 shadow-lg transition-transform' : ''}`}
              >
                {/* Insertion indicator: where the lifted card would land. */}
                {dragItemId && !overDate && overIndex === index && dragItemId !== item.id && (
                  <div data-testid="drop-indicator" className="absolute -top-1.5 left-14 right-0 h-0.5 rounded bg-[#6b4df6]" />
                )}

                {/* Left: this row's own start time, and the journey line. */}
                <div className="relative flex w-12 shrink-0 flex-col items-end pt-3.5">
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
                    <span className="mt-0.5 text-[9px] font-bold text-slate-400">約 {durationOf(item)} 分</span>
                  ) : null}
                </div>
                <div className="relative w-3 shrink-0">
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
                const from = typeof item.latitude === 'number' && typeof item.longitude === 'number' ? item : null;
                const to = typeof next.latitude === 'number' && typeof next.longitude === 'number' ? next : null;
                if (!from || !to) {
                  // Said rather than skipped: a missing leg would otherwise look
                  // like the app had nothing to say about a long hop.
                  return (
                    <div data-testid={`transport-unavailable-${item.id}`} className="ml-[62px] rounded-2xl border border-dashed border-[#e6e3f3] px-3 py-2 text-[10px] font-bold leading-4 text-slate-400">
                      其中一個地點還沒連結地圖，無法計算交通時間
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
          The AI's suggestions for this day, sitting in the timeline where the
          plan is actually read. Green means proposed, not scheduled: ticking one
          is what writes it, and it writes only that one.
        */}
        {daySuggestions.length > 0 && (
          <div data-testid="pending-suggestions" className="mt-3 space-y-3">
            <div className="flex items-center gap-1.5 pl-[62px] text-[11px] font-black text-emerald-700">
              <Sparkles size={12} />AI 建議 · 打勾即加入行程
            </div>
            {daySuggestions.map(suggestion => (
              <div key={suggestion.id} data-testid={`suggestion-${suggestion.id}`} className="relative flex gap-2">
                <div className="flex w-12 shrink-0 flex-col items-end pt-3.5">
                  <span className="font-mono text-[11px] font-black text-emerald-600">{suggestion.time || '—'}</span>
                  {suggestion.durationMinutes ? (
                    <span className="mt-0.5 text-[9px] font-bold text-slate-400">約 {suggestion.durationMinutes} 分</span>
                  ) : null}
                </div>
                <div className="relative w-3 shrink-0">
                  <span className="absolute left-1/2 top-4 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-emerald-500 shadow-sm" />
                  <span className="absolute left-1/2 top-7 bottom-[-12px] w-0.5 -translate-x-1/2 border-l-2 border-dashed border-emerald-200" />
                </div>
                <div className="min-w-0 flex-1 rounded-[20px] border border-dashed border-emerald-300 bg-emerald-50/70 p-3.5">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      aria-label={`加入行程：${suggestion.placeName}`}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded accent-emerald-600"
                      checked={false}
                      disabled={acceptingSuggestionId !== null}
                      onChange={async () => {
                        if (!onAcceptSuggestion || acceptingSuggestionId) return;
                        setAcceptingSuggestionId(suggestion.id);
                        setSuggestionError(null);
                        const failure = await onAcceptSuggestion(suggestion.id).catch(
                          () => '加入行程失敗，你的行程沒有被更動，請再試一次。',
                        );
                        if (failure) setSuggestionError(failure);
                        setAcceptingSuggestionId(null);
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <b className="text-sm font-black text-[#11183d]">{suggestion.placeName}</b>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${suggestion.source === 'saved_inspiration' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {suggestion.source === 'saved_inspiration' ? '收藏靈感' : 'AI 建議'}
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
                            這不是一個地圖上查得到的店名，加進去只會是一段文字，沒有地址與照片。建議略過。
                          </span>
                        </div>
                      )}
                      {suggestion.note && <div className="mt-1 text-[11px] leading-5 text-slate-500">{suggestion.note}</div>}
                      {suggestion.reason && <div className="mt-1 text-[11px] leading-5 text-slate-500">原因：{suggestion.reason}</div>}
                      <div className="mt-2 flex items-center gap-3">
                        <span className="text-[10px] font-bold text-emerald-700">
                          {acceptingSuggestionId === suggestion.id ? '正在加入…' : '尚未加入正式行程'}
                        </span>
                        {onDismissSuggestion && (
                          <button
                            type="button"
                            onClick={() => onDismissSuggestion(suggestion.id)}
                            disabled={acceptingSuggestionId !== null}
                            className="text-[10px] font-black text-slate-400 disabled:opacity-40"
                          >
                            不需要
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
          <div className="mb-2 text-[11px] font-black text-slate-400">尚未安排時間</div>
          <div className="space-y-3">
            {untimedItems.map(item => (
              <div key={item.id} data-item-id={item.id} className="pl-[62px]">
                {renderCard(item)}
              </div>
            ))}
          </div>
        </div>
      )}

      {onAdd && <button type="button" onClick={() => onAdd(activeDate)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 py-3 text-sm font-black text-brand-600">＋ 新增行程</button>}

      {removeTarget && onDelete && (
        <div className={`fixed inset-0 ${OVERLAY.modal} flex items-center justify-center bg-slate-950/35 p-6`}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black text-[#111A4A]">刪除這個行程？</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">「{removeTarget.title}」將從這趟旅行中移除。</p>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setRemoveTarget(null)} className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-black text-slate-600">取消</button>
              <button type="button" onClick={() => { onDelete(removeTarget.id); setRemoveTarget(null); }} className="flex-1 rounded-xl bg-rose-600 py-3 text-sm font-black text-white">刪除</button>
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
    </div>
  );
};

export default ItineraryCalendar;
