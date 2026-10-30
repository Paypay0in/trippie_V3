

import { Category, Phase, CurrencyOption, PaymentMethod } from './types';
import { Plane, Home, Shield, Wifi, Car, ShoppingBag, Coffee, Gift, Ticket, MoreHorizontal, ArrowRightLeft, CreditCard, Banknote, Bus, Coins, Trophy, Sparkles, Smartphone, Shirt, Gem, Watch, HandHelping, FileText } from 'lucide-react';

/**
 * The four phase tabs.
 *
 * `labelKey` is the label, and the only one: a module-level `t()` would freeze
 * the language at import, so every caller resolves the key in the view.
 * `pre` and `during` reuse the existing `phase.*` keys rather than adding a
 * second spelling of the same two words; the other two tabs say something
 * longer here than the short `phase.post` / `phase.summary` used elsewhere.
 */
export const PHASES: { id: Phase; labelKey: string; color: string; icon?: any }[] = [
  { id: 'pre', labelKey: 'phase.pre', color: 'bg-phase-pre' },
  { id: 'during', labelKey: 'phase.during', color: 'bg-phase-during' },
  { id: 'post', labelKey: 'phase.postAirportSpend', color: 'bg-phase-post' },
  { id: 'summary', labelKey: 'phase.tripSettlement', color: 'bg-slate-700', icon: Trophy },
];

export const CATEGORIES_BY_PHASE: Record<Phase, Category[]> = {
  pre: [
    Category.FLIGHT,
    Category.ACCOMMODATION,
    Category.VISA, // Added Visa here
    Category.INSURANCE,
    Category.SIM_WIFI,
    Category.TRANSPORT_AIRPORT,
    Category.EXCHANGE,
    Category.SHOPPING_PRE,
    Category.HELP_BUY,
    Category.OTHER
  ],
  during: [
    Category.FOOD,
    Category.SHOPPING,
    Category.SOUVENIR,
    Category.HELP_BUY,
    Category.TRANSPORT,
    Category.TICKET,
    Category.EXCHANGE,
    Category.OTHER
  ],
  post: [
    Category.COSMETICS,
    Category.ELECTRONICS,
    Category.SOUVENIR,
    Category.FASHION,
    Category.ACCESSORIES,
    Category.FOOD,
    Category.TRANSPORT_POST,
    Category.HELP_BUY,
    Category.OTHER
  ],
  summary: [] // No categories for summary view
};

/*
  A suggestion is a category and an icon. The words come from
  `categoryLabel(category)` in `services/categoryDisplay.ts`, which is the one
  home for naming a stored value — so there is no `label` here to drift from it.

  Two spellings had already drifted before they were removed: 簽證/文件 against
  the stored 簽證, and 網卡/漫遊 against the stored SIM卡/網卡. Both now read as
  the stored value in Chinese and from `EN_LABELS` in English, which is the
  same answer every other expense screen gives.
*/
export const PRE_TRIP_SUGGESTIONS = [
  { category: Category.FLIGHT, icon: Plane },
  { category: Category.ACCOMMODATION, icon: Home },
  { category: Category.VISA, icon: FileText }, // Added suggestion
  { category: Category.INSURANCE, icon: Shield },
  { category: Category.SIM_WIFI, icon: Wifi },
  { category: Category.EXCHANGE, icon: ArrowRightLeft },
];

export const POST_TRIP_SUGGESTIONS = [
  { category: Category.COSMETICS, icon: Sparkles },
  { category: Category.ELECTRONICS, icon: Smartphone },
  { category: Category.SOUVENIR, icon: Gift },
  { category: Category.FASHION, icon: Shirt },
  { category: Category.ACCESSORIES, icon: Gem },
  { category: Category.TRANSPORT_POST, icon: Car },
];

/*
  `name` is never rendered — every caller reads `code` or `defaultRate`. Left as
  written rather than translated into a bundle nothing would ever look up.

  A marker per row, not one for the table: the scanner reads the line itself and
  the line directly above it, so a single comment above the `export` exempts
  nothing below the first row.
*/
export const COMMON_CURRENCIES: CurrencyOption[] = [
  // i18n-data: `name` is never rendered; callers read `code` and `defaultRate`.
  { code: 'TWD', name: '新台幣', defaultRate: 1 },
  // i18n-data: `name` is never rendered; callers read `code` and `defaultRate`.
  { code: 'JPY', name: '日圓', defaultRate: 0.22 },
  // i18n-data: `name` is never rendered; callers read `code` and `defaultRate`.
  { code: 'USD', name: '美金', defaultRate: 32.5 },
  // i18n-data: `name` is never rendered; callers read `code` and `defaultRate`.
  { code: 'EUR', name: '歐元', defaultRate: 35.0 },
  // i18n-data: `name` is never rendered; callers read `code` and `defaultRate`.
  { code: 'KRW', name: '韓元', defaultRate: 0.024 },
  // i18n-data: `name` is never rendered; callers read `code` and `defaultRate`.
  { code: 'CNY', name: '人民幣', defaultRate: 4.5 },
  // i18n-data: `name` is never rendered; callers read `code` and `defaultRate`.
  { code: 'THB', name: '泰銖', defaultRate: 0.9 },
  // i18n-data: `name` is never rendered; callers read `code` and `defaultRate`.
  { code: 'GBP', name: '英鎊', defaultRate: 41.0 },
  // i18n-data: `name` is never rendered; callers read `code` and `defaultRate`.
  { code: 'CAD', name: '加幣', defaultRate: 23.5 },
  // i18n-data: `name` is never rendered; callers read `code` and `defaultRate`.
  { code: 'AUD', name: '澳幣', defaultRate: 21.5 },
  // i18n-data: `name` is never rendered; callers read `code` and `defaultRate`.
  { code: 'SGD', name: '新幣', defaultRate: 24.0 },
  // i18n-data: `name` is never rendered; callers read `code` and `defaultRate`.
  { code: 'HKD', name: '港幣', defaultRate: 4.1 },
];

/*
  Place names, and `CountrySettingsModal` matches typed input against them with
  `includes` before storing one as the destination.
*/
export const POPULAR_COUNTRIES = [
  // i18n-data: matched against typed input before being stored as the destination.
  '日本', '韓國', '泰國', '美國', '法國', '英國', '義大利', '德國', '澳洲', '新加坡', '越南', '中國', '香港', '澳門'
];

/*
  Each `label` is the `PaymentMethod` enum value, which is the string written to
  storage. English comes from `paymentMethodLabel` in
  `services/categoryDisplay.ts`, the one home for naming a stored value.
*/
export const PAYMENT_METHODS_CONFIG = {
  // i18n-data: the label IS the stored PaymentMethod value; translating orphans history.
  [PaymentMethod.CREDIT_CARD]: { label: '信用卡', icon: CreditCard, color: 'text-blue-600 bg-blue-50' },
  // i18n-data: the label IS the stored PaymentMethod value; translating orphans history.
  [PaymentMethod.CASH_TWD]: { label: '台幣現金', icon: Banknote, color: 'text-emerald-600 bg-emerald-50' },
  // i18n-data: the label IS the stored PaymentMethod value; translating orphans history.
  [PaymentMethod.CASH_FOREIGN]: { label: '外幣現金', icon: Coins, color: 'text-orange-600 bg-orange-50' },
  // i18n-data: the label IS the stored PaymentMethod value; translating orphans history.
  [PaymentMethod.IC_CARD]: { label: '交通卡', icon: Bus, color: 'text-purple-600 bg-purple-50' },
};

export const getCategoryIcon = (category: Category) => {
  switch (category) {
    case Category.FLIGHT: return Plane;
    case Category.ACCOMMODATION: return Home;
    case Category.VISA: return FileText;
    case Category.INSURANCE: return Shield;
    case Category.SIM_WIFI: return Wifi;
    case Category.TRANSPORT_AIRPORT: return Car;
    case Category.SHOPPING_PRE: return ShoppingBag;
    case Category.EXCHANGE: return ArrowRightLeft;
    case Category.SHOPPING: return ShoppingBag;
    case Category.FOOD: return Coffee;
    case Category.SOUVENIR: return Gift;
    case Category.TRANSPORT: return Bus;
    case Category.TICKET: return Ticket;
    case Category.COSMETICS: return Sparkles;
    case Category.ELECTRONICS: return Smartphone;
    case Category.FASHION: return Shirt;
    case Category.ACCESSORIES: return Gem;
    case Category.HELP_BUY: return HandHelping;
    case Category.TRANSPORT_POST: return Car;
    default: return MoreHorizontal;
  }
};
