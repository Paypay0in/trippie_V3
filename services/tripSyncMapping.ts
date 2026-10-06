import { Category, Expense, FlightAnchor, ItineraryItem, PaymentMethod, SplitMethod, ReceiptItem, SavedTravelInspiration, TripFlightMode, TripMember } from '../types';

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
  /** Receipts, as downscaled data URLs, the same shape community posts use. */
  receipt_photos?: unknown;
  /** The receipt's own lines, both languages, as the model read them. */
  receipt_items?: unknown;
  /** The shop as printed, untranslated. */
  merchant?: unknown;
  /** The shop's address, as printed. */
  merchant_address?: unknown;
  /** The shop as a place, for aggregating across receipts. */
  merchant_place_id?: unknown;
  merchant_latitude?: unknown;
  merchant_longitude?: unknown;
  note?: unknown;
  tax_refunded_at_purchase?: unknown;
  tax_refund_ineligible?: unknown;
  tax_refund_actual?: unknown;
  tax_refund_channel?: unknown;
}

export interface TripMemberRow {
  id: string;
  trip_id: string;
  user_id: string | null;
  name: string;
  type: TripMember['type'];
}

/**
 * A member row on the way out, where `user_id` may be absent.
 *
 * Separate from the read shape on purpose: absent and null mean different
 * things in an upsert. Null writes null; absent leaves whatever is there.
 */
export type TripMemberWriteRow = Omit<TripMemberRow, 'user_id'> & { user_id?: string };

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
  receipt_photos: expense.receiptPhotos ?? [],
  receipt_items: expense.receiptItems ?? [],
  merchant: expense.merchant?.trim() || null,
  merchant_address: expense.merchantAddress?.trim() || null,
  merchant_place_id: expense.merchantPlaceId?.trim() || null,
  merchant_latitude: Number.isFinite(expense.merchantLatitude) ? expense.merchantLatitude : null,
  merchant_longitude: Number.isFinite(expense.merchantLongitude) ? expense.merchantLongitude : null,
  // Both travellers read the same ledger, so a note explaining a bill belongs
  // on the bill rather than on whichever phone typed it.
  note: expense.note?.trim() || null,
  // Both travellers need to agree on which purchases are already settled.
  tax_refunded_at_purchase: expense.taxRefundedAtPurchase === true,
  // A purchase outside the scheme altogether, so both travellers stop seeing it
  // counted towards a refund neither of them can claim.
  tax_refund_ineligible: expense.taxRefundIneligible === true,
  // What the counter actually paid back, so both travellers see the same figure
  // and the estimate stops competing with a fact one of them already has.
  tax_refund_actual: Number.isFinite(expense.taxRefundActual as number) ? expense.taxRefundActual : null,
  tax_refund_channel: expense.taxRefundChannel ?? null,
});

/**
 * Read a row back into an Expense.
 *
 * Every optional column is defaulted rather than trusted: a row written by an
 * older client, or by hand in the SQL editor, must not produce an expense whose
 * split fields are undefined — the calculator would then quietly treat it as
 * shared by nobody.
 */
/**
 * Who actually put the money down, when the record disagrees with itself.
 *
 * An expense carries both a payer and a map of what each person prepaid. They
 * are written together and cannot normally diverge — but a row corrected by
 * hand had its payer moved to the second traveller while the map still read
 * `{owner: 888}`, so the ledger said she paid it and that he had prepaid it.
 * The share calculation reads the map, so 888 of her own money stayed in his
 * total on a screen where every other field named her.
 *
 * One stale entry is repaired from the payer; anything with two or more is a
 * genuine split and is left exactly as written.
 */
const reconcilePrepaid = (row: ExpenseRow): Record<string, number> => {
  const prepaid = (row.payer_allocations ?? {}) as Record<string, number>;
  const keys = Object.keys(prepaid);
  if (!row.payer_id || keys.length !== 1 || keys[0] === row.payer_id) return prepaid;
  return { [row.payer_id]: Number(row.amount) || 0 };
};

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
  payerAllocations: reconcilePrepaid(row),
  beneficiaries: Array.isArray(row.beneficiaries) ? row.beneficiaries : [],
  splitMethod: (row.split_method as SplitMethod) ?? 'EQUAL',
  splitAllocations: row.split_allocations ?? {},
  disputes: Array.isArray(row.disputes) ? (row.disputes as Expense['disputes']) : [],
  needsReview: Boolean(row.needs_review),
  linkedShoppingItemId: row.linked_shopping_item_id ?? undefined,
  note: typeof row.note === 'string' && row.note.trim() ? row.note : undefined,
  receiptItems: Array.isArray(row.receipt_items) && row.receipt_items.length
    ? (row.receipt_items as ReceiptItem[])
    : undefined,
  merchant: typeof row.merchant === 'string' && row.merchant.trim() ? row.merchant : undefined,
  merchantAddress: typeof row.merchant_address === 'string' && row.merchant_address.trim()
    ? row.merchant_address
    : undefined,
  merchantPlaceId: typeof row.merchant_place_id === 'string' && row.merchant_place_id.trim()
    ? row.merchant_place_id
    : undefined,
  merchantLatitude: typeof row.merchant_latitude === 'number' ? row.merchant_latitude : undefined,
  merchantLongitude: typeof row.merchant_longitude === 'number' ? row.merchant_longitude : undefined,
  taxRefundedAtPurchase: row.tax_refunded_at_purchase === true ? true : undefined,
  taxRefundIneligible: row.tax_refund_ineligible === true ? true : undefined,
  taxRefundActual: Number.isFinite(Number(row.tax_refund_actual)) && row.tax_refund_actual !== null
    ? Number(row.tax_refund_actual)
    : undefined,
  taxRefundChannel: row.tax_refund_channel === 'at_till' || row.tax_refund_channel === 'airport'
    ? row.tax_refund_channel
    : undefined,
  receiptPhotos: Array.isArray(row.receipt_photos)
    ? (row.receipt_photos as unknown[]).filter((photo): photo is string => typeof photo === 'string')
    : [],
});

/**
 * A member row for upsert.
 *
 * `user_id` is omitted rather than sent as null when this device does not know
 * it. That column is what `is_trip_member` reads, and it is written by the
 * friend claiming her invite — on someone else's device. Sending null would
 * blank it on the next push from a phone that had not re-read since, silently
 * revoking her access to the whole trip. Leaving the column out of the
 * statement means the existing value is kept.
 */
export const toMemberRow = (member: TripMember, tripId: string): TripMemberWriteRow => ({
  id: member.id,
  trip_id: tripId,
  ...(member.userId ? { user_id: member.userId } : {}),
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
  /** 共同 or 個人; null means shared, as every pre-existing row is. */
  visibility: string | null;
  /** Whose item it is, when it is personal. */
  owner_user_id: string | null;
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
  // Null rather than 'shared', so a row written by an older client and a row
  // written by this one are the same row — otherwise the fingerprints differ
  // and every open republishes the whole itinerary.
  visibility: item.visibility === 'personal' ? 'personal' : null,
  owner_user_id: item.visibility === 'personal' ? item.ownerUserId ?? null : null,
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
  visibility: row.visibility === 'personal' ? 'personal' : undefined,
  ownerUserId: row.visibility === 'personal' ? row.owner_user_id ?? undefined : undefined,
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

/* ------------------------------------------------------------------ *
 * Trip inspirations: the want-to-go list both travellers build
 * ------------------------------------------------------------------ */

export interface TripInspirationRow {
  id: string;
  trip_id: string;
  saved_by_user_id: string;
  place_name: string;
  country: string;
  city: string;
  place_id: string | null;
  resolved_place_name: string | null;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
  place_photo_url: string | null;
  source_post_id: string;
  source_slice_id: string;
  source_creator_id: string;
  source_note_ids: unknown;
  notes: unknown;
  saved_at: string;
}

export const toTripInspirationRow = (
  inspiration: SavedTravelInspiration,
  tripId: string,
): TripInspirationRow => ({
  id: inspiration.id,
  trip_id: tripId,
  saved_by_user_id: inspiration.savedByUserId ?? '',
  place_name: inspiration.placeName,
  country: inspiration.country ?? '',
  city: inspiration.city ?? '',
  place_id: inspiration.placeId ?? null,
  resolved_place_name: inspiration.resolvedPlaceName ?? null,
  formatted_address: inspiration.formattedAddress ?? null,
  latitude: inspiration.latitude ?? null,
  longitude: inspiration.longitude ?? null,
  place_photo_url: inspiration.placePhotoUrl ?? null,
  source_post_id: inspiration.sourcePostId ?? '',
  source_slice_id: inspiration.sourceSliceId ?? '',
  source_creator_id: inspiration.sourceCreatorId ?? '',
  source_note_ids: inspiration.sourceNoteIds ?? [],
  notes: inspiration.notes ?? [],
  saved_at: inspiration.savedAt || new Date().toISOString(),
});

/**
 * What the database considers the same saved place.
 *
 * Mirrors `trip_inspirations_place_unique` exactly: a resolved Google id when
 * there is one, otherwise the trimmed lowercased name. It has to mirror it,
 * because the index is what rejects a write — a client that disagrees with it
 * finds out by having a save fail.
 */
export const inspirationRowKey = (
  row: Pick<TripInspirationRow, 'place_id' | 'place_name'>,
): string => (row.place_id?.trim()
  ? `place:${row.place_id.trim()}`
  : `name:${(row.place_name || '').trim().toLocaleLowerCase()}`);

/**
 * Rewrites outgoing rows to the ids the server already uses for those places.
 *
 * 「我剛重新上傳一次 … 一按存檔就變沒有東西呀」. Saving the same screenshot twice
 * mints a fresh local id for a place that is already on the shared list, and an
 * upsert keyed on `id` asks Postgres to insert it — which the place-uniqueness
 * index refuses. The refusal takes the whole batch with it, so the new places in
 * that upload were lost too, and the save reported success because the failure
 * was swallowed.
 *
 * Reusing the existing row's id turns that insert into the update it always
 * was: the place keeps one entry, and whatever the second upload learned about
 * it lands on that entry.
 *
 * Rows that collide with each other inside one batch are folded here too, for
 * the same reason — Postgres rejects a batch that names one row twice, however
 * the duplicate got in.
 */
export const alignInspirationRowIds = (
  rows: TripInspirationRow[],
  existing: Pick<TripInspirationRow, 'id' | 'place_id' | 'place_name'>[],
): TripInspirationRow[] => {
  const remoteIdByKey = new Map<string, string>();
  existing.forEach(row => {
    if (!remoteIdByKey.has(inspirationRowKey(row))) remoteIdByKey.set(inspirationRowKey(row), row.id);
  });

  const aligned: TripInspirationRow[] = [];
  const takenKeys = new Set<string>();

  rows.forEach(row => {
    const key = inspirationRowKey(row);
    if (takenKeys.has(key)) return;
    takenKeys.add(key);
    const remoteId = remoteIdByKey.get(key);
    aligned.push(remoteId && remoteId !== row.id ? { ...row, id: remoteId } : row);
  });

  return aligned;
};

export const fromTripInspirationRow = (row: TripInspirationRow): SavedTravelInspiration => ({
  id: row.id,
  savedByUserId: row.saved_by_user_id ?? '',
  placeName: row.place_name,
  country: row.country ?? '',
  city: row.city ?? '',
  placeId: row.place_id ?? undefined,
  resolvedPlaceName: row.resolved_place_name ?? undefined,
  formattedAddress: row.formatted_address ?? undefined,
  latitude: row.latitude ?? undefined,
  longitude: row.longitude ?? undefined,
  placePhotoUrl: row.place_photo_url ?? undefined,
  sourcePostId: row.source_post_id ?? '',
  sourceSliceId: row.source_slice_id ?? '',
  sourceCreatorId: row.source_creator_id ?? '',
  sourceNoteIds: Array.isArray(row.source_note_ids)
    ? (row.source_note_ids as unknown[]).filter((id): id is string => typeof id === 'string')
    : [],
  notes: Array.isArray(row.notes)
    ? (row.notes as SavedTravelInspiration['notes']).filter(note => note && typeof note.text === 'string')
    : [],
  savedAt: row.saved_at ?? new Date().toISOString(),
});
