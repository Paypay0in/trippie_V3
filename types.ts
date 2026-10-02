

export type Phase = 'pre' | 'during' | 'post' | 'summary';

export enum Category {
  FLIGHT = '機票',
  ACCOMMODATION = '住宿',
  VISA = '簽證', // New Category
  INSURANCE = '保險',
  SIM_WIFI = 'SIM卡/網卡',
  TRANSPORT_AIRPORT = '機場接送',
  SHOPPING_PRE = '行前採買',
  EXCHANGE = '換匯',
  SHOPPING = '購物',
  FOOD = '餐飲',
  SOUVENIR = '伴手禮/紀念品',
  TRANSPORT = '交通',
  TICKET = '票券',
  
  // New Category for Help Buy
  HELP_BUY = '朋友代買',

  // New Categories for Airport/Post-Trip
  COSMETICS = '美妝保養',
  ELECTRONICS = '3C家電',
  FASHION = '服飾鞋包',
  ACCESSORIES = '飾品配件',
  TRANSPORT_POST = '回國交通',
  
  OTHER = '其他'
}

export enum PaymentMethod {
  CREDIT_CARD = '信用卡',
  CASH_TWD = '台幣現金',
  CASH_FOREIGN = '外幣現金',
  IC_CARD = '交通卡'
}

export type SplitMethod = 'EQUAL' | 'PERCENT' | 'EXACT';

export interface Companion {
  id: string;
  name: string;
  /**
   * The account this seat belongs to, once an invite has been claimed.
   *
   * It had nowhere to live. The server knew the seat was linked, the local
   * roster could only hold a name, and every screen that asked "which of these
   * people is using this device" therefore answered "the owner" — on both
   * phones. The same gap sent the stale roster back and unlinked the seat
   * server-side on the next push.
   */
  userId?: string;
  /** 'member' once an account holds the seat; 'guest' is a name on a list. */
  type?: 'member' | 'guest';
}

export interface TripMember {
  id: string;
  name: string;
  userId?: string;
  type: 'owner' | 'member' | 'guest';
}

export interface ShoppingItem {
  id: string;
  name: string;
  isPurchased: boolean;
  phase: Phase;
  estimatedAmount?: number; // New: For storing AI fetched costs (e.g. Visa fee)
  estimatedCurrency?: string; // New: For storing AI fetched currency
  description?: string;
  timingText?: string;
  source?: {
    title: string;
    url: string;
    publisher?: string;
  };
  sourceType?: 'travel_rules';
  travelRuleActionType?: EntryActionType;
  travelRuleNecessity?: EntryNecessity;
}

export type ExpenseDisputeStatus = 'open' | 'resolved' | 'withdrawn';

/**
 * The fields a member may propose changing on someone else's expense.
 *
 * Deliberately the split-related ones: the money and who it is shared with.
 * Title, date and category are not disputes about the ledger, and letting a
 * proposal rewrite them would turn approval into a blind signature.
 */
export type ExpenseProposalFields = Pick<
  Expense,
  | 'amount'
  | 'payerId'
  | 'payerAllocations'
  | 'beneficiaries'
  | 'splitMethod'
  | 'splitAllocations'
>;

export interface ExpenseProposal {
  /** Only the fields that actually differ from the record. */
  changes: Partial<ExpenseProposalFields>;
  /**
   * The same fields as they stood when the proposal was written. If the record
   * has moved on since, the proposal is stale and must not be applied blindly —
   * and this is also what the before/after comparison is drawn from.
   */
  basedOn: Partial<ExpenseProposalFields>;
}

/**
 * A question raised about someone else's expense.
 *
 * Members who are affected by a record but did not create it cannot edit or
 * delete it. A dispute is the outlet that replaces those actions: it changes
 * nothing about the money, it just attaches a question to the record so the
 * creator can answer or correct it themselves.
 */
export interface ExpenseDispute {
  id: string;
  /** TripMember who raised the question. */
  raisedByMemberId: string;
  /** What they are asking. */
  message: string;
  /**
   * An optional correction the raiser is proposing. A question plus the exact
   * change the creator can accept in one tap, instead of a conversation that
   * ends with the creator retyping it themselves.
   */
  proposal?: ExpenseProposal;
  status: ExpenseDisputeStatus;
  createdAt: string;
  /** Reply from the creator (or trip owner) when the question is closed. */
  response?: string;
  respondedByMemberId?: string;
  resolvedAt?: string;
  /**
   * Set when a proposal was approved and written onto the expense. Marks the
   * one case that can be undone: a plain reply changed nothing, so there is
   * nothing to take back.
   */
  appliedAt?: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  currency: string;
  exchangeRate: number; // Rate to TWD
  handlingFee?: number; // Fee in TWD (mostly for exchange)
  twdAmount: number;
  category: Category;
  paymentMethod: PaymentMethod;
  phase: Phase;
  date: string;
  /**
   * The TripMember who entered this expense into the ledger. Ownership for
   * edit/delete permission is decided by this field alone — never by payerId,
   * which only records who paid. Optional because expenses written before
   * this field existed carry no creator; see getExpenseCreatorMemberId().
   */
  createdByMemberId?: string;
  payerId: string; // 'me' or companion ID
  payerAllocations?: Record<string, number>; // Actual TWD paid by each TripMember
  beneficiaries: string[]; // List of IDs including 'me' (Used for EQUAL split)
  splitMethod: SplitMethod;
  splitAllocations: Record<string, number>; // Map userID -> TWD Amount (Used for EXACT/PERCENT)
  /** Questions raised by affected members who may not edit this record. */
  disputes?: ExpenseDispute[];
  needsReview?: boolean; // New field to flag uncertain AI results
  linkedShoppingItemId?: string; // New: To track which shopping item created this expense
  /**
   * Receipts photographed for this expense, downscaled in the browser.
   *
   * 「帳目中可以新增照片 剛點擊沒有反應」 — the button existed, disabled, titled
   * 照片功能尚未開放. A receipt is the evidence behind a split that two people
   * settle from, and it is worth keeping where the number is.
   */
  receiptPhotos?: string[];
}

/**
 * The settlement result captured at the moment a batch was marked settled.
 * Stored so a historical batch renders exactly what was agreed then, instead of
 * being recomputed by a later version of the calculator. Optional and additive:
 * batches settled before this existed simply carry no frozen result.
 */
export interface FrozenSettlementResult {
  /** Net balance per member id, as computed when the batch was settled. */
  balances: Record<string, number>;
  /** Batch expense total at settlement time. */
  total: number;
  /** When the freeze was taken, so historical results stay auditable. */
  computedAt: string;
}

export interface SettlementBatch {
  id: string;
  tripId: string;
  title: string;
  expenseIds: string[];
  memberIds: string[];
  /**
   * Marks `memberIds` as settlement TARGETS (counterparties, owner excluded),
   * written by the current target-selection flow.
   *
   * Absent on every historical batch, where `memberIds` held the whole roster.
   * Absence therefore means legacy, and legacy batches keep whole-expense
   * settlement semantics. Never inferred from owner presence or createdAt.
   */
  memberIdsKind?: 'targets';
  startDate?: string;
  endDate?: string;
  status: 'open' | 'settled';
  createdAt: string;
  settledAt?: string;
  /** Present only on batches settled after freezing was introduced. */
  frozenResult?: FrozenSettlementResult;
}

export interface TaxRule {
  country: string;
  currency: string;
  minSpend: number; // Minimum spend in foreign currency
  refundRate: number; // e.g., 0.10 for 10%
  notes: string;
}

export type TaxRefundThresholdScope = 'per_transaction' | 'per_receipt' | 'same_day_same_merchant' | 'same_merchant' | 'unknown';
export type TaxRefundRefundMethod = { type: 'rate'; rate: number } | { type: 'not_calculable' };
export interface TaxRefundNumericRule {
  currency: string;
  minSpend: number;
  thresholdScope: TaxRefundThresholdScope;
  refundMethod: TaxRefundRefundMethod;
  eligibleCategories?: string[];
  excludedCategories?: string[];
}

export interface TravelRules {
  context?: { tripId?: string; destination?: string; passportCountryCode?: string; residenceCountryCode?: string; residenceStatus?: 'known' | 'unknown'; startDate?: string; endDate?: string };
  entry?: { guidance?: string; summary?: string; actionableItems?: EntryActionableItem[]; sources?: TravelRuleSource[]; fetchedAt?: string };
  taxRefund?: { guidance?: string; summary?: string; merchantRequirements?: string[]; documentRequirements?: string[]; processNotes?: string[]; numericRule?: TaxRefundNumericRule; numericRuleSource?: 'grounded' | 'model_knowledge'; sources?: TravelRuleSource[]; fetchedAt?: string; numericCalculationAvailable?: boolean; disclaimer?: string };
  destination?: string;
  passportCountryCode?: string;
  residenceStatus?: 'unknown';
  generatedAt?: string;
  source?: 'AI_PREPARATION';
  researchMode?: 'grounded' | 'model_knowledge';
  disclaimer?: string;
}

export type TravelRuleTaskState = Record<string, { completed: boolean }>;

export interface TravelRuleSource {
  title: string;
  url: string;
  publisher?: string;
}

/**
 * Whether a formality is compulsory or merely a good idea.
 *
 * 「入境規定 必要的只有我的打勾項」 — K-ETA, Q-Code, the customs form and the
 * arrival card were listed as one flat run of chores, and only the last was
 * actually required of them. A checklist that cannot say which is which makes
 * the traveller rank it themselves, two days before flying.
 */
export type EntryNecessity = 'required' | 'recommended' | 'optional';

export interface EntryActionableItem {
  actionType: EntryActionType;
  necessity?: EntryNecessity;
  title: string;
  description?: string;
  timingText?: string;
  source?: {
    title: string;
    url: string;
    publisher?: string;
  };
}

export type EntryActionType =
  | 'visa_or_eta'
  | 'passport_validity'
  | 'health_declaration'
  | 'customs_declaration'
  | 'arrival_form'
  | 'required_documents'
  | 'onward_travel'
  | 'other';

export interface VisaInfo {
  destination: string;
  origin: string;
  requirement: 'VISA_FREE' | 'E_VISA' | 'VISA_REQUIRED' | 'UNKNOWN';
  visaName: string; // e.g. "ESTA", "K-ETA", "落地簽"
  visaLink?: string;
  entryFormName?: string; // e.g. "Visit Japan Web", "SG Arrival Card"
  entryFormLink?: string;
  feeAmount: number;
  feeCurrency: string;
  notes: string;
}

export interface Trip {
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
  totalCost: number;
  expenses: Expense[];
  companions: Companion[];
  members?: TripMember[];
  settlementBatches?: SettlementBatch[];
  shoppingList: ShoppingItem[];
  itinerary?: ItineraryItem[];
  travelCountry?: string;
  travelBook?: TravelBook;
  createdAt?: string;
  updatedAt?: string;
  archivedAt: string;
  taxRule?: TaxRule;
  visaInfo?: VisaInfo; // New field for legacy support
  savedInspirations?: SavedInspiration[];
  flightAnchors?: FlightAnchor[];
  flightMode?: TripFlightMode;
  selectedPassportId?: string;
  travelRules?: TravelRules;
  travelRuleTaskState?: TravelRuleTaskState;
  travelRulesChecklistMigrationVersion?: number;
}

export interface PassportProfile {
  id: string;
  country: string;
  countryCode?: string;
}

export interface SavedInspiration {
  id: string;
  title: string;
  country?: string;
  city?: string;
  placeName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  note?: string;
  content?: string;
  sourceType?: 'PLACE' | 'POST' | 'EXPERIENCE' | 'NOTE' | 'OTHER';
  sourceReference?: string;
  selectedForPlanning?: boolean;
}

export type CommunityPostStatus = 'draft' | 'published';

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
}

export type PostSliceType = 'place' | 'food' | 'hotel' | 'activity' | 'transport' | 'tip';
export type ExperienceNoteType = 'recommendation' | 'warning' | 'timing' | 'queue' | 'packing' | 'facility' | 'price' | 'order' | 'transport' | 'practical' | 'other';

export interface ExperienceNote {
  id: string;
  sliceId: string;
  postId: string;
  creatorId: string;
  type: ExperienceNoteType;
  text: string;
  sourceText?: string;
  createdAt: string;
}

export interface PostSlice {
  id: string;
  postId: string;
  creatorId: string;
  type: PostSliceType;
  title: string;
  summary?: string;
  country: string;
  city: string;
  placeName?: string;
  placeId?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  sourceText?: string;
  notes: ExperienceNote[];
  createdAt: string;
}

export interface CommunityPost {
  id: string;
  creatorId: string;
  authorName: string;
  authorAvatar?: string;
  title: string;
  content: string;
  country: string;
  city: string;
  coverImage?: string;
  /** Photos attached by the author, downscaled before storage. Max 10. */
  photos?: string[];
  status: CommunityPostStatus;
  createdAt: string;
  updatedAt?: string;
  publishedAt?: string;
  slices?: PostSlice[];
}

/**
 * Where the URL came from and what it promises.
 *
 *  - `direct`: a specific product/venue page someone verified. The UI may offer
 *    查看價格, because a price really is on the other side.
 *  - `search`: a provider search result for the place. The UI says 搜尋 and never
 *    implies a product page exists.
 */
export type BookingUrlType = 'direct' | 'search';

/**
 * A place to buy or check a ticket.
 *
 * Only ever built from a URL that was declared by a trustworthy source and then
 * validated — never from a pattern filled in with a place name. A button the user
 * can click has to land somewhere real.
 */
export interface PlaceBookingOption {
  provider: 'official' | 'klook' | 'kkday' | string;
  label: string;
  url: string;
  urlType: BookingUrlType;
  /** ISO date the URL was last checked, when it was checked at all. */
  verifiedAt?: string;
}

/**
 * Ticket and booking information for a place.
 *
 * Deliberately part of the Place / itinerary enrichment layer and never stored on
 * a SavedTravelInspiration: commerce data goes stale and is not provenance. It is
 * also never persisted onto an ItineraryItem — it is looked up for display, so a
 * price can never be silently preserved past its usefulness.
 */
export interface PlaceCommerceInfo {
  /** Undefined means "not established", which is different from false. */
  admissionRequired?: boolean;
  /**
   * Present only when it came from a trusted source and is still current. Never
   * model-generated, and never shown without `source` and `checkedAt` — a number
   * nobody can attribute or date is not a price, it is a rumour.
   */
  officialPrice?: {
    amount: number;
    currency: string;
    label?: string;
    /** Human-readable attribution, e.g. 官方網站. */
    sourceName: string;
    /** The page the amount was actually read from. */
    sourceUrl: string;
    /** ISO date the amount was read. */
    checkedAt: string;
  };
  /**
   * True when a verified price exists but is too old to present as current. The
   * card shows 查看最新票價 rather than a stale figure.
   */
  priceStale?: boolean;
  bookingOptions?: PlaceBookingOption[];
  /** Short practical lines, e.g. 需事先預約. */
  notes?: string[];
  /** ISO timestamp of when the underlying data was last verified. */
  lastCheckedAt?: string;
}

export interface SavedExperienceNote {
  id: string;
  sourceNoteId: string;
  sourceSliceId: string;
  sourcePostId: string;
  sourceCreatorId: string;
  type: ExperienceNoteType;
  text: string;
}

export interface SavedTravelInspiration {
  id: string;
  savedByUserId: string;
  country: string;
  city: string;
  placeName: string;
  placeId?: string;
  resolvedPlaceName?: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  placePhotoUrl?: string;
  sourcePostId: string;
  sourceSliceId: string;
  sourceCreatorId: string;
  sourceNoteIds: string[];
  savedAt: string;
  notes: SavedExperienceNote[];
}

export interface FlightAirport {
  iataCode: string;
  name: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
}

export type TripFlightMode = 'ROUND_TRIP' | 'ONE_WAY';

export interface FlightAnchor {
  id: string;
  direction: 'OUTBOUND' | 'RETURN';
  departureAirportIata?: string;
  departureAirportCity?: string;
  departureAirportCountry?: string;
  arrivalAirportIata?: string;
  arrivalAirportCity?: string;
  arrivalAirportCountry?: string;
  departureDate: string;
  departureTime: string;
  departureAirport: string;
  departureAirportAddress?: string;
  departureAirportPlaceId?: string;
  departureAirportLatitude?: number;
  departureAirportLongitude?: number;
  arrivalDate?: string;
  arrivalTime?: string;
  arrivalAirport?: string;
  arrivalAirportAddress?: string;
  arrivalAirportPlaceId?: string;
  arrivalAirportLatitude?: number;
  arrivalAirportLongitude?: number;
  airportArrivalBufferMinutes: number;
  source: 'MANUAL';
}

export interface CurrencyOption {
  code: string;
  name: string;
  defaultRate: number; // Rough estimate defaults
}

/** How an official itinerary item came to exist. Absent on hand-entered items. */
export type ItineraryItemOrigin = 'saved_inspiration' | 'ai_suggestion';

export type ScheduleFlexibility = 'fixed' | 'flexible';

/**
 * Kinds of hard time constraint. Conflict logic keys off `scheduleFlexibility`,
 * never off the kind, so supporting a new kind needs no new conflict rules.
 */
export type FixedEventKind = 'flight' | 'train' | 'reservation' | 'ticketed_event' | 'accommodation';

export interface ItineraryItem {
  id: string;
  time: string;
  title: string;
  location: string;
  notes: string;
  type: 'FLIGHT' | 'HOTEL' | 'ACTIVITY' | 'FOOD' | 'TRANSPORT';
  linkedExpenseId?: string;
  date?: string;
  isCompleted?: boolean;
  placeId?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  derivedFromFlightAnchorId?: string;
  /** Minutes the item is expected to take, when the source supplied one. */
  durationMinutes?: number;
  /**
   * Provenance carried over when an AI proposal is accepted into the official
   * itinerary. `sourceInspirationIds` references SavedTravelInspiration ids and is
   * only ever set from a proposal item that already proved that linkage — a place
   * name never confers it.
   */
  /**
   * Whether this activity's time can be moved to resolve a conflict.
   *
   * Absent means flexible: sightseeing, shopping, a beach. `fixed` marks a hard
   * constraint — a flight, a train, a booked table — which Trippie may never
   * reschedule on the user's behalf.
   */
  scheduleFlexibility?: ScheduleFlexibility;
  /**
   * User-pinned. The AI planner may never move, retime, relocate or remove a
   * pinned item; manual editing is unaffected. Absent means not pinned.
   */
  isPinned?: boolean;
  /** What kind of hard constraint this is, when it is one. */
  fixedEventKind?: FixedEventKind;
  origin?: ItineraryItemOrigin;
  /**
   * Explicit position within its day, set only once a user has dragged that day
   * into an order of their own. Absent everywhere by default, in which case the
   * day falls back to chronological order exactly as before — so adding this
   * field changes nothing until someone actually reorders something.
   */
  sortOrder?: number;
  sourceInspirationIds?: string[];
  /**
   * Experience notes copied from the Saved Inspiration this item came from, so the
   * itinerary card can show them without re-reading the saved store or the source
   * CommunityPost. Only ever populated alongside a proven `sourceInspirationIds`
   * linkage — a matching place name never earns notes.
   *
   * This is the existing SavedExperienceNote shape, not a copy of the post.
   */
  savedTravelNotes?: SavedExperienceNote[];
}

export interface PublicTrip extends Trip {
  authorName: string;
  authorAvatar?: string;
  likes: number;
  clones: number;
  isPublic: boolean;
  tags: string[];
  photos: string[];
}

export interface MarketplaceService {
  id: string;
  providerName: string;
  providerAvatar?: string;
  serviceType: 'BOOKING' | 'TRANSLATION' | 'GUIDE';
  title: string;
  description: string;
  price: number;
  currency: string;
  rating: number;
}

/** What kind of help is being asked for. */
export type ServiceRequestType = 'task_bundle' | 'consultation' | 'accompaniment';

/**
 * A fixed list, not free text: a category someone typed their own way cannot be
 * matched against what helpers offer.
 */
export type ServiceCategory = 'booking' | 'translation' | 'consultation' | 'on_site' | 'other';

/** The human capability being asked for — what matching will compare on. */
export type AssistanceNeed = 'phone_call' | 'on_site' | 'translation' | 'multi_contact' | 'other';

export type ServiceRequestStatus = 'requested' | 'in_progress' | 'completed' | 'cancelled';

/**
 * One checklist task inside a request.
 *
 * `sourceTaskId` is the canonical to-do; `taskName` is a snapshot taken when
 * the request was published. The snapshot exists because checklist tasks are
 * not cloud-synced yet, so an id alone would be a blank line to anyone reading
 * the request anywhere else. The to-do remains the source of truth — nothing
 * here is ever written back to it.
 */
export interface ServiceRequestTask {
  sourceTaskId: string;
  taskName: string;
  position: number;
}

/**
 * One coherent job handed to a person.
 *
 * Its status is its own. Publishing a request is not completing a to-do, and
 * this status never touches `ShoppingItem.isPurchased`: ticking the checklist
 * stays the traveller's to do.
 */
export interface ServiceRequest {
  id: string;
  tripId: string;
  requestedByUserId: string;
  type: ServiceRequestType;
  title: string;
  /** The traveller's own sentence about what they want, optional. */
  goal?: string;
  serviceCategory: ServiceCategory;
  /** Country, plus a city or venue when the traveller adds one. */
  location: string;
  /** Left empty unless the traveller says so — a guessed date is worse than none. */
  requestedDate?: string;
  requestedTime?: string;
  languageNeeds: string[];
  assistanceNeeds: AssistanceNeed[];
  status: ServiceRequestStatus;
  createdAt: string;
  tasks: ServiceRequestTask[];
}

export interface InboxMessage {
  id: string;
  serviceTitle: string;
  sender: string;
  lastMessage: string;
  time: string;
  unread: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar?: string;
  points: number;
  trippieCoins: number;
  level: number;
  passports?: PassportProfile[];
  defaultPassportId?: string;
}

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface TravelBook {
  tripId: string;
  summary: string;
  trajectory: string[]; // List of locations/highlights
  aiNarrative: string;
  coverPhoto?: string;
}

export interface SummaryStats {
  totalTWD: number;
  byPhase: Record<Phase, number>;
  byCategory: Record<string, number>;
}
