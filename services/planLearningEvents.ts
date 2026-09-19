import { ActivityPlanProposal } from './activityPlanProposal';
import { supabase } from './supabaseClient';
import { SyncResult } from './tripSync';

/**
 * What the traveller did with the plans they were shown.
 *
 * Raw behaviour only. Nothing here decides that someone *is* a budget traveller
 * — that would be a label derived from one evening and then applied forever,
 * and people travel differently with their parents than with their friends. The
 * table stores what happened; any notion of taste is inferred later, in context,
 * from many of these rows.
 *
 * Being shown an option is not evidence of anything: everything on screen was
 * shown. Choosing one over named alternatives, dismissing, editing afterwards
 * or actually spending money against it are the signals worth keeping, which is
 * why `alternativeOptionIds` is recorded on selection rather than a bare id.
 */

export type PlanEventType =
  | 'options_shown'
  | 'option_selected'
  | 'option_dismissed'
  | 'added_to_itinerary'
  | 'item_edited'
  | 'item_deleted';

export interface PlanLearningEvent {
  id: string;
  userId: string;
  tripId: string;
  /** The set of options this belongs to, stable from the first response. */
  requestId: string;
  type: PlanEventType;
  optionId?: string;
  /** What it was chosen over — the part that makes a selection meaningful. */
  alternativeOptionIds: string[];
  characteristics: string[];
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  /** Items the itinerary ended up with, so later edits can be traced back. */
  resultingItineraryItemIds: string[];
  createdAt: string;
}

const failed = (error: unknown): SyncResult<never> => ({
  status: 'error',
  message: error instanceof Error ? error.message : String(error),
});

export const buildPlanEvent = ({
  type,
  userId,
  tripId,
  requestId,
  option,
  shownOptions = [],
  resultingItineraryItemIds = [],
  generateId,
  now = () => new Date().toISOString(),
}: {
  type: PlanEventType;
  userId: string;
  tripId: string;
  requestId: string;
  option?: ActivityPlanProposal;
  shownOptions?: ActivityPlanProposal[];
  resultingItineraryItemIds?: string[];
  generateId: () => string;
  now?: () => string;
}): PlanLearningEvent => ({
  id: generateId(),
  userId,
  tripId,
  requestId,
  type,
  optionId: option?.id,
  alternativeOptionIds: shownOptions.filter(other => other.id !== option?.id).map(other => other.id),
  characteristics: option?.characteristics ?? [],
  // Only a verified budget is recorded. A remembered price stored as a number
  // becomes, months later, evidence about what this person will pay.
  budgetMin: option?.budgetConfidence === 'verified' ? option.budget?.min : undefined,
  budgetMax: option?.budgetConfidence === 'verified' ? option.budget?.max : undefined,
  currency: option?.budgetConfidence === 'verified' ? option.budget?.currency : undefined,
  resultingItineraryItemIds,
  createdAt: now(),
});

export const recordPlanEvent = async (event: PlanLearningEvent): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { error } = await supabase.from('plan_events').insert({
      id: event.id,
      user_id: event.userId,
      trip_id: event.tripId,
      request_id: event.requestId,
      type: event.type,
      option_id: event.optionId ?? null,
      alternative_option_ids: event.alternativeOptionIds,
      characteristics: event.characteristics,
      budget_min: event.budgetMin ?? null,
      budget_max: event.budgetMax ?? null,
      currency: event.currency ?? null,
      resulting_itinerary_item_ids: event.resultingItineraryItemIds,
      created_at: event.createdAt,
    });
    if (error) throw error;
    return { status: 'ok', data: null };
  } catch (error) {
    // Fails soft and silently by design: a traveller choosing a ski plan must
    // never see an error because our analytics write failed.
    return failed(error);
  }
};
