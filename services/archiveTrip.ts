import type {
  Companion,
  Expense,
  FlightAnchor,
  ItineraryItem,
  SavedInspiration,
  SettlementBatch,
  ShoppingItem,
  TaxRule,
  TravelBook,
  TravelRules,
  Trip,
  TripFlightMode,
  VisaInfo,
} from "../types";
import type { TripDraft } from "./tripPersistence";

/**
 * The one list of what a finished trip contains.
 *
 * 封存 = 旅程已完成 (FDR-20261028-001), and the Founder's requirement is that a
 * finished trip keeps 行程、行程照片、日記、景點、餐廳. The draft autosave
 * already stored all of that; archiving wrote a shorter list and then deleted
 * the draft, so every field it omitted was lost permanently.
 *
 * The fix is one list, not a second correct one: the archive record is built
 * here and nowhere else, so a field added to a trip cannot be added to the
 * working copy and forgotten on the finished one.
 *
 * Note what this deliberately does NOT do: it does not match the diary's
 * `tripId` against the archived id. `handleGenerateTravelBook` falls back to
 * the literal `"draft"` when the trip has no id yet, which never equals a
 * generated archive id — so the id check silently discarded exactly the
 * diaries written on the trips that had never been saved. The diary in hand
 * belongs to the trip being archived; that is what the caller passes.
 */
export interface ArchiveTripInput {
  id: string;
  ownerId?: string;
  name: string;
  totalCost: number;
  startDate: string;
  endDate: string;
  archivedAt: string;

  destination?: string;
  travelCountry?: string;

  expenses: Expense[];
  companions: Companion[];
  shoppingList: ShoppingItem[];
  itinerary: ItineraryItem[];
  savedInspirations: SavedInspiration[];
  flightAnchors: FlightAnchor[];
  flightMode?: TripFlightMode;
  settlementBatches: SettlementBatch[];
  planBrief?: TripDraft["planBrief"] | null;
  carRentals: TripDraft["carRentals"];
  selectedPassportId?: string;
  comparisonCountryCode?: string;
  currency?: string;
  budget?: number;

  travelBook?: TravelBook | null;
  taxRule?: TaxRule | null;
  visaInfo?: VisaInfo | null;
  travelRules?: TravelRules;

  /**
   * The working copy this trip is being finished from, when there is one.
   *
   * Only for what the live screens do not hold: the creation time and the
   * destination the place lookup resolved. Everything a traveller can still
   * change comes from live state, so archiving never writes a stale value.
   */
  sourceDraft?: TripDraft;
}

/**
 * The diary a stored trip owns.
 *
 * Reading used to repeat the write side's id check, so a diary that survived
 * archiving was discarded on the next load anyway — the same rule in two
 * places, both dropping the same data. A diary stored under a trip belongs to
 * that trip: it was written there by archiving it, and `"draft"` is a
 * placeholder from before the trip had an id, not evidence of another owner.
 */
export const readStoredTravelBook = (trip: {
  travelBook?: TravelBook | null;
}): TravelBook | undefined => trip.travelBook || undefined;

/** An empty collection is absence, not an empty array stored forever. */
const someOf = <T>(items: T[] | undefined): T[] | undefined =>
  items && items.length > 0 ? [...items] : undefined;

export const buildArchivedTrip = (input: ArchiveTripInput): Trip => {
  const { sourceDraft } = input;

  return {
    id: input.id,
    ownerId: input.ownerId,
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    totalCost: input.totalCost,
    archivedAt: input.archivedAt,
    createdAt: sourceDraft?.createdAt,
    updatedAt: input.archivedAt,

    destination: input.destination || undefined,
    destinationCountry: sourceDraft?.destinationCountry,
    destinationAddress: sourceDraft?.destinationAddress,
    destinationLatitude: sourceDraft?.destinationLatitude,
    destinationLongitude: sourceDraft?.destinationLongitude,
    destinationPlaceId: sourceDraft?.destinationPlaceId,
    travelCountry: input.travelCountry || undefined,

    expenses: [...input.expenses],
    companions: [...input.companions],
    shoppingList: [...input.shoppingList],
    itinerary: someOf(input.itinerary),
    savedInspirations: someOf(input.savedInspirations),
    flightAnchors: someOf(input.flightAnchors),
    flightMode: input.flightMode,
    settlementBatches: someOf(input.settlementBatches),
    planBrief: input.planBrief || undefined,
    carRentals: someOf(input.carRentals),
    selectedPassportId: input.selectedPassportId || undefined,
    comparisonCountryCode: input.comparisonCountryCode || undefined,
    currency: input.currency || undefined,
    budget: input.budget,

    travelBook: input.travelBook || undefined,
    taxRule: input.taxRule || undefined,
    visaInfo: input.visaInfo || undefined,
    travelRules: input.travelRules,
    travelRuleTaskState: sourceDraft?.travelRuleTaskState,
    travelRulesChecklistMigrationVersion:
      sourceDraft?.travelRulesChecklistMigrationVersion,
  };
};
