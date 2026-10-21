import React, { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Clock3, Plus, Trash2 } from 'lucide-react';
import PlacePickerSheet from './PlacePickerSheet';
import { suggestionsForSlot } from '../services/suggestionsForSlot';
import { fetchNearbyRestaurants, LookingFor, NearbyRestaurant } from '../services/nearbyRestaurantsService';
import { ItineraryItem, PlaceCategory } from '../types';
import { CATEGORY_LABELS } from '../services/placeCategory';
import { AREA_COLORS } from '../constants/areaColors';
import { cleanManualTitle, MAX_TITLE } from '../services/manualBlockEntry';

/** Sentinel for the 「type it yourself」 row; never a real place id. */
const CLEAR_OPTION = '__none__';
const MANUAL_OPTION = '__manual__';
import { BLOCK_MINUTES, buildDayTemplate, DaySlot } from '../services/dayTemplate';
import { shiftDayToStart } from '../services/shiftDayStart';
import { separateOverlaps } from '../services/separateOverlaps';
import { FixedScheduleEntry, latestFreeStartByDate } from '../services/itineraryDayFloor';
import { transitMinutesBetween } from '../services/itineraryScheduling';
import { minutesToTime, timeToMinutes } from '../services/itineraryTimeline';
import { dayAreaSpread, daySpansTooManyAreas } from '../services/dayAreaSpread';
import { TripAreas } from '../services/tripAreas';

/**
 * A day built by filling blocks, instead of by placing times.
 *
 * 「目前行程表會一直跑版 … 一個行程都預設抓 2 小時，讓用戶用下拉式選單的方式來排
 * 行程」, and 「可以接畫面 因為我們根本無法用行程表的這個功能」.
 *
 * Nothing new is stored. A filled block *is* an itinerary item — the same item
 * the timeline below already draws — and an empty block is only a shape that
 * has not been filled yet. A second store of 「the day's blocks」 would be a
 * second thing to sync, a second thing to get out of step with the plan, and a
 * second answer to 「what is at 14:00」.
 */

interface PlaceOption {
  id: string;
  placeName: string;
  /** Which area it is in, for the colour and for sorting the list. */
  areaLabel?: string;
  areaColorIndex?: number;
  /**
   * The ward this place is actually in, which is what the list groups by.
   *
   * Deliberately not `areaLabel`. An area is a cluster of the whole trip and
   * is named after the ward most of it sits in, so 豪德寺 — the only stop in
   * 世田谷 — read 「(Minato City)」 in this very dropdown. For 「which places are
   * near each other」 the cluster is the right answer; for 「where is this one」
   * it is not.
   */
  district?: string;
  /** True when it is already somewhere on this trip's plan. */
  alreadyPlanned?: boolean;
  /** 🏷️ 景點 / 餐廳 / … The picker groups by it. See `placeCategory`. */
  category?: PlaceCategory;
  /** The photo it was saved with, and the notes kept about it. */
  photoUrl?: string;
  notes?: string[];
  /** Google's id, so a save with no stored photo can still show one. */
  placeId?: string;
}

interface Props {
  date: string;
  /** The day's timed items, in the order they run. */
  items: ItineraryItem[];
  /** Flights and check-ins, which bound the day rather than filling it. */
  fixedSchedule?: FixedScheduleEntry[];
  /** The traveller's saved places, offered in the dropdowns. */
  places: PlaceOption[];
  areas?: TripAreas;
  /** Fills an empty block. The caller writes the item and owns persistence. */
  onFillBlock: (slot: DaySlot, placeId: string) => void;
  /** Fills a slot with a name the traveller typed, when no saved place fits. */
  onFillBlockManually?: (slot: DaySlot, title: string) => void;
  /** Changes how long a placed item runs; everything after it moves with it. */
  onChangeDuration?: (itemId: string, minutes: number) => void;
  /**
   * Empties a filled block.
   *
   * 「選項也要有一個無」 — every empty row already says 無, and once a row was
   * filled there was no way back to it from this panel. The slot could be
   * given a place and never taken one away, so a wrong pick had to be undone
   * somewhere else entirely.
   *
   * Omit and the option is not offered: a screen that cannot persist the
   * removal must not appear to do it.
   */
  onClearBlock?: (itemId: string) => void;
  /**
   * Blocks the traveller has said are meant to be empty. See `emptiedSlots`.
   *
   * 「要有『無』的選項」 on an empty row: a gap nobody has chosen for and a gap
   * decided against look identical in an itinerary, so the planner kept
   * offering restaurants under a lunch he had already said no to.
   */
  emptiedSlotIds?: string[];
  /**
   * Says a block is empty on purpose, or takes it back. The caller persists.
   *
   * Omit and 無 is not offered: a screen that cannot remember the answer must
   * not appear to ask the question.
   */
  onToggleEmptied?: (slotId: string) => void;
  /**
   * Writes the day back after 幾點出門 moves it. See `shiftDayToStart`.
   *
   * Omit and the offer is not made: this rewrites the traveller's own plan, so
   * a screen that cannot persist it must not pretend to.
   */
  onShiftDay?: (items: ItineraryItem[]) => void;
  /** The trip's country, so an address is read with its own conventions. */
  country?: string;
  /** Items that are fixed and must never be offered a length control. */
  isFixed?: (item: ItineraryItem) => boolean;
  /**
   * Undoes the traveller's own pin, from where its effect is visible.
   *
   * 「這是ＡＩ排的行程」 — a 「固定」 chip on a restaurant he had not meant to pin.
   * The chip was a dead label: it said the row could not be changed and gave
   * no way to find out why or to change it back. The pin lives on a card in
   * the timeline below; the consequence shows up here.
   */
  onUnpin?: (itemId: string) => void;
  /**
   * The 🏷️ tag for something already on the plan, so a meal slot can check
   * what is sitting in it.
   *
   * 「在這個表上可以跟用戶再確認一次」 — his 晚餐 rows held Leaves Coffee Roasters
   * and Lonich. The automatic rules place a restaurant in a window when there
   * is one spare; they cannot tell him a window ended up with a café in it.
   * Omitted asks nothing.
   */
  categoryOf?: (item: ItineraryItem) => string | undefined;
  /**
   * Swaps two filled rows, for the ▲▼ on the left of each one.
   *
   * 「這邊在左邊欄位直接可以有上下箭頭去移動排序」. Reordering a day meant dragging
   * cards in the timeline below — which is the right tool for a long day and
   * the wrong one for 「these two are the wrong way round」, especially on a
   * phone where a drag has to miss every other control on the way past.
   *
   * A swap, not a move: the two stops trade clock times and keep their own
   * lengths, which is the same thing `mealsAtMealtimes` does and the only
   * change that cannot quietly lose a slot.
   */
  onSwapBlocks?: (firstId: string, secondId: string) => void;
  /**
   * Moves a stop into an empty row, by giving it that row's start time.
   *
   * 「這樣點擊就是一直在交換行程」 — the arrows only traded, so a day with gaps in
   * it could never use them to fill one. Moving into a blank is the common
   * case, not the edge: most days have more rows than stops.
   */
  onShiftBlock?: (itemId: string, startTime: string) => void;
}

/** 「一個行程都預設抓 2 小時」, and the lengths worth offering around it. */
const DURATION_CHOICES = [30, 60, 90, 120, 150, 180, 240];

const minutesLabel = (minutes: number): string =>
  (minutes % 60 === 0 ? `${minutes / 60} 小時` : `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分`);

const DayBlockPlanner: React.FC<Props> = ({
  date,
  items,
  fixedSchedule = [],
  places,
  areas,
  onFillBlock,
  onFillBlockManually,
  onChangeDuration,
  onClearBlock,
  emptiedSlotIds = [],
  onToggleEmptied,
  onUnpin,
  categoryOf,
  onSwapBlocks,
  onShiftBlock,
  onShiftDay,
  country,
  isFixed,
}) => {
  /*
    Which slot is being typed into, if any. One at a time: two open inputs on
    one day is two half-finished entries, and the second one is the one that
    gets forgotten.
  */
  const [typingAt, setTypingAt] = useState<number | null>(null);
  /*
    「這個下拉式選單是不足夠的 應該要 pop up 一個視窗讓用戶滑看筆記跟圖片才會知道」.

    The dropdown stays as the control that reports what is in a slot; choosing
    now happens in a sheet, where the note and the photo are. A name is what a
    place is called, not what it is.
  */
  const [pickingAt, setPickingAt] = useState<number | null>(null);
  /*
    「或 Google 搜尋結果」 — asked once, when the sheet opens, for the corner it
    is filling. Never on the day itself: a page that fires a lookup per empty
    row spends quota on rows nobody opened.
  */
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyRestaurant[]>([]);
  const [typed, setTyped] = useState('');

  /*
    The row pulled aside, and where a drag started.

    「若想要刪除行程可以格子往右推 就出現「刪除」選項嗎」 — removing a stop meant
    opening the sheet and finding 清空這格 at the bottom of fifty places, which
    is a long way round for 「not this one」.

    Only one row at a time: two rows half open is two half-finished gestures,
    and the second is the one that gets pressed by accident.
  */
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const dragFrom = React.useRef<{ id: string; x: number } | null>(null);

  /** Far enough to be a swipe rather than a tap that wandered. */
  const SWIPE_OPENS_AT = 48;

  const cancelTyping = () => { setTypingAt(null); setTyped(''); };

  /*
    Putting something into a slot that is already taken.

    「在這換了一家餐廳 但行程表上沒有同步刪除舊的餐廳行程」 — a slot holds one
    stop, so filling an occupied one is a replacement and the stop that was
    there has to leave. Choosing from the collection did that; choosing a
    Google result or typing a name did not, and added a second stop at the same
    hour while the planner kept drawing one row.

    Every way into a slot goes through here, so there is no second path left to
    forget it.
  */
  const replaceInSlot = (slot: DaySlot, fill: () => void) => {
    const sitting = slot.occupantId ? itemById.get(slot.occupantId) : undefined;
    if (sitting) onClearBlock?.(sitting.id);
    fill();
  };

  const commitTyped = (slot: DaySlot) => {
    const title = cleanManualTitle(typed);
    if (!title || !onFillBlockManually) return;
    replaceInSlot(slot, () => onFillBlockManually(slot, title));
    cancelTyping();
  };

  /*
    The day starts when the traveller says, and runs to the evening regardless.

    「這個表 不是刪掉行程就會消失 要固定存在」. It used to start at the first item's
    time, so a day whose first item was at 17:00 had no morning at all — and
    deleting that item took its block with it. The table is the day; the items
    are what is in it.
  */
  const [chosenStart, setChosenStart] = useState('');
  /*
    A time chosen for one day is not a time chosen for the next.

    The state lives in this panel and the panel stays mounted while the day
    tabs change, so 10:30 typed on Day 2 followed Day 3 around and offered to
    move a day nobody had said anything about.
  */
  useEffect(() => { setChosenStart(''); }, [date]);
  /*
    The move 幾點出門 is asking for, computed but not applied. See the button
    below for why it is an offer rather than an effect.
  */
  const shift = useMemo(() => {
    if (!onShiftDay || !chosenStart) return null;
    const result = shiftDayToStart(items, chosenStart);
    return result.movedCount > 0 ? result : null;
  }, [items, chosenStart, onShiftDay]);
  /*
    Two stops in the same half hour, and a button that settles it.

    「我覺得這個很明確可以把行程中間的時間調整好」 — his 11:45–13:45 teamLab ran
    ninety minutes into a 12:15 Alchemy that cannot move. The times read
    forwards, so 「重新安排時間」 saw nothing to repair: that one is for a day
    whose clock runs backwards, and this day's clock is fine. What overlaps is
    the *lengths*.

    `separateOverlaps` has settled exactly this since the AI adjustment was
    written — nothing fixed is ever moved, and the flexible stop beside it
    gives way. It had no button anywhere.

    Offered, never applied: the times on screen are the traveller's own.
  */
  const tidied = useMemo(() => separateOverlaps(items), [items]);

  const firstMovableTime = useMemo(() => {
    const times = items
      .filter(entry => !entry.derivedFromFlightAnchorId && entry.type !== 'FLIGHT')
      .map(entry => entry.time)
      .filter(Boolean)
      .sort();
    return times[0];
  }, [items]);
  const shiftLabel = shift
    ? (shift.shiftMinutes % 60 === 0
        ? `${shift.shiftMinutes / 60} 小時`
        : `${shift.shiftMinutes} 分`)
    : '';

  /*
    The items, by the clock.

    Placed into whichever block their time falls in rather than by position, so
    a gap in the day is a gap in the table rather than a shift of everything
    after it.
  */
  const occupants = useMemo(
    () => items.map(item => ({
      id: item.id,
      time: item.time,
      durationMinutes: Number.isFinite(item.durationMinutes) ? Number(item.durationMinutes) : undefined,
    })),
    [items],
  );

  const { slots, ranOutOfDay } = useMemo(
    () => buildDayTemplate({ date, dayStart: chosenStart || undefined, fixedSchedule, occupants }),
    [date, chosenStart, fixedSchedule, occupants],
  );

  /*
    When the day stops being a day.

    「最後一天有飛行行程那這個一定要開始進行交通的時間要被以紅色標注提醒用戶不能排行程
    了！要出發去機場」.

    `latestFreeStartByDate` has bounded this table since it was built — the
    blocks already stop at the hour he has to leave. But stopping is silent:
    an evening that simply has no rows looks like an evening nobody has
    planned yet, which is the opposite of what it is.
  */
  const beAtAirportBy = useMemo(
    () => latestFreeStartByDate(fixedSchedule)[date],
    [fixedSchedule, date],
  );

  /**
   * When to actually leave, which is not when to be there.
   *
   * 「我的飛機是晚上九點」 — and the line said 「19:15 要出發去機場」. 19:15 is the
   * 抵達機場 card: departure less the check-in buffer. It is when you must
   * already be standing in the terminal, and setting off then means missing
   * the flight by the length of the ride — from 中目黒 to 成田, most of two
   * hours.
   *
   * `transitMinutesBetween` is the same estimate everything else on this
   * screen is scheduled by. Undefined when either end has no coordinates, and
   * then only the arrival time is stated — which is true on its own.
   */
  const leaveForAirportAt = useMemo(() => {
    const beThere = beAtAirportBy ? timeToMinutes(beAtAirportBy) : undefined;
    if (beThere === undefined) return undefined;
    const airport = items.find(item => item.id.startsWith('flight-arrival-')
      && typeof item.latitude === 'number' && typeof item.longitude === 'number');
    if (!airport) return undefined;

    const lastStop = [...items]
      .filter(item => !isFixed?.(item)
        && typeof item.latitude === 'number' && typeof item.longitude === 'number'
        && (timeToMinutes(item.time) ?? -1) < beThere)
      .sort((left, right) => (timeToMinutes(left.time) ?? 0) - (timeToMinutes(right.time) ?? 0))
      .pop();
    if (!lastStop) return undefined;

    const journey = transitMinutesBetween(
      { latitude: lastStop.latitude as number, longitude: lastStop.longitude as number },
      { latitude: airport.latitude as number, longitude: airport.longitude as number },
    );
    const setOff = beThere - journey;
    return setOff > 0 ? { at: minutesToTime(setOff), journey } : undefined;
  }, [beAtAirportBy, items, isFixed]);

  const itemById = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);

  const spread = useMemo(() => (areas ? dayAreaSpread(items, areas, country) : undefined), [items, areas, country]);

  /*
    Same area first.

    The point of the dropdown is to build a day that stays in one place, so the
    places that would do that are the ones to reach first. Within an area the
    saved order stands: it is the only other ordering the traveller has.
  */
  const optionsFor = (slot: DaySlot): PlaceOption[] => {
    const dayAreas = new Set(spread?.areas.map(area => area.colorIndex) ?? []);
    return [...places].sort((left, right) => {
      const leftNear = left.areaColorIndex !== undefined && dayAreas.has(left.areaColorIndex) ? 0 : 1;
      const rightNear = right.areaColorIndex !== undefined && dayAreas.has(right.areaColorIndex) ? 0 : 1;
      return leftNear - rightNear;
    });
  };

  /** 「(餐廳)」 beside a name, or nothing when no tag is known. */
  const tagOf = (place: PlaceOption): string =>
    (place.category && place.category !== 'other' ? CATEGORY_LABELS[place.category] : '');

  /**
   * The same list, under 區 headings, with the 🏷️ tag beside each name.
   *
   * 「當有標籤後 這個下拉式選單 展開後就依標籤分類展開」 built this with the tag as
   * the heading; 「這個分類可以用city分類然後括號裡面是類別嗎」 turns it round.
   *
   * And that is the right way round, because of what the dropdown is for: it
   * fills one block of one day, and the thing that makes a day work is staying
   * in one part of the city. Under 🏷️ headings a 餐廳 list was eight wards
   * deep and every pick was a gamble on travel time. Under 區 headings the
   * places that belong to the day you are building are already together.
   *
   * The slot still decides the order inside a ward — 午餐 leads with 餐廳, an
   * afternoon with 景點 — so the block still knows what it is asking for. It
   * leads rather than filters: a café can be lunch, and hiding it would answer
   * a question nobody asked.
   */
  const groupedOptionsFor = (slot: DaySlot): { label: string; places: PlaceOption[] }[] => {
    const leading: PlaceCategory[] = slot.kind === 'meal'
      ? ['food', 'cafe', 'sight', 'shop', 'stay', 'transport']
      : ['sight', 'shop', 'cafe', 'food', 'stay', 'transport'];
    const rank = (place: PlaceOption): number => {
      const at = place.category ? leading.indexOf(place.category) : -1;
      return at === -1 ? leading.length : at;
    };

    /*
      `optionsFor` has already floated the day's own areas to the front, so the
      first heading is the ward the day is being built in.
    */
    const groups: { label: string; places: PlaceOption[] }[] = [];
    const byLabel = new Map<string, { label: string; places: PlaceOption[] }>();
    optionsFor(slot).forEach(place => {
      const label = place.district?.trim() || place.areaLabel?.trim() || '其他';
      let group = byLabel.get(label);
      if (!group) { group = { label, places: [] }; byLabel.set(label, group); groups.push(group); }
      group.places.push(place);
    });

    groups.forEach(group => { group.places.sort((left, right) => rank(left) - rank(right)); });
    // A place with no ward goes last; it is the one heading that says nothing.
    return [...groups.filter(group => group.label !== '其他'),
      ...groups.filter(group => group.label === '其他')];
  };

  /*
    The nearest filled row in each direction, which is what an arrow trades
    with. Empty rows are skipped: 「move this up」 past a gap is still a move,
    and stopping at a blank would make the arrow do nothing on a sparse day.

    A fixed row is a wall rather than a partner — the day is built around it.
  */
  /*
    The next stop in that direction, skipping the empty rows between.

    A fixed row is a wall: the day is built around it, nothing trades with it,
    and nothing is pushed past it.
  */
  const neighbour = (slot: DaySlot, step: 1 | -1): ItineraryItem | undefined => {
    for (let index = slot.index + step; index >= 0 && index < slots.length; index += step) {
      const sitting = slots[index].occupantId ? itemById.get(slots[index].occupantId as string) : undefined;
      if (!sitting) continue;
      return isFixed?.(sitting) ? undefined : sitting;
    }
    return undefined;
  };
  const swapUp = (slot: DaySlot) => neighbour(slot, -1);
  const swapDown = (slot: DaySlot) => neighbour(slot, 1);

  const minutesOfClock = (clock?: string): number | undefined => {
    if (!clock || !/^\d{2}:\d{2}$/.test(clock)) return undefined;
    const [hours, mins] = clock.split(':').map(Number);
    return hours * 60 + mins;
  };
  const clockOfMinutes = (minutes: number): string =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const lengthOf = (item: ItineraryItem): number =>
    (Number.isFinite(item.durationMinutes) && (item.durationMinutes as number) > 0
      ? (item.durationMinutes as number)
      : BLOCK_MINUTES);

  /**
   * Closes the gap to the next stop, and swaps once there is none.
   *
   * 「讓兩個行程相鄰」. Moving into whichever grid row came next left 東京都現代
   * 美術館 and Hoppy Street three hours apart — a different arrangement of the
   * same dead afternoon. What the arrow is for is 「put these two together」.
   *
   * So the first press makes them touch: moving down, this stop ends exactly
   * when the next one starts; moving up, it starts exactly when the one above
   * it ends. Press again, with nothing left between them, and they trade
   * places — which is the only move left that changes anything.
   */
  /*
    What is near this gap, from the collection. See `suggestionsForSlot`.

    The stops either side of the slot are what make a gap a gap, so they are
    what a suggestion is measured against.
  */
  /*
    A place is offered in one gap, not in every gap.

    「一直出現」 — each empty row asked independently, and three gaps in one
    evening all got the same three names, because the same collection ranked
    the same way three times. Read down the day it looks like the app has
    three ideas and is repeating them, which is exactly what it was doing.

    Walked in clock order and claimed as it goes: the earliest gap a place
    suits gets it, and the next gap gets the next best thing. A day with more
    gaps than saved places then shows fewer chips lower down, which is true —
    there is nothing left to put there.
  */
  const suggestionsBySlot = useMemo(() => {
    const filled = slots
      .filter(candidate => candidate.occupantId)
      .map(candidate => ({ index: candidate.index, item: itemById.get(candidate.occupantId as string) }));
    const claimed = new Set<string>();
    const bySlot = new Map<number, ReturnType<typeof suggestionsForSlot>>();

    slots.forEach(slot => {
      if (slot.occupantId) return;
      const before = filled.filter(entry => entry.index < slot.index).pop()?.item;
      const after = filled.find(entry => entry.index > slot.index)?.item;
      const picked = suggestionsForSlot(slot.kind, before, after, places)
        .filter(suggestion => !claimed.has(suggestion.id));
      picked.forEach(suggestion => claimed.add(suggestion.id));
      bySlot.set(slot.index, picked);
    });

    return bySlot;
  }, [slots, itemById, places]);

  /*
    Nothing is offered for a block the traveller has said is empty on purpose.
    The suggestions are an answer to 「what could go here」, and that question
    has been answered.
  */
  /*
    「覺得要有1234」 — which stop of the day this is.

    Counted over the blocks that hold something, in clock order, so the
    numbers read 1 2 3 4 down a day with gaps in it. Zero for an empty block:
    a gap is not a stop, and giving it a number would renumber the afternoon
    every time one was filled.
  */
  const stopNumber = (slot: DaySlot): number =>
    slot.occupantId
      ? slots.filter(other => other.occupantId && other.index <= slot.index).length
      : 0;

  const suggestionsFor = (slot: DaySlot) =>
    (emptiedSlotIds.includes(slot.id) ? [] : suggestionsBySlot.get(slot.index)) || [];

  /*
    The corner the open sheet is filling, as two numbers.

    Deliberately not 「the slots array」. `fixedSchedule` has a default of `[]`,
    so it is a new array on every render, so `slots` is rebuilt on every render
    — and an effect depending on it ran, set state, and ran again. The suite
    stopped producing output at all, which is what an infinite render looks
    like from outside.
  */
  const nearbyAnchor = useMemo(() => {
    if (pickingAt === null) return undefined;
    const slot = slots.find(candidate => candidate.index === pickingAt);
    if (!slot) return undefined;
    const filled = slots
      .filter(candidate => candidate.occupantId)
      .map(candidate => ({ index: candidate.index, item: itemById.get(candidate.occupantId as string) }));
    const before = filled.filter(entry => entry.index < slot.index).pop()?.item;
    const after = filled.find(entry => entry.index > slot.index)?.item;
    const anchorStop = [before, after].find(item =>
      item && typeof item.latitude === 'number' && typeof item.longitude === 'number');
    // Nothing on the day to be near: 「places somewhere in this city」 is noise.
    /*
      What to ask for, decided by the slot.

      「若不是在編輯吃東西的時段時 推薦就不要是食物」 — a 15:30 下午行程 block was
      offered three Korean restaurants, because this only ever asked for
      restaurants. The saved-place half of the same sheet already led an
      activity with sights. See `LOOKING_FOR`.
    */
    return anchorStop
      ? {
        latitude: anchorStop.latitude as number,
        longitude: anchorStop.longitude as number,
        looking: (slot.kind === 'meal' ? 'food' : 'activity') as LookingFor,
      }
      : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickingAt]);

  /** One lookup per corner. See `nearbyPlaces`. */
  useEffect(() => {
    if (!nearbyAnchor) { setNearbyPlaces(current => (current.length === 0 ? current : [])); return; }
    let cancelled = false;
    void fetchNearbyRestaurants(nearbyAnchor.latitude, nearbyAnchor.longitude, nearbyAnchor.looking)
      .then(found => { if (!cancelled) setNearbyPlaces(found); });
    return () => { cancelled = true; };
  }, [nearbyAnchor]);

  const moveToward = (item: ItineraryItem, other: ItineraryItem, step: 1 | -1) => {
    const mine = minutesOfClock(item.time);
    const theirs = minutesOfClock(other.time);
    if (mine === undefined || theirs === undefined) { onSwapBlocks?.(item.id, other.id); return; }

    const wanted = step === 1 ? theirs - lengthOf(item) : theirs + lengthOf(other);
    // Already touching — or the move would push it through the other stop
    // rather than up against it. Either way the honest move is the swap.
    if (wanted === mine || (step === 1 ? wanted <= mine : wanted >= mine) || wanted < 0 || wanted >= 24 * 60) {
      onSwapBlocks?.(item.id, other.id);
      return;
    }
    onShiftBlock?.(item.id, clockOfMinutes(wanted));
  };

  return (
    <section data-testid="day-block-planner" className="mb-4 rounded-[22px] border border-[#e8e7f4] bg-white p-3">
      {/*
        A time input will not shrink, so everything around it has to be told it
        may.

        「這頁則是沒有滿版」 — this row was flex with no min-w-0 anywhere and no
        width on the control. A type="time" field reports a whole clock as its
        minimum width, so the row could not fit, the card could not fit, and
        the page ended up wider than the phone with its right edge cut off.
        Nothing here looked too wide; one thing simply refused to be narrower.
      */}
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="flex shrink-0 items-center gap-1.5 text-sm font-black text-[#11183d]">
          <Clock3 size={14} className="text-[#5b3df5]" />排今天
        </h3>
        {(
          <label className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-slate-500">
            <span className="shrink-0">幾點出門</span>
            {/*
              「這個也填過很多次了」.

              It was blank every time the screen opened and forgot whatever was
              typed, because nothing is stored by it: the input is an
              instruction to move the day, and once the day has moved the
              instruction is spent.

              So it reports instead. The day already starts at a time —
              whatever its first movable stop says — and that is what the field
              shows until somebody asks for a different one. Nothing to fill in
              twice, and the number beside 幾點出門 is true the moment it is read.
            */}
            <input
              type="time"
              value={chosenStart || firstMovableTime || ''}
              onChange={event => setChosenStart(event.target.value)}
              data-testid="day-start-input"
              className="w-[6.5rem] min-w-0 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-[#11183d]"
            />
          </label>
        )}
      </div>

      {/*
        What 幾點出門 does to the things already on the day.

        「橘色處調 紅色處是不是就要調」 — it was doing something deliberate and
        saying nothing: the grid opens at the earliest item already on the day,
        so that an item at 10:00 on a day starting at 11:00 still has a block
        rather than reading as deleted. From outside, the input did nothing.

        Offered rather than applied, because a `type="time"` field fires on
        every digit typed — rewriting the day on the way to 「11:00」 would move
        everything to 01:00 first. And it is the traveller's plan: it says what
        it will do before it does it.
      */}
      {shift && onShiftDay && (
        <button
          type="button"
          data-testid="shift-day-start"
          onClick={() => onShiftDay(shift.items)}
          className="mt-2 w-full rounded-xl border border-[#d9d5f5] bg-[#faf9ff] px-3 py-2 text-left text-[11px] font-bold text-[#5b3df5]"
        >
          今天的第一個行程排在 {firstMovableTime}，要把 {shift.movedCount} 個行程往後移 {shiftLabel} 嗎？
          <span className="mt-0.5 block font-medium text-slate-400">航班與入住時間不會動</span>
        </button>
      )}

      {/*
        What the day adds up to, geographically.

        「讓他們能一目瞭然的知道自己選的各項行程是否在同一個區塊」 — the colours on
        each card say where one stop is; this says what they come to together.
      */}
      {spread && spread.areas.length > 0 && (
        <p
          data-testid="day-area-spread"
          className={`mt-2 flex items-start gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-bold leading-5 ${
            daySpansTooManyAreas(spread) ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'
          }`}
        >
          {daySpansTooManyAreas(spread) && <AlertTriangle size={12} className="mt-0.5 shrink-0" />}
          {/*
            「這邊可以提示說：今日行程大多都集中在」.

            Led by where the day actually is, counted from the day's own stops
            — the old line named the trip cluster's label, which on a
            Setagaya-plus-Shibuya day read 「今天在 Minato City」. See `mainArea`.

            When the day does not mostly sit anywhere, it says how many areas
            it crosses instead of picking one.
          */}
          {/*
            「第一天這樣要寫說你的第一個行程在哪區」.

            One stop is not a route, and a day holding one has nothing to be
            warned about — but it still has an answer worth printing. Arrival
            day said 「今天跨了 4 個區・最遠兩點約 54.6 公里」 over a single museum;
            the other three areas were the airport, the ride in and the room,
            which `isChosen` now leaves out of the count entirely.
          */}
          <span>
            {spread.chosenCount <= 1
              ? (spread.firstArea ? `第一個行程在 ${spread.firstArea}` : '今天只排了一個行程')
              : <>
                  {spread.mainArea
                    ? `今日行程大多集中在 ${spread.mainArea}`
                    : `今天跨了 ${spread.areas.length} 個區`}
                  {spread.mainArea && spread.areas.length > 1 && `，另外跨到 ${spread.areas.length - 1} 區`}
                  {spread.longestHopKm !== undefined && spread.longestHopKm >= 1 && `・最遠兩點約 ${spread.longestHopKm} 公里`}
                </>}
          </span>
        </p>
      )}

      {/*
        Said where the overlap is visible, and only when there is one.
      */}
      {tidied.movedCount > 0 && onShiftDay && (
        <button
          type="button"
          data-testid="tidy-day-times"
          onClick={() => onShiftDay(tidied.items)}
          className="mt-2 w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[11px] font-bold text-amber-700"
        >
          今天有 {tidied.movedCount} 個行程的時間疊在一起，要把它們排開嗎？
          <span className="mt-0.5 block font-medium text-amber-600">航班、住宿與你固定的行程不會被動到</span>
        </button>
      )}

      {slots.length === 0 ? (
        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-3 text-[11px] font-bold text-slate-500">
          今天的航班佔掉了可以安排的時間。
        </p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {slots.map(slot => {
            const occupant = slot.occupantId ? itemById.get(slot.occupantId) : undefined;
            const area = occupant && areas ? areas.areaOfItem(occupant.id) : undefined;
            const fixed = occupant ? Boolean(isFixed?.(occupant)) : false;

            /*
              「在這個表上可以跟用戶再確認一次」.

              His 晚餐 rows held Leaves Coffee Roasters and Lonich. The
              automatic rules move a restaurant into a free meal window; what
              they cannot do is notice that a window ended up with a café in
              it and say so. Asked, never corrected — 咖啡當晚餐 is a real
              evening, and the row's own dropdown is already the way to change
              it if it was not meant.

              Silent when the tag is unknown: 「I cannot tell what this is」 is
              not a reason to query someone's dinner.
            */
            const tag = occupant && categoryOf ? categoryOf(occupant) : undefined;
            const askAboutTheMeal = slot.kind === 'meal' && occupant && tag && tag !== 'food'
              ? `這格是${slot.label}，但「${occupant.location || occupant.title}」是${CATEGORY_LABELS[tag as PlaceCategory] || tag}。確定嗎？`
              : undefined;

            return (
              <React.Fragment key={slot.id}>
              {/*
                Swipe right to delete, over a 刪除 that is already there.

                A gesture with nothing under it is a gesture nobody discovers,
                so the button is a real button in the row's own flow and the
                card slides off it. Fixed rows do not move: a flight is what
                the day is built around and this panel must not be able to
                remove one.
              */}
              <div className="relative overflow-hidden rounded-xl">
                {occupant && onClearBlock && !fixed && (
                  <button
                    type="button"
                    data-testid={`swipe-delete-${slot.index}`}
                    aria-label={`刪除 ${occupant.location || occupant.title}`}
                    onClick={() => { setSwipedId(null); onClearBlock(occupant.id); }}
                    className={`absolute inset-y-0 left-0 flex w-[88px] items-center justify-center rounded-l-xl bg-rose-500 text-xs font-black text-white ${
                      swipedId === occupant.id ? '' : 'pointer-events-none opacity-0'
                    }`}
                  >
                    <Trash2 size={13} className="mr-1" />刪除
                  </button>
                )}
              <div
                data-testid={`day-block-${slot.index}`}
                onTouchStart={event => {
                  if (!occupant || !onClearBlock || fixed) return;
                  dragFrom.current = { id: occupant.id, x: event.touches[0].clientX };
                }}
                onTouchEnd={event => {
                  const from = dragFrom.current;
                  dragFrom.current = null;
                  if (!from) return;
                  const moved = (event.changedTouches[0]?.clientX ?? from.x) - from.x;
                  // Right opens it; anything else puts it back.
                  setSwipedId(moved >= SWIPE_OPENS_AT ? from.id : null);
                }}
                style={occupant && swipedId === occupant.id
                  ? { transform: 'translateX(88px)' }
                  : undefined}
                className="relative flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-2.5 py-2 transition-transform"
              >
                <span className="flex w-[86px] shrink-0 items-center gap-1">
                  {/*
                    「這邊在左邊欄位直接可以有上下箭頭去移動排序」, and then
                    「這樣點擊就是一直在交換行程」.

                    The first version skipped empty rows to find something to
                    trade with, so on a day of two stops five hours apart the
                    arrows only ever swapped those two back and forth. 「Move
                    down」 means the next row — and when that row is empty,
                    moving into it is the whole point, not a no-op.

                    A fixed row is still a wall: swapping a flight with lunch
                    is not a reorder, it is a broken day.
                  */}
                  {(onSwapBlocks || onShiftBlock) && occupant && !fixed && (swapUp(slot) || swapDown(slot)) ? (
                    <span className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        data-testid={`move-up-${slot.index}`}
                        aria-label={`${occupant.location || occupant.title} 往前移`}
                        disabled={!swapUp(slot)}
                        onClick={() => { const other = swapUp(slot); if (other) moveToward(occupant, other, -1); }}
                        className="px-0.5 text-slate-300 disabled:opacity-30"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        type="button"
                        data-testid={`move-down-${slot.index}`}
                        aria-label={`${occupant.location || occupant.title} 往後移`}
                        disabled={!swapDown(slot)}
                        onClick={() => { const other = swapDown(slot); if (other) moveToward(occupant, other, 1); }}
                        className="px-0.5 text-slate-300 disabled:opacity-30"
                      >
                        <ChevronDown size={12} />
                      </button>
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {/*
                        「覺得要有1234」. Counted over the stops, not the rows:
                        an empty block is not the third thing he is doing
                        today, and numbering the gaps would make 「第 5 站」
                        mean nothing once one of them was filled.
                      */}
                      {stopNumber(slot) > 0 && (
                        <span
                          data-testid={`stop-number-${slot.index}`}
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#5b3df5] text-[9px] font-black text-white"
                        >
                          {stopNumber(slot)}
                        </span>
                      )}
                      <span className="block text-[11px] font-black text-[#11183d]">
                        {slot.startTime}–{slot.endTime}
                      </span>
                    </span>
                    <span className={`block text-[10px] font-bold ${slot.kind === 'meal' ? 'text-amber-600' : 'text-slate-400'}`}>
                      {slot.label}
                    </span>
                    {/*
                      Why this row is below the day rather than inside it.

                      「上方的行程表不會同步」 — the calendar had a stop at 22:43
                      and this table ended at 20:15, because the grid stops at
                      21:00. It is listed now; this line is what keeps it from
                      reading as an ordinary evening block.
                    */}
                    {slot.pastDayEnd && (
                      <span data-testid={`past-day-end-${slot.id}`} className="mt-0.5 block text-[10px] font-bold text-amber-600">
                        排在今天的時段之外
                      </span>
                    )}
                  </span>
                </span>

                {/*
                  Typing wins over the occupant: 自己輸入地點 is offered from a
                  filled row too, and the field only ever rendered in the empty
                  branch — so that button opened an input nobody could see.
                */}
                {occupant && typingAt !== slot.index ? (
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    {area && (
                      <span className={`h-2 w-2 shrink-0 rounded-full ${AREA_COLORS[area.colorIndex % AREA_COLORS.length].dot}`} />
                    )}
                    {/*
                      「選項也要有一個無」.

                      Every empty row already says 無, and once a row was filled
                      there was no way back to it: the slot could be given a
                      place and never taken one away, so undoing a wrong pick
                      meant leaving this panel entirely.

                      So a filled row keeps the same control an empty one has —
                      the place is a dropdown, with 無 at the top of it and the
                      whole collection below. One control answers both 「clear
                      this」 and 「no, the other one」.

                      Plain text where it cannot be changed: a flight is what
                      the day is built around, and a planner panel must not be
                      able to empty one.
                    */}
                    {onClearBlock && !fixed ? (
                      <button
                        type="button"
                        data-testid={`filled-block-${slot.index}`}
                        aria-label={`${slot.startTime} ${slot.label}・${occupant.location || occupant.title}`}
                        onClick={() => setPickingAt(slot.index)}
                        className="min-w-0 flex-1 truncate text-left text-xs font-bold text-[#11183d] underline decoration-violet-200 underline-offset-4"
                      >
                        {occupant.location || occupant.title}
                      </button>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#11183d]">
                        {occupant.location || occupant.title}
                      </span>
                    )}
                  </span>
                ) : (
                  <>
                  {/* 「欄位可以寫『無』」: an empty block is a stated answer, not a gap. */}
                  {!occupant && <span className="shrink-0 text-[11px] font-bold text-slate-300">無</span>}
                  {typingAt === slot.index ? (
                    /*
                      「下拉式選單要讓用戶也可以手動新增」.

                      The picker offered the collection and nothing else, so a
                      10:00 slot could only be filled by somebody who had
                      already saved the place — a traveller planning a morning
                      around a shop a friend just mentioned had to leave,
                      save it, and come back.

                      Only a name arrives this way, and the screens downstream
                      already say so: no coordinates means the transport card
                      cannot compute travel time and no map link is built.
                      That is the honest outcome. Inventing a location from a
                      typed string is how a day gets planned around the wrong
                      building.
                    */
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <input
                        autoFocus
                        data-testid={`manual-block-input-${slot.index}`}
                        aria-label={`${slot.startTime} 自己輸入地點`}
                        value={typed}
                        maxLength={MAX_TITLE}
                        placeholder="輸入地點名稱"
                        onChange={event => setTyped(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') commitTyped(slot);
                          if (event.key === 'Escape') cancelTyping();
                        }}
                        className="min-w-0 flex-1 rounded-lg border border-violet-300 bg-white px-2 py-1.5 text-xs font-bold text-[#11183d] outline-none placeholder:font-medium placeholder:text-slate-300"
                      />
                      <button
                        type="button"
                        data-testid={`manual-block-save-${slot.index}`}
                        disabled={!cleanManualTitle(typed)}
                        onClick={() => commitTyped(slot)}
                        className="shrink-0 rounded-lg bg-[#5b3df5] px-2.5 py-1.5 text-[11px] font-black text-white disabled:bg-slate-200 disabled:text-slate-400"
                      >
                        加入
                      </button>
                      <button
                        type="button"
                        aria-label="取消輸入"
                        onClick={cancelTyping}
                        className="shrink-0 px-1 text-[11px] font-black text-slate-400"
                      >
                        ✕
                      </button>
                    </span>
                  ) : (
                  emptiedSlotIds.includes(slot.id) ? (
                  /*
                    Decided against, and saying so. The row keeps its time and
                    its name so the day still reads as a day; what it loses is
                    the pile of suggestions under a question already answered.
                  */
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-400">沒有安排</span>
                    {onToggleEmptied && (
                      <button
                        type="button"
                        data-testid={`unempty-block-${slot.index}`}
                        onClick={() => onToggleEmptied(slot.id)}
                        className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-black text-[#5b3df5]"
                      >
                        還是排一個
                      </button>
                    )}
                  </span>
                  ) : (
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex gap-1">
                    <button
                      type="button"
                      data-testid={`fill-block-${slot.index}`}
                      aria-label={`${slot.startTime} ${slot.label}`}
                      onClick={() => setPickingAt(slot.index)}
                      className="w-full rounded-lg border border-violet-200 bg-violet-50/40 px-2 py-1.5 text-left text-xs font-bold text-[#5b3df5]"
                    >
                      ＋ 選一個地點
                    </button>
                    {/*
                      「要有『無』的選項」. Beside the pick rather than inside it:
                      saying there is nothing here is an answer, not one of the
                      places on offer.
                    */}
                    {onToggleEmptied && (
                      <button
                        type="button"
                        data-testid={`empty-block-${slot.index}`}
                        aria-label={`${slot.startTime} ${slot.label} 不安排`}
                        onClick={() => onToggleEmptied(slot.id)}
                        className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-400"
                      >
                        無
                      </button>
                    )}
                    </span>
                    {/*
                      「有空白行程的時候 會直接顯示附近的好地點 從收藏的優先推薦」.

                      An empty row offered a button, and pressing it opened
                      fifty places for somebody to compare against a gap they
                      can see. Which of them fits is arithmetic, and it is the
                      same sum the meal advice already does. See
                      `suggestionsForSlot`.
                    */}
                    {suggestionsFor(slot).length > 0 && (
                      <span data-testid={`slot-suggestions-${slot.index}`} className="flex flex-wrap gap-1">
                        {suggestionsFor(slot).map(suggestion => (
                          <button
                            key={suggestion.id}
                            type="button"
                            data-testid={`suggest-${slot.index}-${suggestion.id}`}
                            onClick={() => replaceInSlot(slot, () => onFillBlock(slot, suggestion.id))}
                            className="max-w-full truncate rounded-lg bg-[#f4f1ff] px-2 py-1 text-[10px] font-bold text-[#5b3df5]"
                          >
                            {suggestion.placeName}
                            {suggestion.detourKm >= 0.1 && `・繞 ${suggestion.detourKm} 公里`}
                          </button>
                        ))}
                      </span>
                    )}
                  </span>
                  )
                  )}
                  </>
                )}

                {/*
                  How long it runs — and everything after it moves with it.

                  Never offered on a flight or a check-in: 「航班時間是固定的行程」,
                  and a length control on one is an invitation to break the one
                  thing the day is built around.
                */}
                {occupant && onChangeDuration && !fixed && (
                  <select
                    data-testid={`block-duration-${slot.index}`}
                    aria-label={`${occupant.location || occupant.title} 停留時間`}
                    value={String(slot.durationMinutes)}
                    onChange={event => onChangeDuration(occupant.id, Number(event.target.value))}
                    className="shrink-0 rounded-lg border border-slate-200 px-1.5 py-1 text-[10px] font-bold text-slate-600"
                  >
                    {Array.from(new Set([...DURATION_CHOICES, slot.durationMinutes]))
                      .sort((left, right) => left - right)
                      .map(minutes => (
                        <option key={minutes} value={minutes}>{minutesLabel(minutes)}</option>
                      ))}
                  </select>
                )}
                {/*
                  A pin is the traveller's own and can be taken back here; a
                  flight is not and stays a plain label.
                */}
                {occupant && fixed && onUnpin && occupant.isPinned === true ? (
                  <button
                    type="button"
                    data-testid={`unpin-block-${slot.index}`}
                    aria-label={`取消固定 ${occupant.location || occupant.title}`}
                    onClick={() => onUnpin(occupant.id)}
                    className="shrink-0 rounded-lg bg-[#f0edff] px-1.5 py-1 text-[10px] font-bold text-[#5b3df5]"
                  >
                    已固定・取消
                  </button>
                ) : occupant && fixed ? (
                  <span className="shrink-0 rounded-lg bg-slate-100 px-1.5 py-1 text-[10px] font-bold text-slate-500">固定</span>
                ) : null}
              </div>
              </div>
              {askAboutTheMeal && (
                <p
                  data-testid={`meal-check-${slot.index}`}
                  className="ml-2.5 mt-0.5 text-[10px] font-bold leading-4 text-amber-600"
                >
                  {askAboutTheMeal}
                </p>
              )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {ranOutOfDay && (
        <p data-testid="day-ran-out" className="mt-2 flex items-start gap-1.5 text-[11px] font-bold leading-5 text-amber-700">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          延長之後，後面的時段排不進今天了。
        </p>
      )}

      {/* Said after the blocks, because it is what ends them. */}
      {beAtAirportBy && (
        <p
          data-testid="day-closes-for-airport"
          className="mt-2 flex items-start gap-1.5 rounded-xl bg-rose-50 px-2.5 py-2 text-[11px] font-black leading-5 text-rose-700"
        >
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>
            {leaveForAirportAt
              ? `${leaveForAirportAt.at} 就要出發去機場（約 ${leaveForAirportAt.journey} 分），${beAtAirportBy} 前要到，之後不要再排行程`
              : `${beAtAirportBy} 前要到機場，之後不要再排行程`}
          </span>
        </p>
      )}

      {/*
        Choosing happens here, where the note and the photo are. See
        `PlacePickerSheet`.
      */}
      {pickingAt !== null && (() => {
        const slot = slots.find(candidate => candidate.index === pickingAt);
        if (!slot) return null;
        const sitting = slot.occupantId ? itemById.get(slot.occupantId) : undefined;
        return (
          <PlacePickerSheet
            nearby={nearbyPlaces}
            /*
              「這裡還需要：更多搜尋🔍」 — biased to the same corner the three
              offers came from, so a name still lands near the day's stops.
            */
            onSearchNearby={nearbyAnchor
              ? wanted => fetchNearbyRestaurants(
                nearbyAnchor.latitude, nearbyAnchor.longitude, nearbyAnchor.looking, wanted,
              )
              : undefined}
            onPickNearby={onFillBlockManually
              ? placeName => {
                setPickingAt(null);
                replaceInSlot(slot, () => onFillBlockManually(slot, placeName));
              }
              : undefined}
            title={`${slot.startTime}–${slot.endTime}・${slot.label}`}
            places={groupedOptionsFor(slot).flatMap(group => group.places)}
            onPick={placeId => {
              setPickingAt(null);
              /* Re-picking what is already there is 「clear」, not 「clear and re-add」. */
              if (sitting && sitting.id === placeId) { onClearBlock?.(sitting.id); return; }
              replaceInSlot(slot, () => onFillBlock(slot, placeId));
            }}
            onClose={() => setPickingAt(null)}
            onClear={sitting && onClearBlock
              ? () => { setPickingAt(null); onClearBlock(sitting.id); }
              : undefined}
            onTypeYourOwn={onFillBlockManually
              ? () => { setPickingAt(null); setTypingAt(slot.index); setTyped(''); }
              : undefined}
          />
        );
      })()}

      <p className="mt-2 text-[10px] leading-4 text-slate-400">
        每格預設 {minutesLabel(BLOCK_MINUTES)}，含移動時間。改了長度，後面的時段會自動順延或提前。
      </p>
    </section>
  );
};

export default DayBlockPlanner;
