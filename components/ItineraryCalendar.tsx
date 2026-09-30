import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OVERLAY } from '../constants/layers';
import { ItineraryItem, PlaceCommerceInfo } from '../types';
import { Clock, MapPin, Plane, Hotel, Utensils, Ticket, Car, CalendarDays, Sparkles, Map, Plus, MoreHorizontal, Image as ImageIcon, Info, NotebookPen } from 'lucide-react';
import { fetchPlacePhoto, PlacePhoto } from '../services/placePhotoService';
import { fetchPlaceCommerce, hasDisplayableCommerce } from '../services/placeCommerceService';
import { itemsForDay, orderItemsForDay, hasTimeOrderConflict } from '../services/itineraryOrdering';
import {
  detectCollisions,
  durationOf,
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
  FixedEventAdjustment,
  fixedKindOf,
  isFixedItem,
} from '../services/itineraryFixedEvents';
import { estimateRoute } from '../services/routesService';
import { enumerateLocalDates } from '../services/localDate';

interface Props {
  items: ItineraryItem[];
  onAddToCalendar?: (item: ItineraryItem) => void;
  startDate?: string;
  endDate?: string;
  onUpdateItem?: (id: string, updates: Pick<ItineraryItem, 'date' | 'isCompleted'>) => void;
  onAdd?: (date?: string) => void;
  onEdit?: (item: ItineraryItem) => void;
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
  /** Writes a confirmed fixed-event adjustment. Never called before confirmation. */
  onApplyFixedAdjustment?: (adjustment: FixedEventAdjustment) => boolean;
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

const ItineraryCalendar: React.FC<Props> = ({ items, startDate, endDate, onUpdateItem, onAdd, onEdit, onDelete, destination, destinationCountry, onReorder, onResequenceTimes, onRescheduleItem, onApplyFixedAdjustment, onTogglePin }) => {
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ItineraryItem | null>(null);
  const dates = useMemo(() => (startDate && endDate ? enumerateLocalDates(startDate, endDate) : []), [startDate, endDate]);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(dates[0]);
  const activeDate = dates.includes(selectedDate || '') ? selectedDate : dates[0];
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
                    <span className="text-[#6b4df6]">{getIcon(item.type)}</span><span className="font-mono text-xs font-black text-[#6b4df6]">{item.time}</span>
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
                    <h4 className="mb-1 text-base font-black leading-tight text-[#111A4A]">{item.title}</h4>
                    {item.location && <div className="flex items-start gap-1 text-xs font-semibold text-slate-600"><MapPin size={11} className="mt-0.5 shrink-0 text-[#6b4df6]" />{item.location}</div>}
                    {item.address && <p className="mt-1 pl-4 text-[10px] font-medium leading-snug text-slate-400">{item.address}</p>}
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
      <div className="flex items-center justify-between mb-6">
        <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#6b4df6]">ITINERARY</p><h2 className="mt-1 text-xl font-black text-[#111A4A]">行程規劃</h2><p className="mt-1 text-xs text-slate-400">規劃每日行程，讓旅程更順暢、更有趣。</p></div>
        <div className="flex items-center gap-2">{onAdd && <button type="button" onClick={() => onAdd(activeDate)} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#2F5BFF] to-[#8B3DFF] px-3 py-2 text-xs font-black text-white shadow-[0_6px_14px_rgba(91,61,245,.16)]"><Plus size={14} />新增行程</button>}<button type="button" className="inline-flex items-center gap-1.5 rounded-xl border border-[#eceaf5] bg-white px-3 py-2 text-xs font-bold text-[#5b3df5] shadow-sm"><Map size={14} />地圖模式</button><button type="button" aria-label="更多選項" className="rounded-xl p-2 text-slate-400 hover:bg-[#f3f0ff] hover:text-[#5b3df5]"><MoreHorizontal size={17} /></button></div>
      </div>
      {dates.length > 0 && <div className="mb-5 flex gap-2 overflow-x-auto pb-1">{dates.map((date, index) => <button type="button" key={date} ref={node => { dayTabRefs.current[date] = node; }} onClick={() => setSelectedDate(date)} aria-label={`Day ${index + 1}`} data-drop-day={date} className={`relative min-w-[84px] rounded-[18px] border px-3.5 py-3 text-left transition ${overDate === date ? 'border-[#6b4df6] bg-[#ece7ff] ring-2 ring-[#b9adff]' : dragItemId && date !== activeDate ? 'border-dashed border-[#b9adff] bg-white' : activeDate === date ? 'border-[#b9adff] bg-[#f4f1ff] text-[#4f35d7] shadow-[0_8px_18px_rgba(91,61,245,.12)]' : 'border-[#edf0f6] bg-white text-slate-500 shadow-[0_3px_10px_rgba(17,26,74,.03)]'}`}><span className={`mb-2 block h-1.5 w-1.5 rounded-full ${activeDate === date ? 'bg-[#6b4df6]' : 'bg-slate-200'}`} /><span className="block text-[11px] font-black">Day {index + 1}</span><span className="mt-1 block text-xs font-bold">{date.slice(5).replace('-', '/')}</span></button>)}</div>}

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
              <div className="mt-0.5 text-[11px] leading-5 text-amber-700">{adjustment.summary}</div>
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
            {(previewItemsTimed ?? previewItems.filter(isTimedItem)).map((item, index) => (
              <div
                key={item.id}
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
                  {renderCard(item)}
                </div>
              </div>
            ))}
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
    </div>
  );
};

export default ItineraryCalendar;
