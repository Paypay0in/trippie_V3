import { Category, Expense, FlightAnchor, ItineraryItem, PaymentMethod, SplitMethod, TripFlightMode, TripMember } from '../types';

/**
 * Translation between the app's objects and the shared tables.
 *
 * Kept apart from the network calls so the risky half — field names, defaults,
 * what happens to a row written by an older client — is plain data and can be
 * tested without a database. A wrong mapping here does not fail loudly; it
 * silently drops money, which is the one outcome worth testing hardest.
 */

export interface ExpenseRow {
  id: string;
  trip_id: string;
  created_by_member_id: string | null;
  description: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  handling_fee: number;
  twd_amount: number;
  category: string | null;
  payment_method: string | null;
  phase: string | null;
  date: string | null;
  payer_id: string | null;
  payer_allocations: Record<string, number>;
  beneficiaries: string[];
  split_method: string;
  split_allocations: Record<string, number>;
  disputes: unknown[];
  needs_review: boolean;
  linked_shopping_item_id: string | null;
}

export interface TripMemberRow {
  id: string;
  trip_id: string;
  user_id: string | null;
  name: string;
  type: TripMember['type'];
}

export const toExpenseRow = (expense: Expense, tripId: string): ExpenseRow => ({
  id: expense.id,
  trip_id: tripId,
  created_by_member_id: expense.createdByMemberId ?? null,
  description: expense.description ?? '',
  amount: expense.amount,
  currency: expense.currency,
  exchange_rate: expense.exchangeRate,
  handling_fee: expense.handlingFee ?? 0,
  twd_amount: expense.twdAmount,
  category: expense.category ?? null,
  payment_method: expense.paymentMethod ?? null,
  phase: expense.phase ?? null,
  date: expense.date ?? null,
  payer_id: expense.payerId ?? null,
  payer_allocations: expense.payerAllocations ?? {},
  beneficiaries: expense.beneficiaries ?? [],
  split_method: expense.splitMethod ?? 'EQUAL',
  split_allocations: expense.splitAllocations ?? {},
  disputes: expense.disputes ?? [],
  needs_review: Boolean(expense.needsReview),
  linked_shopping_item_id: expense.linkedShoppingItemId ?? null,
});

/**
 * Read a row back into an Expense.
 *
 * Every optional column is defaulted rather than trusted: a row written by an
 * older client, or by hand in the SQL editor, must not produce an expense whose
 * split fields are undefined — the calculator would then quietly treat it as
 * shared by nobody.
 */
export const fromExpenseRow = (row: ExpenseRow): Expense => ({
  id: row.id,
  description: row.description ?? '',
  amount: Number(row.amount) || 0,
  currency: row.currency || 'TWD',
  exchangeRate: Number(row.exchange_rate) || 1,
  handlingFee: Number(row.handling_fee) || 0,
  twdAmount: Number(row.twd_amount) || 0,
  category: (row.category as Category) ?? Category.OTHER,
  paymentMethod: (row.payment_method as PaymentMethod) ?? PaymentMethod.CASH_TWD,
  phase: (row.phase as Expense['phase']) ?? 'during',
  date: row.date ?? '',
  createdByMemberId: row.created_by_member_id ?? undefined,
  payerId: row.payer_id ?? '',
  payerAllocations: row.payer_allocations ?? {},
  beneficiaries: Array.isArray(row.beneficiaries) ? row.beneficiaries : [],
  splitMethod: (row.split_method as SplitMethod) ?? 'EQUAL',
  splitAllocations: row.split_allocations ?? {},
  disputes: Array.isArray(row.disputes) ? (row.disputes as Expense['disputes']) : [],
  needsReview: Boolean(row.needs_review),
  linkedShoppingItemId: row.linked_shopping_item_id ?? undefined,
});

export const toMemberRow = (member: TripMember, tripId: string): TripMemberRow => ({
  id: member.id,
  trip_id: tripId,
  user_id: member.userId ?? null,
  name: member.name,
  type: member.type,
});

export const fromMemberRow = (row: TripMemberRow): TripMember => ({
  id: row.id,
  name: row.name,
  userId: row.user_id ?? undefined,
  type: row.type,
});

/**
 * The itinerary row.
 *
 * Flat columns for what decides behaviour — which day, what order, whether the
 * AI may touch it. JSONB for provenance and the copied notes, which are the
 * client's own shapes and are only ever read back whole.
 */
export interface ItineraryItemRow {
  id: string;
  trip_id: string;
  date: string | null;
  time: string;
  title: string;
  location: string;
  notes: string;
  type: string;
  place_id: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  duration_minutes: number | null;
  is_completed: boolean;
  sort_order: number | null;
  is_pinned: boolean;
  schedule_flexibility: string | null;
  fixed_event_kind: string | null;
  origin: string | null;
  linked_expense_id: string | null;
  derived_from_flight_anchor_id: string | null;
  source_inspiration_ids: unknown;
  saved_travel_notes: unknown;
}

const ITEM_TYPES = ['FLIGHT', 'HOTEL', 'ACTIVITY', 'FOOD', 'TRANSPORT'] as const;

export const toItineraryRow = (item: ItineraryItem, tripId: string): ItineraryItemRow => ({
  id: item.id,
  trip_id: tripId,
  // Empty is stored as null, not ''. An item with no day is unscheduled, and
  // the difference has to survive the round trip.
  date: item.date || null,
  time: item.time ?? '',
  title: item.title ?? '',
  location: item.location ?? '',
  notes: item.notes ?? '',
  type: item.type,
  place_id: item.placeId ?? null,
  address: item.address ?? null,
  latitude: item.latitude ?? null,
  longitude: item.longitude ?? null,
  duration_minutes: item.durationMinutes ?? null,
  is_completed: item.isCompleted === true,
  // Null, not 0. Absent means "fall back to chronological"; zero means "first".
  sort_order: typeof item.sortOrder === 'number' ? item.sortOrder : null,
  is_pinned: item.isPinned === true,
  schedule_flexibility: item.scheduleFlexibility ?? null,
  fixed_event_kind: item.fixedEventKind ?? null,
  origin: item.origin ?? null,
  linked_expense_id: item.linkedExpenseId ?? null,
  derived_from_flight_anchor_id: item.derivedFromFlightAnchorId ?? null,
  source_inspiration_ids: item.sourceInspirationIds ?? [],
  saved_travel_notes: item.savedTravelNotes ?? [],
});

export const fromItineraryRow = (row: ItineraryItemRow): ItineraryItem => ({
  id: row.id,
  time: row.time ?? '',
  title: row.title ?? '',
  location: row.location ?? '',
  notes: row.notes ?? '',
  type: (ITEM_TYPES as readonly string[]).includes(row.type)
    ? (row.type as ItineraryItem['type'])
    : 'ACTIVITY',
  date: row.date ?? undefined,
  placeId: row.place_id ?? undefined,
  address: row.address ?? undefined,
  latitude: row.latitude ?? undefined,
  longitude: row.longitude ?? undefined,
  durationMinutes: row.duration_minutes ?? undefined,
  isCompleted: row.is_completed === true,
  sortOrder: typeof row.sort_order === 'number' ? row.sort_order : undefined,
  isPinned: row.is_pinned === true,
  scheduleFlexibility: (row.schedule_flexibility as ItineraryItem['scheduleFlexibility']) ?? undefined,
  fixedEventKind: (row.fixed_event_kind as ItineraryItem['fixedEventKind']) ?? undefined,
  origin: (row.origin as ItineraryItem['origin']) ?? undefined,
  linkedExpenseId: row.linked_expense_id ?? undefined,
  derivedFromFlightAnchorId: row.derived_from_flight_anchor_id ?? undefined,
  sourceInspirationIds: Array.isArray(row.source_inspiration_ids)
    ? (row.source_inspiration_ids as string[])
    : undefined,
  savedTravelNotes: Array.isArray(row.saved_travel_notes)
    ? (row.saved_travel_notes as ItineraryItem['savedTravelNotes'])
    : undefined,
});

export interface FlightAnchorRow {
  id: string;
  trip_id: string;
  direction: string;
  departure_date: string;
  departure_time: string;
  departure_airport: string;
  departure_airport_iata: string | null;
  departure_airport_city: string | null;
  departure_airport_country: string | null;
  departure_airport_address: string | null;
  departure_airport_place_id: string | null;
  departure_airport_latitude: number | null;
  departure_airport_longitude: number | null;
  arrival_date: string | null;
  arrival_time: string | null;
  arrival_airport: string | null;
  arrival_airport_iata: string | null;
  arrival_airport_city: string | null;
  arrival_airport_country: string | null;
  arrival_airport_address: string | null;
  arrival_airport_place_id: string | null;
  arrival_airport_latitude: number | null;
  arrival_airport_longitude: number | null;
  airport_arrival_buffer_minutes: number;
  source: string;
}

/** Matches the airport buffer default in the table and in the derived items. */
const DEFAULT_AIRPORT_BUFFER_MINUTES = 120;

export const toFlightAnchorRow = (anchor: FlightAnchor, tripId: string): FlightAnchorRow => ({
  id: anchor.id,
  trip_id: tripId,
  direction: anchor.direction,
  departure_date: anchor.departureDate ?? '',
  departure_time: anchor.departureTime ?? '',
  departure_airport: anchor.departureAirport ?? '',
  departure_airport_iata: anchor.departureAirportIata ?? null,
  departure_airport_city: anchor.departureAirportCity ?? null,
  departure_airport_country: anchor.departureAirportCountry ?? null,
  departure_airport_address: anchor.departureAirportAddress ?? null,
  departure_airport_place_id: anchor.departureAirportPlaceId ?? null,
  departure_airport_latitude: anchor.departureAirportLatitude ?? null,
  departure_airport_longitude: anchor.departureAirportLongitude ?? null,
  arrival_date: anchor.arrivalDate ?? null,
  arrival_time: anchor.arrivalTime ?? null,
  arrival_airport: anchor.arrivalAirport ?? null,
  arrival_airport_iata: anchor.arrivalAirportIata ?? null,
  arrival_airport_city: anchor.arrivalAirportCity ?? null,
  arrival_airport_country: anchor.arrivalAirportCountry ?? null,
  arrival_airport_address: anchor.arrivalAirportAddress ?? null,
  arrival_airport_place_id: anchor.arrivalAirportPlaceId ?? null,
  arrival_airport_latitude: anchor.arrivalAirportLatitude ?? null,
  arrival_airport_longitude: anchor.arrivalAirportLongitude ?? null,
  // Zero is a real answer — "I am already at the airport" — so it must not be
  // swallowed by a falsy check the way `||` would.
  airport_arrival_buffer_minutes:
    typeof anchor.airportArrivalBufferMinutes === 'number'
      ? anchor.airportArrivalBufferMinutes
      : DEFAULT_AIRPORT_BUFFER_MINUTES,
  source: anchor.source ?? 'MANUAL',
});

export const fromFlightAnchorRow = (row: FlightAnchorRow): FlightAnchor => ({
  id: row.id,
  // A row that somehow holds neither direction is treated as outbound rather
  // than dropped; losing a flight entirely is the worse failure.
  direction: row.direction === 'RETURN' ? 'RETURN' : 'OUTBOUND',
  departureDate: row.departure_date ?? '',
  departureTime: row.departure_time ?? '',
  departureAirport: row.departure_airport ?? '',
  departureAirportIata: row.departure_airport_iata ?? undefined,
  departureAirportCity: row.departure_airport_city ?? undefined,
  departureAirportCountry: row.departure_airport_country ?? undefined,
  departureAirportAddress: row.departure_airport_address ?? undefined,
  departureAirportPlaceId: row.departure_airport_place_id ?? undefined,
  departureAirportLatitude: row.departure_airport_latitude ?? undefined,
  departureAirportLongitude: row.departure_airport_longitude ?? undefined,
  arrivalDate: row.arrival_date ?? undefined,
  arrivalTime: row.arrival_time ?? undefined,
  arrivalAirport: row.arrival_airport ?? undefined,
  arrivalAirportIata: row.arrival_airport_iata ?? undefined,
  arrivalAirportCity: row.arrival_airport_city ?? undefined,
  arrivalAirportCountry: row.arrival_airport_country ?? undefined,
  arrivalAirportAddress: row.arrival_airport_address ?? undefined,
  arrivalAirportPlaceId: row.arrival_airport_place_id ?? undefined,
  arrivalAirportLatitude: row.arrival_airport_latitude ?? undefined,
  arrivalAirportLongitude: row.arrival_airport_longitude ?? undefined,
  airportArrivalBufferMinutes:
    typeof row.airport_arrival_buffer_minutes === 'number'
      ? row.airport_arrival_buffer_minutes
      : DEFAULT_AIRPORT_BUFFER_MINUTES,
  source: 'MANUAL',
});

/**
 * Whether a trip is a round trip, read from the anchors themselves.
 *
 * The flight mode is not stored. Deriving it removes a field that would have
 * needed its own sync path and could disagree with the anchors it describes —
 * a trip showing 單程 while holding a return flight.
 */
export const flightModeFromAnchors = (anchors: FlightAnchor[]): TripFlightMode =>
  anchors.some(anchor => anchor.direction === 'RETURN') ? 'ROUND_TRIP' : 'ONE_WAY';
