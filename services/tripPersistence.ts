import {
  Companion,
  Expense,
  ItineraryItem,
  ShoppingItem,
  TaxRule,
  Trip,
  VisaInfo,
  SavedInspiration,
  FlightAnchor,
  TripFlightMode,
  TravelRules,
  TravelRuleSource,
  EntryActionableItem,
  EntryActionType,
  TravelRuleTaskState,
  TaxRefundNumericRule,
  TripMember,
  SettlementBatch,
  FrozenSettlementResult,
  SavedExperienceNote,
} from '../types';

export const DRAFTS_STORAGE_KEY = 'trippie_drafts_v1';
export const ACTIVE_DRAFT_STORAGE_KEY = 'trippie_active_trip_id';
const MIGRATION_STORAGE_KEY = 'trippie_drafts_migration_v1';

export interface TripDraft {
  id: string;
  ownerId?: string;
  name: string;
  destination?: string;
  destinationCountry?: string;
  destinationAddress?: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
  destinationPlaceId?: string;
  startDate: string;
  endDate: string;
  currency?: string;
  budget?: number;
  expenses: Expense[];
  companions: Companion[];
  members?: TripMember[];
  settlementBatches?: SettlementBatch[];
  shoppingList: ShoppingItem[];
  itinerary?: ItineraryItem[];
  travelCountry?: string;
  taxRule?: TaxRule;
  visaInfo?: VisaInfo;
  savedInspirations?: SavedInspiration[];
  flightAnchors?: FlightAnchor[];
  flightMode?: TripFlightMode;
  selectedPassportId?: string;
  travelRules?: TravelRules;
  travelRuleTaskState?: TravelRuleTaskState;
  travelRulesChecklistMigrationVersion?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DraftStore {
  drafts: TripDraft[];
  activeDraftId: string | null;
}

const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

/**
 * Saved travel notes survive a reload only while they still carry their own
 * provenance. A note missing its source ids is unattributable, so it is dropped
 * rather than shown as if someone had written it.
 */
const normalizeSavedTravelNotes = (value: unknown, sourceInspirationIds: unknown): SavedExperienceNote[] | undefined => {
  // Notes exist because an inspiration linkage existed. Without the ids there is
  // nothing proving this item is a saved place, so the notes go with them.
  const hasLinkage = Array.isArray(sourceInspirationIds)
    && sourceInspirationIds.some(id => typeof id === 'string' && Boolean(id.trim()));
  if (!hasLinkage || !Array.isArray(value)) return undefined;
  const notes = value
    .filter((note): note is Record<string, unknown> => Boolean(note && typeof note === 'object'))
    .filter(note => ['id', 'sourceNoteId', 'sourceSliceId', 'sourcePostId', 'sourceCreatorId', 'text']
      .every(key => typeof note[key] === 'string' && Boolean(note[key])))
    .map(note => ({
      id: note.id as string,
      sourceNoteId: note.sourceNoteId as string,
      sourceSliceId: note.sourceSliceId as string,
      sourcePostId: note.sourcePostId as string,
      sourceCreatorId: note.sourceCreatorId as string,
      type: note.type as SavedExperienceNote['type'],
      text: note.text as string,
    }));
  return notes.length > 0 ? notes : undefined;
};

const normalizeItinerary = (value: unknown): ItineraryItem[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')).map(item => ({
    ...item,
    savedTravelNotes: normalizeSavedTravelNotes(item.savedTravelNotes, item.sourceInspirationIds),
    // A hand-arranged position. Anything that is not a finite non-negative
    // integer is dropped, which simply returns that day to chronological order.
    sortOrder: typeof item.sortOrder === 'number' && Number.isInteger(item.sortOrder) && item.sortOrder >= 0 ? item.sortOrder : undefined,
    // A hard time constraint. Anything unrecognised reads as flexible, which is
    // the safe default: the schedule stays adjustable rather than frozen.
    //
    // Accommodation is never fixed, whatever an older record says. Stays were
    // marked fixed when they were first built, which put a lock on the one
    // card whose hour is genuinely negotiable — the traveller could not move
    // a check-in, and it was reported as conflicting with the flight that
    // brought them there. Clearing it on read means an itinerary saved before
    // that changed stops being wrong the next time it is opened, rather than
    // only for stays added afterwards.
    // Only a flight is fixed by default; see isFixedItem. Stored items that
    // were marked otherwise stop being wrong the next time they are opened.
    scheduleFlexibility: item.scheduleFlexibility === 'fixed'
      && (item.fixedEventKind === 'flight' || item.type === 'FLIGHT')
      ? 'fixed'
      : undefined,
    isPinned: item.isPinned === true ? true : undefined,
    fixedEventKind: ['flight', 'train', 'reservation', 'ticketed_event', 'accommodation'].includes(String(item.fixedEventKind))
      ? item.fixedEventKind as ItineraryItem['fixedEventKind']
      : undefined,
    date: typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : undefined,
    isCompleted: typeof item.isCompleted === 'boolean' ? item.isCompleted : undefined,
    placeId: typeof item.placeId === 'string' && item.placeId ? item.placeId : undefined,
    address: typeof item.address === 'string' && item.address ? item.address : undefined,
    latitude: typeof item.latitude === 'number' && Number.isFinite(item.latitude) && item.latitude >= -90 && item.latitude <= 90 ? item.latitude : undefined,
    longitude: typeof item.longitude === 'number' && Number.isFinite(item.longitude) && item.longitude >= -180 && item.longitude <= 180 ? item.longitude : undefined,
  })) as ItineraryItem[];
};

const validCoordinate = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined;
const normalizeInspirations = (value: unknown): SavedInspiration[] | undefined => Array.isArray(value) ? value.filter(item => item && typeof item === 'object').map(item => {
  const source = item as Record<string, unknown>;
  return { ...source, id: typeof source.id === 'string' ? source.id : '', title: typeof source.title === 'string' ? source.title : '', country: typeof source.country === 'string' && source.country.trim() ? source.country.trim() : undefined, city: typeof source.city === 'string' && source.city.trim() ? source.city.trim() : undefined, latitude: validCoordinate(source.latitude, -90, 90), longitude: validCoordinate(source.longitude, -180, 180), selectedForPlanning: typeof source.selectedForPlanning === 'boolean' ? source.selectedForPlanning : false } as SavedInspiration;
}).filter(item => item.id && item.title) : undefined;
const normalizeFlightAnchors = (value: unknown): FlightAnchor[] | undefined => Array.isArray(value) ? value.filter(item => item && typeof item === 'object').map(item => {
  const source = item as Record<string, unknown>;
  return { ...source, id: typeof source.id === 'string' ? source.id : '', direction: source.direction === 'RETURN' ? 'RETURN' : 'OUTBOUND', departureDate: typeof source.departureDate === 'string' ? source.departureDate : '', departureTime: typeof source.departureTime === 'string' ? source.departureTime : '', departureAirport: typeof source.departureAirport === 'string' ? source.departureAirport : '', airportArrivalBufferMinutes: typeof source.airportArrivalBufferMinutes === 'number' && Number.isFinite(source.airportArrivalBufferMinutes) && source.airportArrivalBufferMinutes >= 0 ? source.airportArrivalBufferMinutes : 120, source: 'MANUAL', departureAirportLatitude: validCoordinate(source.departureAirportLatitude, -90, 90), departureAirportLongitude: validCoordinate(source.departureAirportLongitude, -180, 180), arrivalAirportLatitude: validCoordinate(source.arrivalAirportLatitude, -90, 90), arrivalAirportLongitude: validCoordinate(source.arrivalAirportLongitude, -180, 180) } as FlightAnchor;
}).filter(item => item.id && item.departureDate && item.departureTime && item.departureAirport) : undefined;
/**
 * Keep at most one anchor per direction.
 *
 * Legacy drafts can hold several cards for the same leg because the old form
 * appended a new anchor on every ＋ press. We never drop a leg that carries
 * data while keeping an emptier one: richer anchors win, ties go to the first.
 */
const anchorCompleteness = (anchor: FlightAnchor): number =>
  [anchor.departureDate, anchor.departureTime, anchor.departureAirport, anchor.arrivalAirport, anchor.departureAirportIata, anchor.arrivalAirportIata]
    .filter(value => typeof value === 'string' && value.trim()).length;
export const dedupeFlightAnchors = (anchors: FlightAnchor[] | undefined): FlightAnchor[] | undefined => {
  if (!anchors) return undefined;
  const best = new Map<FlightAnchor['direction'], FlightAnchor>();
  anchors.forEach(anchor => {
    const current = best.get(anchor.direction);
    if (!current || anchorCompleteness(anchor) > anchorCompleteness(current)) best.set(anchor.direction, anchor);
  });
  return (['OUTBOUND', 'RETURN'] as const).map(direction => best.get(direction)).filter((item): item is FlightAnchor => Boolean(item));
};
const normalizeTravelRules = (value: unknown): TravelRules | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const tax = source.taxRefund && typeof source.taxRefund === 'object' ? source.taxRefund as Record<string, unknown> : undefined;
  const entry = source.entry && typeof source.entry === 'object' ? source.entry as Record<string, unknown> : undefined;
  if (!tax?.guidance && !tax?.summary && !tax?.numericRule && !entry?.guidance && !entry?.summary && !Array.isArray(entry?.actionableItems)) return undefined;
  const actionableItems: EntryActionableItem[] | undefined = Array.isArray(entry?.actionableItems) ? entry.actionableItems.map<EntryActionableItem | null>(item => {
    if (typeof item === 'string' && item.trim()) return { actionType: 'other', title: item.trim() };
    if (!item || typeof item !== 'object') return null;
    const action = item as Record<string, unknown>;
    const title = typeof action.title === 'string' ? action.title.trim() : '';
    if (!title) return null;
    const allowedActionTypes: EntryActionType[] = ['visa_or_eta', 'passport_validity', 'health_declaration', 'customs_declaration', 'arrival_form', 'required_documents', 'onward_travel', 'other'];
    const actionType = allowedActionTypes.includes(action.actionType as EntryActionType) ? action.actionType as EntryActionType : 'other';
    const sourceValue = action.source && typeof action.source === 'object' ? action.source as Record<string, unknown> : undefined;
    const url = typeof sourceValue?.url === 'string' && /^https?:\/\//i.test(sourceValue.url) ? sourceValue.url : undefined;
    return {
      actionType,
      title,
      description: typeof action.description === 'string' && action.description.trim() ? action.description.trim() : undefined,
      timingText: typeof action.timingText === 'string' && action.timingText.trim() ? action.timingText.trim() : undefined,
      source: url && typeof sourceValue?.title === 'string' && sourceValue.title.trim() ? { title: sourceValue.title.trim(), url, publisher: typeof sourceValue.publisher === 'string' && sourceValue.publisher.trim() ? sourceValue.publisher.trim() : undefined } : undefined,
    };
  }).filter((item): item is EntryActionableItem => Boolean(item)) : undefined;
  const normalizeSources = (value: unknown): TravelRuleSource[] | undefined => Array.isArray(value) ? value.map((item): TravelRuleSource | null => {
    if (!item || typeof item !== 'object') return null;
    const sourceValue = item as Record<string, unknown>;
    return typeof sourceValue.title === 'string' && /^https?:\/\//i.test(String(sourceValue.url || ''))
      ? { title: sourceValue.title.trim(), url: String(sourceValue.url), publisher: typeof sourceValue.publisher === 'string' && sourceValue.publisher.trim() ? sourceValue.publisher.trim() : undefined }
      : null;
  }).filter((item): item is TravelRuleSource => Boolean(item)) : undefined;
  const normalizeNumericRule = (value: unknown): TaxRefundNumericRule | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const rule = value as Record<string, unknown>;
    if (typeof rule.currency !== 'string' || !rule.currency.trim()) return undefined;
    if (typeof rule.minSpend !== 'number' || !Number.isFinite(rule.minSpend) || rule.minSpend < 0) return undefined;
    if (!['per_transaction', 'per_receipt', 'same_day_same_merchant', 'same_merchant', 'unknown'].includes(rule.thresholdScope as string)) return undefined;
    if (!rule.refundMethod || typeof rule.refundMethod !== 'object') return undefined;
    const method = rule.refundMethod as Record<string, unknown>;
    if (method.type !== 'rate' && method.type !== 'not_calculable') return undefined;
    if (method.type === 'rate' && (typeof method.rate !== 'number' || !Number.isFinite(method.rate) || method.rate <= 0 || method.rate >= 1)) return undefined;
    const normalized: TaxRefundNumericRule = { currency: rule.currency.trim().toUpperCase(), minSpend: rule.minSpend, thresholdScope: rule.thresholdScope as TaxRefundNumericRule['thresholdScope'], refundMethod: method.type === 'rate' ? { type: 'rate', rate: method.rate as number } : { type: 'not_calculable' } };
    for (const field of ['eligibleCategories', 'excludedCategories'] as const) {
      if (rule[field] !== undefined) {
        if (!Array.isArray(rule[field]) || !rule[field].every((item: unknown) => typeof item === 'string')) return undefined;
        normalized[field] = (rule[field] as string[]).map(item => item.trim()).filter(Boolean);
      }
    }
    return normalized;
  };
  const numericRule = normalizeNumericRule(tax?.numericRule);
  return {
    context: source.context && typeof source.context === 'object' ? (() => {
      const context = source.context as Record<string, unknown>;
      return {
        tripId: typeof context.tripId === 'string' ? context.tripId : undefined,
        destination: typeof context.destination === 'string' ? context.destination : undefined,
        passportCountryCode: typeof context.passportCountryCode === 'string' ? context.passportCountryCode : undefined,
        residenceCountryCode: typeof context.residenceCountryCode === 'string' ? context.residenceCountryCode : undefined,
        residenceStatus: context.residenceStatus === 'known' || context.residenceStatus === 'unknown' ? context.residenceStatus : undefined,
        startDate: typeof context.startDate === 'string' ? context.startDate : undefined,
        endDate: typeof context.endDate === 'string' ? context.endDate : undefined,
      };
    })() : undefined,
    entry: typeof (entry?.guidance ?? entry?.summary) === 'string' || actionableItems?.length ? { guidance: typeof entry.guidance === 'string' ? entry.guidance : undefined, summary: typeof entry.summary === 'string' ? entry.summary : undefined, actionableItems, sources: normalizeSources(entry.sources), fetchedAt: typeof entry.fetchedAt === 'string' ? entry.fetchedAt : undefined } : undefined,
    taxRefund: typeof (tax?.guidance ?? tax?.summary) === 'string' || numericRule ? { guidance: typeof tax.guidance === 'string' ? tax.guidance : undefined, summary: typeof tax.summary === 'string' ? tax.summary : undefined, merchantRequirements: Array.isArray(tax.merchantRequirements) ? tax.merchantRequirements.filter((item): item is string => typeof item === 'string') : undefined, documentRequirements: Array.isArray(tax.documentRequirements) ? tax.documentRequirements.filter((item): item is string => typeof item === 'string') : undefined, processNotes: Array.isArray(tax.processNotes) ? tax.processNotes.filter((item): item is string => typeof item === 'string') : undefined, numericRule, numericRuleSource: tax.numericRuleSource === 'grounded' || tax.numericRuleSource === 'model_knowledge' ? tax.numericRuleSource : undefined, sources: normalizeSources(tax.sources), fetchedAt: typeof tax.fetchedAt === 'string' ? tax.fetchedAt : undefined, numericCalculationAvailable: tax.numericCalculationAvailable === true && Boolean(numericRule && numericRule.thresholdScope === 'per_transaction' && numericRule.refundMethod.type === 'rate'), disclaimer: typeof tax.disclaimer === 'string' ? tax.disclaimer : undefined } : undefined,
    destination: typeof source.destination === 'string' ? source.destination : undefined,
    passportCountryCode: typeof source.passportCountryCode === 'string' ? source.passportCountryCode : undefined,
    residenceStatus: source.residenceStatus === 'unknown' ? 'unknown' : undefined,
    generatedAt: typeof source.generatedAt === 'string' ? source.generatedAt : undefined,
    source: source.source === 'AI_PREPARATION' ? 'AI_PREPARATION' : undefined,
    researchMode: source.researchMode === 'grounded' || source.researchMode === 'model_knowledge' ? source.researchMode : undefined,
    disclaimer: typeof source.disclaimer === 'string' ? source.disclaimer : undefined,
  };
};
const normalizeTravelRuleTaskState = (value: unknown): TravelRuleTaskState | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const allowed: EntryActionType[] = ['visa_or_eta', 'passport_validity', 'health_declaration', 'customs_declaration', 'arrival_form', 'required_documents', 'onward_travel', 'other'];
  const state = value as Record<string, unknown>;
  const normalized = Object.fromEntries(Object.entries(state).filter(([key, item]) => (allowed.includes(key as EntryActionType) || key.startsWith('other:')) && item && typeof item === 'object' && typeof (item as Record<string, unknown>).completed === 'boolean').map(([key, item]) => [key, { completed: (item as { completed: boolean }).completed }])) as TravelRuleTaskState;
  return Object.keys(normalized).length ? normalized : undefined;
};
const normalizeShoppingList = (value: unknown): ShoppingItem[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object').map(item => {
  const source = item as Record<string, unknown>;
  const sourceValue = source.source && typeof source.source === 'object' ? source.source as Record<string, unknown> : undefined;
  const url = typeof sourceValue?.url === 'string' && /^https?:\/\//i.test(sourceValue.url) ? sourceValue.url : undefined;
  const allowedActionTypes = ['visa_or_eta', 'passport_validity', 'health_declaration', 'customs_declaration', 'arrival_form', 'required_documents', 'onward_travel', 'other'];
  return {
    id: typeof source.id === 'string' ? source.id : '',
    name: typeof source.name === 'string' ? source.name : '',
    isPurchased: source.isPurchased === true,
    phase: source.phase === 'during' || source.phase === 'post' || source.phase === 'summary' ? source.phase as ShoppingItem['phase'] : 'pre',
    description: typeof source.description === 'string' && source.description.trim() ? source.description.trim() : undefined,
    timingText: typeof source.timingText === 'string' && source.timingText.trim() ? source.timingText.trim() : undefined,
    source: url && typeof sourceValue?.title === 'string' && sourceValue.title.trim() ? { title: sourceValue.title.trim(), url, publisher: typeof sourceValue.publisher === 'string' && sourceValue.publisher.trim() ? sourceValue.publisher.trim() : undefined } : undefined,
    sourceType: source.sourceType === 'travel_rules' ? ('travel_rules' as const) : undefined,
    travelRuleActionType: allowedActionTypes.includes(String(source.travelRuleActionType)) ? source.travelRuleActionType as ShoppingItem['travelRuleActionType'] : undefined,
    travelRuleNecessity: ['required', 'recommended', 'optional'].includes(String(source.travelRuleNecessity)) ? source.travelRuleNecessity as ShoppingItem['travelRuleNecessity'] : undefined,
  };
}).filter(item => item.id && item.name) : [];

/**
 * Keep a well-formed frozen settlement result, drop a malformed one.
 * Never invents values: a batch settled before freezing existed, or whose
 * stored result is unreadable, simply has none and falls back to legacy
 * recomputation.
 */
const normalizeFrozenSettlementResult = (value: unknown): FrozenSettlementResult | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  if (!source.balances || typeof source.balances !== 'object') return undefined;
  if (typeof source.total !== 'number' || !Number.isFinite(source.total)) return undefined;

  const rawBalances = source.balances as Record<string, unknown>;
  const balances: Record<string, number> = {};
  Object.keys(rawBalances).forEach(id => {
    const amount = rawBalances[id];
    if (typeof amount === 'number' && Number.isFinite(amount)) balances[id] = amount;
  });
  if (Object.keys(balances).length !== Object.keys(rawBalances).length) return undefined;

  return {
    balances,
    total: source.total,
    computedAt: typeof source.computedAt === 'string' ? source.computedAt : '',
  };
};

const normalizeDraft = (value: Partial<TripDraft>): TripDraft | null => {
  if (typeof value.id !== 'string' || !value.id) return null;
  const now = new Date().toISOString();
  const legacyCompanions = Array.isArray(value.companions) ? value.companions : [];
  const normalizedMembers = Array.isArray(value.members)
    ? value.members.filter(item => item && typeof item === 'object' && typeof (item as TripMember).id === 'string' && typeof (item as TripMember).name === 'string').map(item => ({ id: (item as TripMember).id, name: (item as TripMember).name, userId: typeof (item as TripMember).userId === 'string' ? (item as TripMember).userId : undefined, type: (item as TripMember).type === 'owner' || (item as TripMember).type === 'member' ? (item as TripMember).type : 'guest' as const }))
    : [{ id: `${value.id}:owner`, name: '我', userId: typeof value.ownerId === 'string' ? value.ownerId : undefined, type: 'owner' as const }, ...legacyCompanions.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string').map(item => ({ id: item.id, name: item.name, type: 'guest' as const }))];
  return {
    id: value.id,
    ownerId: typeof value.ownerId === 'string' && value.ownerId ? value.ownerId : undefined,
    name: typeof value.name === 'string' ? value.name : '',
    destination: typeof value.destination === 'string' && value.destination ? value.destination : undefined,
    destinationCountry: typeof value.destinationCountry === 'string' && value.destinationCountry ? value.destinationCountry : undefined,
    destinationAddress: typeof value.destinationAddress === 'string' && value.destinationAddress ? value.destinationAddress : undefined,
    destinationLatitude: typeof value.destinationLatitude === 'number' && Number.isFinite(value.destinationLatitude) && value.destinationLatitude >= -90 && value.destinationLatitude <= 90 ? value.destinationLatitude : undefined,
    destinationLongitude: typeof value.destinationLongitude === 'number' && Number.isFinite(value.destinationLongitude) && value.destinationLongitude >= -180 && value.destinationLongitude <= 180 ? value.destinationLongitude : undefined,
    destinationPlaceId: typeof value.destinationPlaceId === 'string' && value.destinationPlaceId ? value.destinationPlaceId : undefined,
    startDate: typeof value.startDate === 'string' ? value.startDate : '',
    endDate: typeof value.endDate === 'string' ? value.endDate : '',
    currency: typeof value.currency === 'string' && value.currency.trim() ? value.currency.trim().toUpperCase() : undefined,
    budget: typeof value.budget === 'number' && Number.isFinite(value.budget) && value.budget >= 0 ? value.budget : undefined,
    expenses: Array.isArray(value.expenses) ? value.expenses : [],
    companions: legacyCompanions,
    members: normalizedMembers,
    settlementBatches: Array.isArray(value.settlementBatches) ? value.settlementBatches.filter(batch => batch && typeof batch.id === 'string' && Array.isArray(batch.expenseIds) && Array.isArray(batch.memberIds)).map(batch => ({ ...batch, status: batch.status === 'settled' ? 'settled' as const : 'open' as const, frozenResult: normalizeFrozenSettlementResult(batch.frozenResult) })) : [],
    shoppingList: normalizeShoppingList(value.shoppingList),
    itinerary: normalizeItinerary(value.itinerary),
    travelCountry: typeof value.travelCountry === 'string' && value.travelCountry ? value.travelCountry : undefined,
    taxRule: value.taxRule,
    visaInfo: value.visaInfo,
    savedInspirations: normalizeInspirations(value.savedInspirations),
    flightAnchors: dedupeFlightAnchors(normalizeFlightAnchors(value.flightAnchors)),
    flightMode: value.flightMode === 'ONE_WAY' ? 'ONE_WAY' : undefined,
    selectedPassportId: typeof value.selectedPassportId === 'string' && value.selectedPassportId ? value.selectedPassportId : undefined,
    travelRules: normalizeTravelRules(value.travelRules),
    travelRuleTaskState: normalizeTravelRuleTaskState(value.travelRuleTaskState),
    travelRulesChecklistMigrationVersion: value.travelRulesChecklistMigrationVersion === 1 ? 1 : undefined,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now,
  };
};

const hasMeaningfulLegacyDraft = (draft: Omit<TripDraft, 'id' | 'createdAt' | 'updatedAt'>) =>
  Boolean(
    draft.name.trim() ||
      draft.destination?.trim() ||
      draft.startDate ||
      draft.endDate ||
      draft.expenses.length ||
      draft.companions.length ||
      draft.shoppingList.length ||
      draft.travelCountry?.trim() ||
      draft.taxRule ||
      draft.visaInfo,
  );

const generateDraftId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export const readDraftStore = (): DraftStore => {
  const storedDrafts = localStorage.getItem(DRAFTS_STORAGE_KEY);
  if (storedDrafts !== null) {
    try {
      const parsedDrafts: unknown = JSON.parse(storedDrafts);
      if (Array.isArray(parsedDrafts)) {
        const drafts = (parsedDrafts as Partial<TripDraft>[])
          .map(normalizeDraft)
          .filter((draft): draft is TripDraft => Boolean(draft));
        const requestedActiveId = localStorage.getItem(ACTIVE_DRAFT_STORAGE_KEY);
        return {
          drafts,
          activeDraftId: drafts.some((draft) => draft.id === requestedActiveId)
            ? requestedActiveId
            : null,
        };
      }
    } catch {
      // Fall through to the lossless legacy migration path.
    }
  }

  const history = parseJson<Trip[]>(localStorage.getItem('trippie_history'), []);
  const historyIds = new Set(history.map((trip) => trip.id));
  const legacyCurrentId = localStorage.getItem('trippie_current_trip_id');
  const legacyDraft = {
    name: localStorage.getItem('trippie_draft_name') || '',
    destination: localStorage.getItem('trippie_trip_destination') || undefined,
    startDate: localStorage.getItem('trippie_trip_start_date') || '',
    endDate: localStorage.getItem('trippie_trip_end_date') || '',
    expenses: parseJson<Expense[]>(localStorage.getItem('trippie_expenses'), []),
    companions: parseJson<Companion[]>(localStorage.getItem('trippie_companions'), []),
    shoppingList: parseJson<ShoppingItem[]>(localStorage.getItem('trippie_shopping_list'), []),
    travelCountry: localStorage.getItem('trippie_country') || undefined,
    taxRule: parseJson<TaxRule | null>(localStorage.getItem('trippie_tax_rule'), null) || undefined,
    visaInfo: parseJson<VisaInfo | null>(localStorage.getItem('trippie_visa_info'), null) || undefined,
  };

  const shouldMigrate =
    hasMeaningfulLegacyDraft(legacyDraft) &&
    (!legacyCurrentId || !historyIds.has(legacyCurrentId));
  const now = new Date().toISOString();
  const migratedDraft = shouldMigrate
    ? normalizeDraft({
        ...legacyDraft,
        id: legacyCurrentId || generateDraftId(),
        createdAt: now,
        updatedAt: now,
      })
    : null;
  const drafts = migratedDraft ? [migratedDraft] : [];

  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    if (migratedDraft) {
      localStorage.setItem(ACTIVE_DRAFT_STORAGE_KEY, migratedDraft.id);
    } else {
      localStorage.removeItem(ACTIVE_DRAFT_STORAGE_KEY);
    }
    localStorage.setItem(MIGRATION_STORAGE_KEY, 'complete');
  } catch {
    // Leave every legacy key intact. A future startup can safely retry migration.
  }

  return { drafts, activeDraftId: migratedDraft?.id || null };
};

export const writeDraftStore = (drafts: TripDraft[], activeDraftId: string | null) => {
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  if (activeDraftId && drafts.some((draft) => draft.id === activeDraftId)) {
    localStorage.setItem(ACTIVE_DRAFT_STORAGE_KEY, activeDraftId);
  } else {
    localStorage.removeItem(ACTIVE_DRAFT_STORAGE_KEY);
  }
};
