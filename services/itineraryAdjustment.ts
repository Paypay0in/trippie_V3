import { ItineraryItem } from '../types';
import {
  buildInspirationIndex,
  enumerateTripDates,
  isValidProposalDate,
  matchSelection,
  normalizeKey,
  ProposedItineraryItem,
  toValidTime,
} from './itineraryPlanningService';
import {
  distanceInKm,
  PlaceCoordinates,
  TripPlanningInput,
  TripPlanningInspirationSelection,
} from './tripInspirationSelection';

/**
 * AI adjustment of an itinerary that already has items.
 *
 * The whole point of this module is that an existing plan is data the AI must
 * read, not a blank slate it may overwrite. Three invariants hold everywhere:
 *
 *  - Nothing here mutates the official itinerary. A proposal is a diff; only
 *    `applyItineraryAdjustment` produces new items, and only the caller persists.
 *  - Existing items are addressed by their stable itinerary item id. A place
 *    name is never an identity, so a name can neither move nor delete an item.
 *  - A removal is never implicit. Modes that may not remove have their remove
 *    changes rejected with a warning rather than quietly applied.
 */

export type ItineraryAdjustmentMode = 'add' | 'reorder' | 'replan';

/** Which change types each mode is allowed to express. Section 8 safety, in data. */
const ALLOWED_CHANGE_TYPES: Record<ItineraryAdjustmentMode, ReadonlySet<ItineraryAdjustmentChangeType>> = {
  add: new Set<ItineraryAdjustmentChangeType>(['add']),
  reorder: new Set<ItineraryAdjustmentChangeType>(['add', 'move', 'update']),
  replan: new Set<ItineraryAdjustmentChangeType>(['add', 'move', 'update', 'remove']),
};

export type ItineraryAdjustmentChangeType = 'add' | 'move' | 'update' | 'remove';

/** Shown whenever a proposal touched a pinned item and we dropped the change. */
export const PINNED_CONFLICT_WARNING = '部分 AI 建議與已固定行程衝突，已自動忽略。';

/**
 * What the AI is shown about one existing item. Derived from the canonical
 * ItineraryItem — this is an adapter at the AI boundary, not a second store.
 */
export interface ExistingItinerarySnapshotItem {
  /** The canonical ItineraryItem.id. Every change refers back to this. */
  id: string;
  date?: string;
  startTime?: string;
  durationMinutes?: number;
  placeName: string;
  placeId?: string;
  coordinates?: PlaceCoordinates;
  address?: string;
  /** Where this item came from, so the AI can respect provenance. */
  provenance: 'saved_inspiration' | 'ai_suggestion' | 'flight_anchor' | 'expense' | 'manual';
  sourceInspirationIds?: string[];
  notes?: string;
  /**
   * Derived, expense-linked or fixed items. The AI may read them for context but
   * may not move, change or delete them: a flight anchor is regenerated from the
   * saved flight, an expense-linked item would orphan that expense, and a fixed
   * event — a flight, a train, a booked table — is a hard constraint the plan has
   * to work around rather than something to reschedule.
   */
  locked: boolean;
  /** True for a hard time constraint, so the AI can plan around it explicitly. */
  fixedEvent?: boolean;
  /** True when the user pinned this item. A hard anchor in every mode. */
  isPinned?: boolean;
}

export interface ItineraryAdjustmentChange {
  type: ItineraryAdjustmentChangeType;
  /** Required for move/update/remove. Always a real existing itinerary item id. */
  existingItemId?: string;
  /** Filled in from the snapshot, never from the model, so the preview is truthful. */
  fromDate?: string;
  fromTime?: string;
  toDate?: string;
  toTime?: string;
  /** Only ever set on an `add`. */
  proposedItem?: ProposedItineraryItem;
  /** Only the fields an `update` explicitly proposes. */
  updatedDurationMinutes?: number;
  updatedNote?: string;
  reason?: string;
}

export interface ItineraryAdjustmentProposal {
  mode: ItineraryAdjustmentMode;
  changes: ItineraryAdjustmentChange[];
  summary: string;
  warnings: string[];
}

export interface ItineraryAdjustmentInput extends TripPlanningInput {
  adjustmentMode: ItineraryAdjustmentMode;
  existingItinerary: ExistingItinerarySnapshotItem[];
  analysis: ItineraryAnalysis;
}

/* ------------------------------------------------------------------ *
 * Snapshot: canonical itinerary -> AI input
 * ------------------------------------------------------------------ */

const coordinatesOf = (item: Pick<ItineraryItem, 'latitude' | 'longitude'>): PlaceCoordinates | undefined =>
  typeof item.latitude === 'number' && Number.isFinite(item.latitude) && Math.abs(item.latitude) <= 90
    && typeof item.longitude === 'number' && Number.isFinite(item.longitude) && Math.abs(item.longitude) <= 180
    && !(item.latitude === 0 && item.longitude === 0)
    ? { latitude: item.latitude, longitude: item.longitude }
    : undefined;

const provenanceOf = (item: ItineraryItem): ExistingItinerarySnapshotItem['provenance'] => {
  if (item.derivedFromFlightAnchorId) return 'flight_anchor';
  if (item.linkedExpenseId) return 'expense';
  if (item.origin === 'saved_inspiration') return 'saved_inspiration';
  if (item.origin === 'ai_suggestion') return 'ai_suggestion';
  return 'manual';
};

/**
 * A flight anchor is regenerated from saved flight data, an expense link would
 * orphan, a fixed event is a constraint rather than a suggestion, and a pinned
 * item is one the user has explicitly told us to leave alone. None of the four
 * may be rescheduled by the planner.
 */
export const isLockedItineraryItem = (item: ItineraryItem): boolean =>
  Boolean(item.derivedFromFlightAnchorId)
  || Boolean(item.linkedExpenseId)
  || item.scheduleFlexibility === 'fixed'
  || item.isPinned === true;

/** True only for the user's own pin, which carries its own user-facing message. */
export const isPinnedItineraryItem = (item: ItineraryItem): boolean => item.isPinned === true;

/**
 * Adapter from the official itinerary to what the AI reads. Deliberately lossy:
 * it carries identity, schedule, geography and provenance, and nothing else.
 */
export const buildExistingItinerarySnapshot = (
  itinerary: ItineraryItem[],
): ExistingItinerarySnapshotItem[] =>
  itinerary
    .filter(item => item && typeof item.id === 'string' && Boolean(item.id))
    .map(item => ({
      id: item.id,
      date: isValidProposalDate(item.date) ? item.date : undefined,
      startTime: toValidTime(item.time),
      durationMinutes: typeof item.durationMinutes === 'number' && item.durationMinutes > 0 ? item.durationMinutes : undefined,
      placeName: (item.location || item.title || '').trim(),
      placeId: item.placeId?.trim() || undefined,
      coordinates: coordinatesOf(item),
      address: item.address?.trim() || undefined,
      provenance: provenanceOf(item),
      sourceInspirationIds: item.sourceInspirationIds?.length ? [...item.sourceInspirationIds] : undefined,
      notes: item.notes?.trim() || undefined,
      locked: isLockedItineraryItem(item),
      ...(item.scheduleFlexibility === 'fixed' || item.derivedFromFlightAnchorId ? { fixedEvent: true } : {}),
      ...(item.isPinned === true ? { isPinned: true } : {}),
    }))
    .filter(item => Boolean(item.placeName));

/* ------------------------------------------------------------------ *
 * Analysis: deterministic facts handed to the AI
 * ------------------------------------------------------------------ */

/** Items on one day beyond this count make the day feel packed. */
const CROWDED_DAY_ITEM_COUNT = 5;
/** Minutes between the end of one item and the start of the next, below which the day is tight. */
const TIGHT_GAP_MINUTES = 30;
/**
 * Kilometres between consecutive same-day items that reads as a detour. Tuned for
 * a city trip: crossing Busan from 甘川文化村 to 海雲台 is ~15km and is exactly the
 * kind of back-and-forth 重新安排路線 exists to fix.
 */
const LONG_HOP_KM = 12;

export interface ItineraryAnalysis {
  /** Trip dates that hold no items at all. */
  emptyDates: string[];
  /** Dates carrying more items than a comfortable day. */
  crowdedDates: string[];
  /** Items with no start time, so they cannot be sequenced. */
  untimedItemIds: string[];
  /** Consecutive same-day pairs left less than TIGHT_GAP_MINUTES apart. */
  tightTransitions: Array<{ fromItemId: string; toItemId: string; gapMinutes: number }>;
  /** Consecutive same-day pairs that are geographically far apart. */
  longHops: Array<{ fromItemId: string; toItemId: string; distanceKm: number }>;
  /** Selected saved inspirations not represented anywhere in the itinerary. */
  unusedInspirationIds: string[];
}

const minutesOf = (time?: string): number | undefined => {
  const valid = toValidTime(time);
  if (!valid) return undefined;
  const [hours, minutes] = valid.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Facts about the current plan, computed here rather than asked of the model.
 * A crowded day is a counting question, not a judgement call, and computing it
 * locally means the preview and the prompt can never disagree about it.
 */
export const analyzeExistingItinerary = (
  snapshot: ExistingItinerarySnapshotItem[],
  options: { startDate?: string; endDate?: string; selections?: TripPlanningInspirationSelection[] } = {},
): ItineraryAnalysis => {
  const byDate = new Map<string, ExistingItinerarySnapshotItem[]>();
  const untimedItemIds: string[] = [];
  snapshot.forEach(item => {
    if (!item.startTime) untimedItemIds.push(item.id);
    if (!item.date) return;
    const bucket = byDate.get(item.date);
    if (bucket) bucket.push(item);
    else byDate.set(item.date, [item]);
  });

  const tripDates = enumerateTripDates(options.startDate, options.endDate);
  const emptyDates = tripDates.filter(date => !byDate.has(date));
  const crowdedDates = Array.from(byDate.entries())
    .filter(([, items]) => items.length > CROWDED_DAY_ITEM_COUNT)
    .map(([date]) => date)
    .sort();

  const tightTransitions: ItineraryAnalysis['tightTransitions'] = [];
  const longHops: ItineraryAnalysis['longHops'] = [];
  Array.from(byDate.values()).forEach(items => {
    const timed = items
      .filter(item => item.startTime)
      .sort((left, right) => (left.startTime || '').localeCompare(right.startTime || ''));
    for (let index = 0; index + 1 < timed.length; index += 1) {
      const current = timed[index];
      const next = timed[index + 1];
      const start = minutesOf(current.startTime);
      const nextStart = minutesOf(next.startTime);
      if (start !== undefined && nextStart !== undefined) {
        const gap = nextStart - start - (current.durationMinutes || 0);
        if (gap < TIGHT_GAP_MINUTES) {
          tightTransitions.push({ fromItemId: current.id, toItemId: next.id, gapMinutes: gap });
        }
      }
      if (current.coordinates && next.coordinates) {
        const distance = distanceInKm(current.coordinates, next.coordinates);
        if (distance > LONG_HOP_KM) {
          longHops.push({ fromItemId: current.id, toItemId: next.id, distanceKm: Math.round(distance) });
        }
      }
    }
  });

  // Saved places the user picked but which are not in the plan yet. Matched on
  // inspiration id and resolved placeId only — never on the display name.
  const usedInspirationIds = new Set<string>();
  const usedPlaceIds = new Set<string>();
  snapshot.forEach(item => {
    (item.sourceInspirationIds || []).forEach(id => usedInspirationIds.add(id));
    if (item.placeId) usedPlaceIds.add(item.placeId);
  });
  const unusedInspirationIds = (options.selections || [])
    .filter(selection => !selection.inspirationIds.some(id => usedInspirationIds.has(id))
      && !(selection.placeId && usedPlaceIds.has(selection.placeId)))
    .flatMap(selection => selection.inspirationIds);

  return { emptyDates, crowdedDates, untimedItemIds, tightTransitions, longHops, unusedInspirationIds };
};

/* ------------------------------------------------------------------ *
 * Normalization: raw model response -> trustworthy diff
 * ------------------------------------------------------------------ */

interface RawChange {
  type?: unknown;
  existingItemId?: unknown;
  toDate?: unknown;
  toTime?: unknown;
  durationMinutes?: unknown;
  note?: unknown;
  reason?: unknown;
  proposedItem?: unknown;
}

const MODE_LABELS: Record<ItineraryAdjustmentMode, string> = {
  add: '補充行程',
  reorder: '重新安排路線',
  replan: '重新規劃',
};

const toPositiveMinutes = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(Math.round(value), 24 * 60)
    : undefined;

const toTrimmedText = (value: unknown, maxLength = 300): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined;

/**
 * Turns the model's change list into a diff that is safe to show and safe to
 * apply. Every rejection is counted and surfaced as a warning: the user is told
 * that the AI asked for something the mode forbids, rather than the request
 * disappearing without trace.
 */
export const normalizeItineraryAdjustment = (
  raw: unknown,
  input: ItineraryAdjustmentInput,
): ItineraryAdjustmentProposal => {
  const mode = input.adjustmentMode;
  const allowed = ALLOWED_CHANGE_TYPES[mode];
  const warnings: string[] = [];

  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const rawChanges = Array.isArray(source.changes) ? source.changes : [];
  const modelWarnings = Array.isArray(source.warnings)
    ? source.warnings.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    : [];

  const allowedDates = new Set(enumerateTripDates(input.startDate, input.endDate));
  const existingById = new Map(input.existingItinerary.map(item => [item.id, item]));
  const inspirationIndex = buildInspirationIndex(input.selections);

  // Places already in the plan, so an add cannot recommend one of them twice.
  //
  // Identity (placeId / inspiration id) is what proves a repeat. The name set is a
  // second, deliberately blunt guard used only against an add that carries no
  // identity at all: a bare 「海雲台」 suggestion next to an existing 海雲台 is far more
  // likely a repeat than a genuine second place, and the cost of being wrong is
  // only a missing suggestion. Note the asymmetry — a name may block an addition,
  // but it still never grants one a placeId or Saved Inspiration provenance.
  const existingPlaceIds = new Set<string>();
  const existingInspirationIds = new Set<string>();
  const existingNames = new Set<string>();
  input.existingItinerary.forEach(item => {
    if (item.placeId) existingPlaceIds.add(item.placeId);
    (item.sourceInspirationIds || []).forEach(id => existingInspirationIds.add(id));
    existingNames.add(normalizeKey(item.placeName));
  });

  const changes: ItineraryAdjustmentChange[] = [];
  // One change per existing item: two moves of the same item cannot both be true,
  // and applying them in sequence would silently pick the last one.
  const touchedItemIds = new Set<string>();
  const addedPlaceKeys = new Set<string>();

  let forbiddenByMode = 0;
  let unknownItemReferences = 0;
  let lockedItemReferences = 0;
  let pinnedItemReferences = 0;
  let duplicateAdds = 0;
  let outOfRangeDates = 0;

  rawChanges.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const change = entry as RawChange;
    const type = change.type;
    if (type !== 'add' && type !== 'move' && type !== 'update' && type !== 'remove') return;

    if (!allowed.has(type)) { forbiddenByMode += 1; return; }

    const reason = toTrimmedText(change.reason);

    if (type === 'add') {
      const rawItem = change.proposedItem && typeof change.proposedItem === 'object'
        ? change.proposedItem as Record<string, unknown>
        : undefined;
      if (!rawItem) return;

      const selection = matchSelection(rawItem, inspirationIndex);
      const placeName = selection
        ? selection.placeName
        : (typeof rawItem.placeName === 'string' ? rawItem.placeName.trim() : '');
      if (!placeName) return;

      const toDate = isValidProposalDate(change.toDate) ? change.toDate : undefined;
      if (change.toDate !== undefined && !toDate) { outOfRangeDates += 1; return; }
      if (toDate && allowedDates.size > 0 && !allowedDates.has(toDate)) { outOfRangeDates += 1; return; }

      // Never recommend a place the plan already holds.
      const nameKey = normalizeKey(placeName);
      const alreadyPlanned = (selection?.placeId && existingPlaceIds.has(selection.placeId))
        || selection?.inspirationIds.some(id => existingInspirationIds.has(id))
        || (!selection && existingNames.has(nameKey));
      const addKey = selection ? `group:${selection.groupId}` : `name:${nameKey}`;
      if (alreadyPlanned || addedPlaceKeys.has(addKey)) { duplicateAdds += 1; return; }
      addedPlaceKeys.add(addKey);

      const proposedItem: ProposedItineraryItem = selection
        ? {
            id: `adjust-add-${index}-${addKey}`,
            placeName: selection.placeName,
            // Canonical identity comes from the saved place, never from the model.
            placeId: selection.placeId,
            coordinates: selection.coordinates,
            address: selection.address,
            suggestedStartTime: toValidTime(rawItem.suggestedStartTime),
            durationMinutes: toPositiveMinutes(rawItem.durationMinutes),
            note: toTrimmedText(rawItem.note),
            sourceInspirationIds: [...selection.inspirationIds],
            source: 'saved_inspiration',
          }
        : {
            id: `adjust-add-${index}-${addKey}`,
            placeName,
            // A model cannot invent a Google placeId; enrichment resolves it later.
            placeId: undefined,
            coordinates: undefined,
            suggestedStartTime: toValidTime(rawItem.suggestedStartTime),
            durationMinutes: toPositiveMinutes(rawItem.durationMinutes),
            note: toTrimmedText(rawItem.note),
            sourceInspirationIds: [],
            source: 'ai_suggestion',
          };

      changes.push({ type: 'add', toDate, toTime: proposedItem.suggestedStartTime, proposedItem, reason });
      return;
    }

    // move / update / remove all address an existing item by its stable id.
    const existingItemId = typeof change.existingItemId === 'string' ? change.existingItemId.trim() : '';
    const existing = existingItemId ? existingById.get(existingItemId) : undefined;
    if (!existing) { unknownItemReferences += 1; return; }
    if (existing.locked) {
      // The user's own pin gets its own message; other locks share the generic one.
      if (existing.isPinned) pinnedItemReferences += 1;
      else lockedItemReferences += 1;
      return;
    }
    if (touchedItemIds.has(existing.id)) return;

    if (type === 'remove') {
      touchedItemIds.add(existing.id);
      changes.push({
        type: 'remove',
        existingItemId: existing.id,
        fromDate: existing.date,
        fromTime: existing.startTime,
        reason,
      });
      return;
    }

    const toDate = isValidProposalDate(change.toDate) ? change.toDate : undefined;
    if (change.toDate !== undefined && change.toDate !== null && !toDate) { outOfRangeDates += 1; return; }
    if (toDate && allowedDates.size > 0 && !allowedDates.has(toDate)) { outOfRangeDates += 1; return; }
    const toTime = toValidTime(change.toTime);

    if (type === 'move') {
      // A move that changes neither date nor time is not a change.
      const nextDate = toDate || existing.date;
      const nextTime = toTime || existing.startTime;
      if (nextDate === existing.date && nextTime === existing.startTime) return;
      touchedItemIds.add(existing.id);
      changes.push({
        type: 'move',
        existingItemId: existing.id,
        fromDate: existing.date,
        fromTime: existing.startTime,
        toDate,
        toTime,
        reason,
      });
      return;
    }

    const updatedDurationMinutes = toPositiveMinutes(change.durationMinutes);
    const updatedNote = toTrimmedText(change.note);
    if (updatedDurationMinutes === undefined && updatedNote === undefined && !toTime && !toDate) return;
    touchedItemIds.add(existing.id);
    changes.push({
      type: 'update',
      existingItemId: existing.id,
      fromDate: existing.date,
      fromTime: existing.startTime,
      toDate,
      toTime,
      updatedDurationMinutes,
      updatedNote,
      reason,
    });
  });

  if (forbiddenByMode > 0) {
    warnings.push(mode === 'add'
      ? `AI 想更動 ${forbiddenByMode} 個既有項目，但「${MODE_LABELS.add}」只會新增，不會搬動或刪除既有安排，已全部略過。`
      : `AI 提出了 ${forbiddenByMode} 個「${MODE_LABELS[mode]}」不允許的更動（例如刪除既有項目），已全部略過。`);
  }
  if (unknownItemReferences > 0) warnings.push(`AI 有 ${unknownItemReferences} 個更動指向不存在的行程項目，已略過。`);
  if (pinnedItemReferences > 0) warnings.push(PINNED_CONFLICT_WARNING);
  if (lockedItemReferences > 0) warnings.push(`AI 有 ${lockedItemReferences} 個更動指向航班錨點或已連結支出的項目，這些不能被調整，已略過。`);
  if (duplicateAdds > 0) warnings.push(`AI 重複建議了 ${duplicateAdds} 個行程中已有的地點，已略過。`);
  if (outOfRangeDates > 0) warnings.push(`AI 有 ${outOfRangeDates} 個更動使用了旅程範圍外的日期，已略過。`);

  const summary = toTrimmedText(source.summary, 400)
    || (changes.length > 0 ? `AI 提出 ${changes.length} 項調整。` : 'AI 這次沒有提出可套用的調整。');

  return { mode, changes, summary, warnings: [...modelWarnings, ...warnings] };
};

/* ------------------------------------------------------------------ *
 * Apply: diff -> new canonical itinerary
 * ------------------------------------------------------------------ */

export interface ItineraryAdjustmentApplyResult {
  items: ItineraryItem[];
  addedCount: number;
  movedCount: number;
  updatedCount: number;
  removedCount: number;
  /** Changes dropped because the target is pinned in the CURRENT itinerary. */
  pinnedConflictCount: number;
}

const byDateThenTime = (left: ItineraryItem, right: ItineraryItem): number => {
  const dateOrder = (left.date || '9999-99-99').localeCompare(right.date || '9999-99-99');
  if (dateOrder !== 0) return dateOrder;
  return (left.time || '99:99').localeCompare(right.time || '99:99');
};

/**
 * Applies a normalized adjustment to the official itinerary.
 *
 * Existing items are located by id and only by id, so an item whose place name
 * matches another is never touched by mistake. A change whose target vanished
 * between preview and apply is skipped rather than guessed at, and the mode's
 * own rules are enforced a second time here: normalization is the UI's guard,
 * this is the data's guard, and a caller cannot bypass it by hand-building a
 * proposal.
 */
export const applyItineraryAdjustment = (
  existing: ItineraryItem[],
  proposal: ItineraryAdjustmentProposal,
  createId: () => string,
): ItineraryAdjustmentApplyResult => {
  const allowed = ALLOWED_CHANGE_TYPES[proposal.mode];
  const byId = new Map(existing.map(item => [item.id, item]));

  const removedIds = new Set<string>();
  const patches = new Map<string, Partial<ItineraryItem>>();
  const additions: ItineraryItem[] = [];
  let addedCount = 0;
  let movedCount = 0;
  let updatedCount = 0;
  let removedCount = 0;
  let pinnedConflictCount = 0;

  proposal.changes.forEach(change => {
    if (!allowed.has(change.type)) return;

    if (change.type === 'add') {
      const item = change.proposedItem;
      if (!item) return;
      additions.push({
        id: createId(),
        date: change.toDate,
        time: change.toTime || item.suggestedStartTime || '',
        title: item.placeName,
        location: item.placeName,
        notes: item.note || '',
        type: 'ACTIVITY',
        isCompleted: false,
        ...(item.placeId ? { placeId: item.placeId } : {}),
        ...(item.address ? { address: item.address } : {}),
        ...(item.coordinates ? { latitude: item.coordinates.latitude, longitude: item.coordinates.longitude } : {}),
        ...(item.durationMinutes ? { durationMinutes: item.durationMinutes } : {}),
        origin: item.source,
        ...(item.sourceInspirationIds.length > 0 ? { sourceInspirationIds: [...item.sourceInspirationIds] } : {}),
      });
      addedCount += 1;
      return;
    }

    const target = change.existingItemId ? byId.get(change.existingItemId) : undefined;
    // A locked item is never applied against, whatever the proposal claims.
    // Pinned status is re-read from the itinerary as it is NOW, so an item
    // pinned after the proposal was generated is still protected.
    if (!target) return;
    if (isLockedItineraryItem(target)) {
      if (isPinnedItineraryItem(target)) pinnedConflictCount += 1;
      return;
    }

    if (change.type === 'remove') {
      if (removedIds.has(target.id)) return;
      removedIds.add(target.id);
      removedCount += 1;
      return;
    }

    const patch: Partial<ItineraryItem> = {};
    if (change.toDate) patch.date = change.toDate;
    if (change.toTime) patch.time = change.toTime;
    if (change.type === 'update') {
      if (change.updatedDurationMinutes !== undefined) patch.durationMinutes = change.updatedDurationMinutes;
      if (change.updatedNote !== undefined) patch.notes = change.updatedNote;
    }
    if (Object.keys(patch).length === 0) return;

    const existingPatch = patches.get(target.id);
    patches.set(target.id, existingPatch ? { ...existingPatch, ...patch } : patch);
    if (change.type === 'move') movedCount += 1;
    else updatedCount += 1;
  });

  const items = existing
    .filter(item => !removedIds.has(item.id))
    .map(item => {
      const patch = patches.get(item.id);
      return patch ? { ...item, ...patch } : item;
    })
    .concat(additions)
    .sort(byDateThenTime);

  return { items, addedCount, movedCount, updatedCount, removedCount, pinnedConflictCount };
};

/* ------------------------------------------------------------------ *
 * Request
 * ------------------------------------------------------------------ */

export class ItineraryAdjustmentRequestError extends Error {
  status: number;
  provider?: string;
  model?: string;

  constructor(message: string, status: number, details?: { provider?: string; model?: string }) {
    super(message);
    this.name = 'ItineraryAdjustmentRequestError';
    this.status = status;
    this.provider = details?.provider;
    this.model = details?.model;
  }
}

/**
 * Asks the shared itinerary route for an adjustment. Returns a diff and nothing
 * else: this function cannot and does not write to the official itinerary.
 */
export async function generateItineraryAdjustment(
  input: ItineraryAdjustmentInput,
): Promise<ItineraryAdjustmentProposal> {
  let response: Response;
  try {
    response = await fetch('/api/itinerary-proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (error) {
    throw new ItineraryAdjustmentRequestError(
      error instanceof Error && error.name === 'AbortError' ? 'AI 行程調整逾時。' : 'AI 行程調整服務無法連線。',
      0,
    );
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new ItineraryAdjustmentRequestError(
      typeof payload?.error === 'string' ? payload.error : 'AI 行程調整服務暫時無法使用。',
      response.status,
      {
        provider: typeof payload?.provider === 'string' ? payload.provider : undefined,
        model: typeof payload?.model === 'string' ? payload.model : undefined,
      },
    );
  }

  return normalizeItineraryAdjustment(payload, input);
}

/** Builds the full canonical adjustment input from the trip's own data. */
export const buildItineraryAdjustmentInput = (
  base: TripPlanningInput,
  mode: ItineraryAdjustmentMode,
  itinerary: ItineraryItem[],
): ItineraryAdjustmentInput => {
  const existingItinerary = buildExistingItinerarySnapshot(itinerary);
  return {
    ...base,
    adjustmentMode: mode,
    existingItinerary,
    analysis: analyzeExistingItinerary(existingItinerary, {
      startDate: base.startDate,
      endDate: base.endDate,
      selections: base.selections,
    }),
  };
};
