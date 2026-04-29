

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
}

export interface ShoppingItem {
  id: string;
  name: string;
  isPurchased: boolean;
  phase: Phase;
  estimatedAmount?: number; // New: For storing AI fetched costs (e.g. Visa fee)
  estimatedCurrency?: string; // New: For storing AI fetched currency
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
  payerId: string; // 'me' or companion ID
  beneficiaries: string[]; // List of IDs including 'me' (Used for EQUAL split)
  splitMethod: SplitMethod;
  splitAllocations: Record<string, number>; // Map userID -> TWD Amount (Used for EXACT/PERCENT)
  needsReview?: boolean; // New field to flag uncertain AI results
  linkedShoppingItemId?: string; // New: To track which shopping item created this expense
}

export interface TaxRule {
  country: string;
  currency: string;
  minSpend: number; // Minimum spend in foreign currency
  refundRate: number; // e.g., 0.10 for 10%
  notes: string;
}

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
  name: string;
  startDate: string;
  endDate: string;
  totalCost: number;
  expenses: Expense[];
  companions: Companion[];
  shoppingList: ShoppingItem[];
  archivedAt: string;
  taxRule?: TaxRule;
  visaInfo?: VisaInfo; // New field for legacy support
}

export interface CurrencyOption {
  code: string;
  name: string;
  defaultRate: number; // Rough estimate defaults
}

export interface ItineraryItem {
  id: string;
  time: string;
  title: string;
  location: string;
  notes: string;
  type: 'FLIGHT' | 'HOTEL' | 'ACTIVITY' | 'FOOD' | 'TRANSPORT';
  linkedExpenseId?: string;
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
}

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
