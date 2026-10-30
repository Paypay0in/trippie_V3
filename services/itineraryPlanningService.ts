import i18n from '../i18n/config';
import { FlightAnchor, ItineraryItem, SavedExperienceNote, SavedInspiration } from '../types';
import { PlaceCoordinates, TripPlanningInput, TripPlanningInspirationSelection } from './tripInspirationSelection';
import { scheduleProposalDay } from './itineraryScheduling';
import { earliestFreeStartByDate, isCoveredByFixedSchedule, latestFreeStartByDate } from './itineraryDayFloor';

export type ItineraryProposal = { days: Array<{ date: string; items: ItineraryItem[] }>; conflicts: Array<{ type: string; message: string; existingItemId?: string; proposedItemId?: string }>; warnings: string[] };

export async function generateItineraryProposal(input: { destination?: string; startDate: string; endDate: string; existingItinerary: ItineraryItem[]; savedInspirations: SavedInspiration[]; flightAnchors: FlightAnchor[]; constraints?: string }): Promise<ItineraryProposal> {
  const response = await fetch('/api/itinerary-proposals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const data = await response.json().catch(() => null) as ItineraryProposal | { error?: string } | null;
  if (!response.ok) throw new Error(data && 'error' in data && typeof data.error === 'string' ? data.error : i18n.t('planner.proposal.error.serviceUnavailable'));
  return data as ItineraryProposal;
}

/* ------------------------------------------------------------------------- *
 * Phase 2: structured proposal built from the canonical Phase 1 planning input.
 * Shares the /api/itinerary-proposals route with the legacy call above; the
 * server branches on the presence of `selections`.
 * ------------------------------------------------------------------------- */

export type ProposedItemSource = 'saved_inspiration' | 'ai_suggestion';

export interface ProposedItineraryItem {
  id: string;
  placeName: string;
  placeId?: string;
  coordinates?: PlaceCoordinates;
  /** Formatted address, from the saved place or from later place enrichment. */
  address?: string;
  suggestedStartTime?: string;
  durationMinutes?: number;
  note?: string;
  /** Empty for an AI-suggested place that came from no saved inspiration. */
  sourceInspirationIds: string[];
  source: ProposedItemSource;
  /**
   * The saved place's own experience notes, carried so acceptance can persist them
   * onto the itinerary item. Set only when `sourceInspirationIds` proved the
   * linkage, so an AI suggestion can never pick these up from a name collision.
   */
  experienceNotes?: SavedExperienceNote[];
}

export interface ProposedItineraryDay {
  date: string;
  items: ProposedItineraryItem[];
}

export interface TripInspirationProposal {
  days: ProposedItineraryDay[];
  warnings: string[];
  /**
   * What has to be booked or confirmed before the plan can be followed.
   *
   * Derived server-side by `withRequiredPreparation` from the schedule itself —
   * the same function the activity planner has always used. 「標示待確認資訊」
   * was built once and wired to one of the two planning paths, and the one it
   * missed is the path a trip is actually created through.
   */
  preparation?: Array<{ name: string; canBeHumanAssisted?: boolean; leadTimeDays?: number; beforeDeparture?: boolean }>;
}

export class ItineraryProposalRequestError extends Error {
  status: number;
  provider?: string;
  model?: string;

  constructor(message: string, status: number, details?: { provider?: string; model?: string }) {
    super(message);
    this.name = 'ItineraryProposalRequestError';
    this.status = status;
    this.provider = details?.provider;
    this.model = details?.model;
  }
}

export const normalizeKey = (value?: string): string => (value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

/** Places whose saved notes hint at an evening visit, e.g. 「傍晚去比較漂亮」. */
// i18n-data: regex anchors matched against the traveller's own saved note text
const EVENING_HINT = /傍晚|黃昏|黄昏|夕陽|夕阳|日落|夜景|晚上|夜間|夜间|sunset|evening|night/i;

/**
 * Format alone is not enough: Date.parse('2026-02-30T00:00:00Z') happily rolls
 * over to March 2 instead of failing, which would smuggle a date past the trip
 * bounds. Round-tripping the parsed value rejects any day that does not exist.
 */
export const isValidProposalDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
};

/**
 * Normalizes a proposed clock time to HH:mm, or returns undefined when the value is
 * not a real time. Models commonly emit "9:00" and occasionally a full-width colon,
 * both of which are unambiguously valid times — rejecting those was silently
 * dropping legitimate slots. Anything genuinely malformed still returns undefined;
 * no replacement time is ever guessed.
 */
export const toValidTime = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const match = value.trim().replace('：', ':').match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  return hour <= 23 ? `${String(hour).padStart(2, '0')}:${match[2]}` : undefined;
};

/*
  `enumerateTripDates` now lives in `services/tripDates.ts`, re-exported here so
  every existing caller keeps working.

  It moved because `server.ts` imported it from this module and nothing else,
  which barred this file from importing `i18n/config` — and eleven sentences a
  traveller reads are built below. One wordless function was holding the whole
  file hostage.
*/
import { enumerateTripDates } from './tripDates';

export { enumerateTripDates };

/**
 * The trip days a plan may still be made for.
 *
 * 「ai排行程會排到已經失效的日期，要讓他先跟本機對時間再排行程」. On 10/04 the planner
 * was still being handed 10/02 and 10/03 as places to put things, because the
 * only dates it knew were the trip's own. A suggestion for a day that has
 * already happened cannot be followed, and it pushes a real one off the list.
 *
 * Today itself stays in: the afternoon of a day that started badly is exactly
 * when somebody asks for a new plan. Only the days behind it are gone.
 *
 * With no reliable today — a clock that cannot be read, a trip entirely in the
 * future — every trip date stands, which is the behaviour this replaces.
 */
export const plannableDates = (startDate?: string, endDate?: string, today?: string): string[] => {
  const dates = enumerateTripDates(startDate, endDate);
  if (!isValidProposalDate(today)) return dates;
  return dates.filter(date => date >= (today as string));
};

const toCoordinates = (value: unknown): PlaceCoordinates | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const { latitude, longitude } = value as { latitude?: unknown; longitude?: unknown };
  return typeof latitude === 'number' && Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && typeof longitude === 'number' && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    && !(latitude === 0 && longitude === 0)
    ? { latitude, longitude }
    : undefined;
};

interface RawProposalItem {
  placeName?: unknown;
  placeId?: unknown;
  coordinates?: unknown;
  suggestedStartTime?: unknown;
  durationMinutes?: unknown;
  note?: unknown;
  sourceInspirationIds?: unknown;
}

export const buildInspirationIndex = (selections: TripPlanningInspirationSelection[]): Map<string, TripPlanningInspirationSelection> => {
  const byInspirationId = new Map<string, TripPlanningInspirationSelection>();
  selections.forEach(selection => selection.inspirationIds.forEach(id => byInspirationId.set(id, selection)));
  return byInspirationId;
};

/**
 * Only a valid inspiration id can mark an item as a saved place. A name is not an
 * identity — different places share names — so letting a name confer provenance is
 * how an AI suggestion would inherit a saved place's Google identity. The response
 * schema makes sourceInspirationIds required, so an untagged item is genuinely an
 * AI suggestion; if the model ever drops a tag, the affected selection surfaces in
 * the "not placed" warning instead of being silently misattributed.
 */
export const matchSelection = (
  item: RawProposalItem,
  byInspirationId: Map<string, TripPlanningInspirationSelection>,
): TripPlanningInspirationSelection | undefined => {
  const claimedIds = Array.isArray(item.sourceInspirationIds)
    ? item.sourceInspirationIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    : [];
  for (const id of claimedIds) {
    const found = byInspirationId.get(id);
    if (found) return found;
  }
  return undefined;
};

/**
 * Turns whatever the model returned into the proposal contract. The model is
 * trusted for choice of place, sequence and prose only: place identity is
 * re-attached from the canonical input, dates outside the trip are dropped, a
 * place may appear at most once across the whole proposal, and each day's clock
 * is checked for feasibility by scheduleProposalDay before it is shown.
 */
export const normalizeTripInspirationProposal = (
  raw: unknown,
  input: TripPlanningInput,
): TripInspirationProposal => {
  const warnings: string[] = [];
  const tripDates = plannableDates(input.startDate, input.endDate, input.today);
  const allowedDates = new Set(tripDates);
  const selections = input.selections;

  const rawDays = raw && typeof raw === 'object' && Array.isArray((raw as { days?: unknown }).days)
    ? (raw as { days: unknown[] }).days
    : [];

  const modelWarnings = raw && typeof raw === 'object' && Array.isArray((raw as { warnings?: unknown }).warnings)
    ? (raw as { warnings: unknown[] }).warnings.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    : [];

  const inspirationIndex = buildInspirationIndex(selections);

  // Which display names belong to a provably saved place anywhere in the response.
  // Collected up front so a saved place still owns its name when the model also
  // emits it as an untagged suggestion earlier in the same proposal.
  const savedNames = new Set<string>();
  rawDays.forEach(rawDay => {
    if (!rawDay || typeof rawDay !== 'object') return;
    const { date, items } = rawDay as { date?: unknown; items?: unknown };
    if (!isValidProposalDate(date) || !allowedDates.has(date) || !Array.isArray(items)) return;
    items.forEach(rawItem => {
      if (!rawItem || typeof rawItem !== 'object') return;
      const selection = matchSelection(rawItem as RawProposalItem, inspirationIndex);
      if (selection) savedNames.add(normalizeKey(selection.placeName));
    });
  });

  // The arrival day cannot begin before the plane lands, and the landing, the
  // immigration queue and the hotel check-in are already on it.
  const dayFloors = earliestFreeStartByDate(input.fixedSchedule || []);
  // And on the day they fly home, nothing after they leave for the airport.
  const dayCeilings = latestFreeStartByDate(input.fixedSchedule || []);
  let droppedRestatedAnchors = 0;
  let droppedAfterDeparture = 0;

  const usedPlaceKeys = new Set<string>();
  const placedInspirationIds = new Set<string>();
  let droppedOutOfRange = 0;
  let droppedDuplicates = 0;
  let repairedDays = 0;
  const days: ProposedItineraryDay[] = [];

  rawDays.forEach(rawDay => {
    if (!rawDay || typeof rawDay !== 'object') return;
    const { date, items } = rawDay as { date?: unknown; items?: unknown };
    if (!isValidProposalDate(date) || !allowedDates.has(date)) { droppedOutOfRange += 1; return; }
    if (!Array.isArray(items)) return;

    const dayItems: ProposedItineraryItem[] = [];
    items.forEach((rawItem, index) => {
      if (!rawItem || typeof rawItem !== 'object') return;
      const item = rawItem as RawProposalItem;
      const selection = matchSelection(item, inspirationIndex);
      const modelName = typeof item.placeName === 'string' ? item.placeName.trim() : '';
      const placeName = selection ? selection.placeName : modelName;
      if (!placeName) return;

      /*
        An untagged suggestion that merely restates the day's flights is dropped.

        「第一天行程非常不合理 且有重複的」: alongside the anchors for 16:35 起飛 and
        19:55 抵達金海, the model had written 「抵達金海國際機場並完成入境」、
        「前往計程車搭乘處」、「抵達飯店門口並辦理入住」. A saved place is never
        dropped this way — the user chose it.
      */
      if (!selection && dayFloors[date] && isCoveredByFixedSchedule(placeName, typeof item.note === 'string' ? item.note : undefined)) {
        droppedRestatedAnchors += 1;
        return;
      }

      // One place, one slot. A saved place is keyed by its Phase 1 groupId, which is
      // unique per place, so two distinct saves sharing a display name both survive.
      // An AI suggestion has no provable identity, so it is keyed by name and also
      // yields to any saved place already owning that name.
      const nameKey = normalizeKey(placeName);
      const placeKey = selection ? `group:${selection.groupId}` : `name:${nameKey}`;
      if (usedPlaceKeys.has(placeKey) || (!selection && savedNames.has(nameKey))) { droppedDuplicates += 1; return; }
      usedPlaceKeys.add(placeKey);

      const suggestedStartTime = toValidTime(item.suggestedStartTime);
      const durationMinutes = typeof item.durationMinutes === 'number' && Number.isFinite(item.durationMinutes) && item.durationMinutes > 0
        ? Math.min(Math.round(item.durationMinutes), 24 * 60)
        : undefined;
      const note = typeof item.note === 'string' && item.note.trim() ? item.note.trim() : undefined;

      if (selection) {
        selection.inspirationIds.forEach(id => placedInspirationIds.add(id));
        dayItems.push({
          id: `${date}-${index}-${placeKey}`,
          placeName: selection.placeName,
          // Never let a generated value overwrite resolved Google Place identity.
          placeId: selection.placeId,
          coordinates: selection.coordinates,
          address: selection.address,
          suggestedStartTime,
          durationMinutes,
          note,
          sourceInspirationIds: [...selection.inspirationIds],
          source: 'saved_inspiration',
          // The user's own saved notes travel with the place, so accepting keeps
          // them on the itinerary card instead of stranding them in the planner.
          ...(selection.experienceNotes.length > 0
            ? { experienceNotes: selection.experienceNotes.map(note => ({ ...note })) }
            : {}),
        });
        return;
      }

      dayItems.push({
        id: `${date}-${index}-${placeKey}`,
        placeName,
        // A model cannot invent a Google placeId, so an AI suggestion never carries one.
        placeId: undefined,
        coordinates: toCoordinates(item.coordinates),
        suggestedStartTime,
        durationMinutes,
        note,
        sourceInspirationIds: [],
        source: 'ai_suggestion',
      });
    });

    if (dayItems.length === 0) return;
    // The model is trusted for what and in what order, not for the clock: it
    // regularly returns one identical start time for a whole day. Ordering and
    // feasibility are settled here, and a day it already scheduled sensibly
    // passes through unchanged.
    const { items: scheduledItems, repaired } = scheduleProposalDay(dayItems, {
      planningPreferences: input.planningPreferences,
      earliestStart: dayFloors[date],
    });
    if (repaired) repairedDays += 1;

    /*
      On the day they fly home the day ends when they leave for the airport.

      This is a drop rather than a retime: a floor has somewhere to move an item
      to, a ceiling does not — pulling a 14:00 suggestion back before a 07:00
      departure would just be inventing a different wrong time.
    */
    const ceiling = dayCeilings[date];
    const withinDay = ceiling
      ? scheduledItems.filter(entry => {
          const keep = !entry.suggestedStartTime || entry.suggestedStartTime < ceiling;
          if (!keep) droppedAfterDeparture += 1;
          return keep;
        })
      : scheduledItems;

    if (withinDay.length === 0) return;
    days.push({ date, items: withinDay });
  });

  days.sort((left, right) => left.date.localeCompare(right.date));

  if (droppedOutOfRange > 0) warnings.push(i18n.t('planner.proposal.warning.outOfRangeDays', { count: droppedOutOfRange }));
  if (droppedRestatedAnchors > 0) warnings.push(i18n.t('planner.proposal.warning.restatedAnchors', { count: droppedRestatedAnchors }));
  if (droppedAfterDeparture > 0) warnings.push(i18n.t('planner.proposal.warning.afterDeparture', { count: droppedAfterDeparture }));
  if (droppedDuplicates > 0) warnings.push(i18n.t('planner.proposal.warning.duplicatePlaces', { count: droppedDuplicates }));
  if (repairedDays > 0) warnings.push(i18n.t('planner.proposal.warning.repairedDays', { count: repairedDays }));

  const missing = selections.filter(selection => !selection.inspirationIds.some(id => placedInspirationIds.has(id)));
  if (missing.length > 0) {
    warnings.push(i18n.t('planner.proposal.warning.notPlaced', {
      names: missing.map(selection => selection.placeName).join(i18n.t('planner.listSeparator')),
    }));
  }

  // Surface, without silently rewriting, a note hint the schedule ignored.
  days.forEach(day => day.items.forEach(item => {
    if (item.source !== 'saved_inspiration' || !item.suggestedStartTime) return;
    const selection = selections.find(entry => entry.inspirationIds.some(id => item.sourceInspirationIds.includes(id)));
    const hasEveningHint = selection?.experienceNotes.some(entry => EVENING_HINT.test(entry.text));
    if (hasEveningHint && item.suggestedStartTime < '15:00') {
      warnings.push(i18n.t('planner.proposal.warning.eveningHintIgnored', {
        name: item.placeName,
        time: item.suggestedStartTime,
      }));
    }
  }));

  const preparation = raw && typeof raw === 'object' && Array.isArray((raw as { preparation?: unknown }).preparation)
    ? (raw as { preparation: unknown[] })
      .preparation
      .filter((task): task is { name: string } =>
        Boolean(task) && typeof task === 'object' && typeof (task as { name?: unknown }).name === 'string'
        && Boolean((task as { name: string }).name.trim()))
    : [];

  return {
    days,
    warnings: [...modelWarnings, ...warnings],
    ...(preparation.length ? { preparation } : {}),
  };
};

/**
 * Sends the canonical Phase 1 planning input to the shared itinerary route and
 * returns a normalized proposal. Never writes to the official itinerary.
 */
export async function generateTripInspirationProposal(input: TripPlanningInput): Promise<TripInspirationProposal> {
  let response: Response;
  try {
    response = await fetch('/api/itinerary-proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (error) {
    throw new ItineraryProposalRequestError(
      error instanceof Error && error.name === 'AbortError'
        ? i18n.t('planner.proposal.error.timedOut')
        : i18n.t('planner.proposal.error.offline'),
      0,
    );
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : i18n.t('planner.proposal.error.unavailable');
    throw new ItineraryProposalRequestError(message, response.status, {
      provider: typeof payload?.provider === 'string' ? payload.provider : undefined,
      model: typeof payload?.model === 'string' ? payload.model : undefined,
    });
  }

  return normalizeTripInspirationProposal(payload, input);
}
