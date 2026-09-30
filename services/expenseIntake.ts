/**
 * Expense intake: the prompts, schemas and result-shaping for turning a
 * sentence, a receipt photo, or a currency pair into ledger fields.
 *
 * This lives apart from the transport for one reason: it used to run in the
 * browser off `VITE_GEMINI_API_KEY`, which meant the key was bundled into
 * public JavaScript for anyone to read. The API key now stays on the server,
 * and the browser asks the server instead. Keeping the prompts and the
 * normalisation here means both sides agree on the shape without either one
 * holding a credential it shouldn't.
 *
 * Everything below is pure. The provider call is injected, so the rules that
 * actually decide what lands in the ledger can be tested without a network.
 */

import { Category, PaymentMethod } from '../types';

export const EXPENSE_MODEL = 'gemini-3-flash-preview';

/** What the ledger accepts. A value outside this set is a value we drop. */
const CATEGORIES = Object.values(Category) as string[];
const PAYMENT_METHODS = Object.values(PaymentMethod) as string[];

export interface ParsedExpense {
  description?: string;
  amount?: number;
  currency?: string;
  category?: string;
  paymentMethod?: string;
  date?: string;
  country?: string;
  isUncertain?: boolean;
  travelStartDate?: string;
  travelEndDate?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A model answering in free-form is a model that can hand the ledger a
 * category that doesn't exist, a currency of "dollars", or a negative amount.
 * Anything that fails to be one of ours is dropped rather than coerced —
 * a blank field the traveller fills in beats a wrong one they don't notice.
 */
export const normalizeParsedExpense = (raw: unknown): ParsedExpense | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const result: ParsedExpense = {};

  const amount = typeof value.amount === 'number' ? value.amount : Number(value.amount);
  if (Number.isFinite(amount) && amount > 0) result.amount = amount;

  if (typeof value.description === 'string' && value.description.trim()) {
    result.description = value.description.trim().slice(0, 120);
  }

  // ISO 4217 is three letters. Anything else is the model narrating.
  if (typeof value.currency === 'string') {
    const currency = value.currency.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(currency)) result.currency = currency;
  }

  if (typeof value.category === 'string' && CATEGORIES.includes(value.category.trim())) {
    result.category = value.category.trim();
  }

  if (typeof value.paymentMethod === 'string' && PAYMENT_METHODS.includes(value.paymentMethod.trim())) {
    result.paymentMethod = value.paymentMethod.trim();
  }

  for (const field of ['date', 'travelStartDate', 'travelEndDate'] as const) {
    const date = value[field];
    if (typeof date === 'string' && ISO_DATE.test(date.trim())) result[field] = date.trim();
  }

  if (typeof value.country === 'string' && value.country.trim()) {
    result.country = value.country.trim().slice(0, 40);
  }

  if (value.isUncertain === true) result.isUncertain = true;

  // An amount is the one field the form cannot fill in from context. Without
  // it there is nothing to apply, and returning a half-result would overwrite
  // what the traveller already typed with blanks.
  return result.amount === undefined ? null : result;
};

export const textExpensePrompt = (text: string) => `
      Extract expense details from this text: "${text}".
      Identify the description, amount, currency code (ISO 4217), and fit it into one of these categories:
      ${CATEGORIES.join(', ')}.

      Important Category Rules:
      - If the text mentions "幫買", "代買", "幫朋友", "代購" (help buy/buying for friend), set category to '${Category.HELP_BUY}'.
      - If the text mentions "回國", "回家", "機場捷運", "高鐵", "統聯" (return transport), set category to '${Category.TRANSPORT_POST}'.

      Also identify the payment method.
      - If it is credit card, map to '${PaymentMethod.CREDIT_CARD}'.
      - If it is TWD cash (台幣現金) or implied domestic cash, map to '${PaymentMethod.CASH_TWD}'.
      - If it is foreign cash (外幣現金), map to '${PaymentMethod.CASH_FOREIGN}'.
      - If it is IC card/Suica/EasyCard, map to '${PaymentMethod.IC_CARD}'.

      If unknown cash type, just return '${PaymentMethod.CASH_FOREIGN}' if currency is not TWD, otherwise '${PaymentMethod.CASH_TWD}'.

      If the currency is not specified but implied (e.g. "yen"), use the code (JPY). Default to TWD if unknown.
      If category is unclear, use "其他".
    `;

export const imageExpensePrompt = () => `
      Analyze this image (receipt, flight ticket, hotel booking, or screen capture).

      Extract the following details:
      1. Merchant Name or Short Description.
      2. Total Amount (Final total).
      3. Currency Code (ISO 4217).
      4. Category: Choose strictly from: ${CATEGORIES.join(', ')}.
      5. Payment Method: Infer Credit Card, Cash, or IC Card.
      6. Country: Infer the country in Traditional Chinese.

      CRITICAL DATE PARSING:
      - "date": The specific date when the TRANSACTION/PAYMENT happened (or the invoice date). This is for the ledger.
      - "travelStartDate" & "travelEndDate": IF this is a FLIGHT ticket or HOTEL booking, extract the actual TRAVEL dates.
        - For flights: Start = Departure Date, End = Return Date (or Arrival Date if one-way).
        - For hotels: Start = Check-in, End = Check-out.
        - For normal receipts (food, shopping), these fields should be null.

      Format all dates as YYYY-MM-DD.

      Flag 'isUncertain' as true if the image is blurry or key info is ambiguous.
      Return JSON.
    `;

export const exchangeRatePrompt = (fromCurrency: string, toCurrency: string) =>
  `What is the current exchange rate from ${fromCurrency} to ${toCurrency}? Provide only the numerical rate.`;

/**
 * The rate arrives as prose ("The rate is 0.0238 TWD"), so it has to be dug
 * out of the sentence. A rate of zero or a wild one is worse than none: the
 * form falls back to a stored constant when we return null, and a silently
 * wrong rate turns every converted amount in the trip into fiction.
 */
export const extractExchangeRate = (text: unknown): number | null => {
  if (typeof text !== 'string') return null;
  const match = text.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const rate = Number(match[1].replace(',', ''));
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100_000) return null;
  return rate;
};

/**
 * Pulls one currency's rate out of an open.er-api.com response.
 *
 * This is preferred over asking a language model, which is what this feature
 * used to do: the model needed grounded search, grounded search has its own
 * small free-tier quota, and it ran out during testing two days before the
 * trip this was built for. A rates endpoint has no quota, no key, and is not
 * guessing.
 */
export const rateFromFxResponse = (payload: unknown, target: string): number | null => {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as { result?: unknown; rates?: unknown };
  if (body.result !== 'success' || !body.rates || typeof body.rates !== 'object') return null;
  const rate = (body.rates as Record<string, unknown>)[target];
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || rate > 100_000) return null;
  return rate;
};

/** Mirrors ISO 4217: three letters, nothing else reaches the provider. */
export const isCurrencyCode = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z]{3}$/.test(value.trim());

/** Base64 payloads the receipt camera produces; anything else is refused. */
export const isSupportedImageMime = (value: unknown): value is string =>
  typeof value === 'string' && /^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(value.trim());
