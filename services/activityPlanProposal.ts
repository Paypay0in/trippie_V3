import { ItineraryItem } from '../types';
import { TravelBurden } from './planLogistics';

/**
 * A plan, not a place.
 *
 * The old suggestion pipeline answered 「想滑雪」 with things to buy. What the
 * question actually needs is: which option fits this trip, is it realistic from
 * here, one day or two, and what would it cost. That shape does not fit into
 * `{item, reason}`, which is why this exists rather than another field on it.
 *
 * Every layer owns what it can prove. Places owns the venue's identity and
 * coordinates; Routes owns travel time; grounded research owns opening periods,
 * prices and whether booking is required. The model owns only synthesis — why
 * this suits this traveller, what the tradeoff is, how the day is shaped. A
 * price the model remembered is not a price, so `budgetConfidence` exists to
 * keep the two apart on screen.
 */

export type PlanCharacteristic =
  | 'easiest'
  | 'best_fit'
  | 'fuller'
  | 'lower_budget'
  | 'premium'
  | 'overnight';

export const CHARACTERISTIC_LABELS: Record<PlanCharacteristic, string> = {
  easiest: '最省事',
  best_fit: '最適合這趟',
  fuller: '完整體驗',
  lower_budget: '較省錢',
  premium: '舒適便利',
  overnight: '過夜',
};

export interface PlanBudget {
  min: number;
  max: number;
  currency: string;
  breakdown?: Partial<Record<'transport' | 'activity' | 'equipment' | 'lodging' | 'food', string>>;
}

export interface PlanItem {
  dayOffset: number;
  time: string;
  title: string;
  /** Resolved through the map service when it matched a real place. */
  placeName?: string;
  placeId?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  type: 'ACTIVITY' | 'FOOD' | 'TRANSPORT' | 'HOTEL';
  durationMinutes?: number;
  notes?: string;
}

/** Something to do before the plan works, surfaced only once it is chosen. */
export interface PlanPreparationTask {
  name: string;
  /** Whether a person could take it on, for the service bundling flow. */
  canBeHumanAssisted: boolean;
}

export interface ActivityPlanProposal {
  /** Stable for the life of this option, so later events point at something. */
  id: string;
  title: string;
  whyItFits: string;
  tradeoff?: string;
  durationDays: number;
  characteristics: PlanCharacteristic[];
  logistics: {
    originLabel?: string;
    /** From the routing service. Absent when it could not answer. */
    travelMinutesEachWay?: number;
    burden?: TravelBurden;
  };
  budget?: PlanBudget;
  /** `unverified` means the screen must say 價格需確認 rather than show a number. */
  budgetConfidence: 'verified' | 'unverified';
  /**
   * The main venue's own price band, as the map service holds it.
   *
   * Not the plan's total, and never presented as one — it covers the venue and
   * nothing else. But it comes from the same source as the venue's address, so
   * it is a real figure rather than a remembered one, and it is what the screen
   * can offer on the many occasions the search quota is spent.
   */
  venuePrice?: { venueName?: string; currency: string; start?: number; end?: number };
  items: PlanItem[];
  preparation: PlanPreparationTask[];
}

export interface ActivityPlansResult {
  /** Stable across the whole set, so a selection can name what it was chosen over. */
  requestId: string;
  /** One sentence framing the options, from the model. */
  intro?: string;
  options: ActivityPlanProposal[];
  grounded: boolean;
  sources: Array<{ title?: string; url?: string }>;
}

export class ActivityPlansUnavailable extends Error {}

export const fetchActivityPlans = async (request: {
  intent: string;
  destination?: string;
  originLatitude?: number;
  originLongitude?: number;
  startDate?: string;
  endDate?: string;
  daysBrief?: string;
  budgetBrief?: string;
}): Promise<ActivityPlansResult> => {
  const response = await fetch('/api/activity-plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ActivityPlansUnavailable(payload?.error || '現在查不到資料，稍後再試一次。');
  }
  const data = await response.json();
  return {
    requestId: typeof data?.requestId === 'string' ? data.requestId : '',
    intro: typeof data?.intro === 'string' ? data.intro : undefined,
    options: Array.isArray(data?.options) ? data.options : [],
    grounded: data?.grounded !== false,
    sources: Array.isArray(data?.sources) ? data.sources : [],
  };
};

const addDays = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * A chosen plan, as itinerary items awaiting confirmation.
 *
 * Dates are resolved against the day the traveller picked, not against anything
 * the model said: it knows the shape of the plan, never when this trip runs.
 * Identity fields are copied only where the map service supplied them, so an
 * item never carries a placeId that was never looked up.
 */
export const planToItineraryItems = (
  plan: ActivityPlanProposal,
  { startDate, generateId }: { startDate?: string; generateId: () => string },
): ItineraryItem[] =>
  plan.items
    .slice()
    .sort((a, b) => a.dayOffset - b.dayOffset || a.time.localeCompare(b.time))
    .map(item => ({
      id: generateId(),
      time: item.time,
      title: item.title,
      location: item.placeName || '',
      notes: item.notes || '',
      type: item.type,
      date: startDate ? addDays(startDate, item.dayOffset) : undefined,
      isCompleted: false,
      ...(item.placeId ? { placeId: item.placeId } : {}),
      ...(item.address ? { address: item.address } : {}),
      ...(typeof item.latitude === 'number' ? { latitude: item.latitude } : {}),
      ...(typeof item.longitude === 'number' ? { longitude: item.longitude } : {}),
      ...(item.durationMinutes ? { durationMinutes: item.durationMinutes } : {}),
      // Provenance: an AI-suggested place confers no saved-inspiration identity.
      sourceInspirationIds: [],
    }));
