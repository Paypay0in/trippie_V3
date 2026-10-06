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

/**
 * The models to try, in order, when one is out of quota.
 *
 * The free tier meters per model per day — the quota id is literally
 * `GenerateRequestsPerDayPerProjectPerModel-FreeTier` — and the limit on
 * gemini-3-flash is 20 requests. Twenty does not survive two people recording
 * expenses across a six-day trip; it was exhausted in an afternoon of testing.
 *
 * Because the bucket is per model, falling through to the next one is not a
 * workaround, it is what the quota actually permits: four models is four
 * separate daily allowances.
 *
 * All four were checked against the same boarding pass and read it identically
 * — flight number, both IATA codes, date and time — so the order is by
 * capability, not by accuracy anyone has to give up.
 */
export const INTAKE_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
] as const;

/** What the ledger accepts. A value outside this set is a value we drop. */
const CATEGORIES = Object.values(Category) as string[];
const PAYMENT_METHODS = Object.values(PaymentMethod) as string[];

/**
 * One line off the receipt, as printed and as the traveller reads.
 *
 * 「幫用戶條列商品項目並翻譯用戶使用的語言」. A Korean pharmacy receipt is a column
 * of 블루CPR, 큐립연고, 닥터리쥬몰 — and a week later nobody can say what the
 * 107,000 원 was, which is exactly when it matters: at the refund counter, in
 * the settlement, or when deciding whether that category holds goods.
 *
 * Both names are kept. The original is what is printed on the paper somebody
 * is holding up to a counter; the translation is what they understand. A
 * translation that replaced the original would make the receipt and the app
 * impossible to match line by line.
 */
export interface ParsedReceiptItem {
  /** As printed, in the receipt's own script. */
  name: string;
  /** The same thing in Traditional Chinese, when the model could say. */
  translatedName?: string;
  quantity?: number;
  /** What this line came to, in the receipt's currency. */
  amount?: number;
}

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
  /** The receipt's own lines, when it had any. */
  items?: ParsedReceiptItem[];
  /** The shop, as printed. */
  merchant?: string;
  /**
   * The shop's address, as printed on the receipt.
   *
   * 「收據上如果有地址 我希望帳上可以記錄地址 … 地址更能協助大數據分析」. A ledger
   * shared with another traveller is 「someone actually went here and paid
   * this」, and 「CJ올리브영(주) 서면역사점」 is only a name until something says
   * where it is.
   */
  merchantAddress?: string;
  /**
   * The shop refunded the tax at the till, and by how much.
   *
   * 「這收據上已經有實際退稅的資訊 功能應該要識別實際退稅資訊直接帶入」. Korea's
   * 즉시환급 slip prints all three numbers — 판매 가격 19,000, 즉시환급 1,000,
   * 결제금액 18,000 — and the traveller was retyping the middle one, or more
   * often not noticing it and leaving the purchase in a refund estimate it had
   * already been settled out of.
   */
  taxRefundedAtPurchase?: boolean;
  /** What the till actually took off, in the receipt's currency. */
  taxRefundActual?: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A model answering in free-form is a model that can hand the ledger a
 * category that doesn't exist, a currency of "dollars", or a negative amount.
 * Anything that fails to be one of ours is dropped rather than coerced —
 * a blank field the traveller fills in beats a wrong one they don't notice.
 */
/**
 * Where a name stops being a name.
 *
 * Not an absolute length, which is what the first version used and what then
 * ate half the translations on an Olive Young till receipt: 「닥터 포켓몬 콤부차
 * 포도 10+3 매기행사」 is a real product, and no honest translation of it fits in
 * twenty characters. Brand plus flavour plus size plus promotion is simply how
 * cosmetics and drinks are named.
 *
 * A translation is roughly as long as what it translates. An explanation is
 * not: 「화장품」 is three characters and the paragraph that replaced it was
 * forty-four. So the test is proportion, with a slack term so short names are
 * not held to an impossible ratio, and a generous ceiling for runaway prose.
 */
const MAX_TRANSLATED_NAME = 80;
const TRANSLATION_SLACK = 8;

/**
 * A translation, or the model talking about its own work.
 *
 * 「這沒有翻譯跟項目解析」. An Olive Young receipt came back with 「化妝品類商品組合
 * 包裝/化妝品類商品總計(代稱分類，非單一品項，可能包含多項美妝商品，此處依據收據直接
 * 列示其金額/數量總計)」 in a field that is supposed to hold a product name. The
 * caveat may even be true; it is still not what the field is for, and a
 * paragraph where 「護唇膏」 belongs is unreadable in a list.
 *
 * Dropped rather than truncated: half an explanation is not a name either, and
 * the printed line is still shown, which is the honest fallback.
 */
const usableTranslation = (translated: string, printed: string): string => {
  if (!translated || translated === printed) return '';
  if (translated.length > MAX_TRANSLATED_NAME) return '';
  if (translated.length > printed.length * 3 + TRANSLATION_SLACK) return '';
  // A name does not explain itself in parentheses, and does not need commas.
  if (/[（(][^）)]{8,}/.test(translated) || /[，,、。]/.test(translated)) return '';
  return translated;
};

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

  if (typeof value.merchant === 'string' && value.merchant.trim()) {
    result.merchant = value.merchant.trim().slice(0, 60);
  }

  if (typeof value.merchantAddress === 'string' && value.merchantAddress.trim()) {
    result.merchantAddress = value.merchantAddress.trim().slice(0, 160);
  }

  /*
    Lines are kept only when they have a name.

    A row of blank names with numbers beside them is worse than no itemisation:
    it looks like data and says nothing. Discounts come through as negative
    amounts and are kept — 「-30,000원 일반의약품」 is why the total is not the
    sum of the lines, and hiding it would make the receipt look wrong.
  */
  if (Array.isArray(value.items)) {
    const items = value.items
      .map(entry => (entry && typeof entry === 'object' ? entry as Record<string, unknown> : null))
      .filter((entry): entry is Record<string, unknown> => entry !== null)
      .map(entry => {
        const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 80) : '';
        if (!name) return null;
        const translated = usableTranslation(
          typeof entry.translatedName === 'string' ? entry.translatedName.trim() : '',
          name,
        );
        const quantity = Number(entry.quantity);
        const amount = Number(entry.amount);
        return {
          name,
          // A 「translation」 identical to the original is not one, and showing
          // the same string twice reads as a rendering fault.
          ...(translated ? { translatedName: translated } : {}),
          ...(Number.isFinite(quantity) && quantity > 0 ? { quantity } : {}),
          ...(Number.isFinite(amount) ? { amount } : {}),
        } as ParsedReceiptItem;
      })
      .filter((entry): entry is ParsedReceiptItem => entry !== null)
      .slice(0, 40);
    if (items.length) result.items = items;
  }

  /*
    An immediate refund, accepted only when the receipt's own numbers agree.

    The slip prints 판매 가격, 즉시환급 and 결제금액, and the three have to
    reconcile: total − refund = charged. When they do not, the model has
    confused two of them — V.A.T for the refund is the easy mistake — and a
    wrong refund is worse than none, because it silently reduces what this
    purchase is recorded as having cost.
  */
  const refund = Number(value.taxRefundActual);
  const charged = Number(value.amountChargedAfterRefund);

  /*
    The total, corrected when the receipt's other numbers outvote it.

    His Olive Young till receipt came back as 42,500 against a 판매 계 of
    40,500 — a plain misreading of the one figure the whole record is built
    on. But the same receipt also printed 결제금액 38,500 and 텍스리펀드 2,000,
    and its six item lines add to exactly 40,500. Two independent figures
    agreeing against one is not a tie.

    Only ever applied with both witnesses present and in agreement. One of them
    alone could just as easily be the misread, and quietly rewriting an amount
    on weaker evidence than that would be the app inventing what somebody
    spent.
  */
  const itemsTotal = (result.items || [])
    .filter(line => Number.isFinite(line.amount))
    .reduce((sum, line) => sum + (line.amount as number), 0);
  const impliedTotal = Number.isFinite(charged) && Number.isFinite(refund) ? charged + refund : undefined;
  if (impliedTotal !== undefined
      && result.items?.length
      && Math.abs(itemsTotal - impliedTotal) <= 1
      && result.amount !== undefined
      && Math.abs(result.amount - impliedTotal) > 1) {
    result.amount = impliedTotal;
  }

  const total = result.amount;
  if (value.taxRefundedAtPurchase === true
      && Number.isFinite(refund) && refund > 0
      && total !== undefined && refund < total
      && (!Number.isFinite(charged) || Math.abs(total - refund - charged) <= 1)) {
    result.taxRefundedAtPurchase = true;
    result.taxRefundActual = refund;
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
      1. Description: a short name for this expense IN TRADITIONAL CHINESE (zh-TW).
         The reader does not read Korean, Japanese or Thai. 「광안리 대교밀면」 must come
         back as 「廣安里 大橋麥麵」, not copied through untranslated. Keep a recognisable
         brand as-is only when it is already Latin script (Starbucks, UNIQLO).
      2. Total Amount: the price of the goods BEFORE any tax refund — Korea's
         「판매 가격 / 판매 계 / Total amount」. On an immediate-refund (즉시환급) slip this
         is NOT the 「결제금액 / Purchase Price」 actually charged; that one is the
         total minus the refund, and is reported separately in field 9.
         CHECK THIS FIGURE before answering: it should equal the sum of the item
         lines you transcribe in field 8, and it should equal the charged amount plus
         the refund in field 9. If either disagrees, re-read the digits on the
         receipt rather than reporting the first reading — every other number in this
         record is built on this one.
      3. Currency Code (ISO 4217).
      4. Category: Choose strictly from: ${CATEGORIES.join(', ')}.
      5. Payment Method: Infer Credit Card, Cash, or IC Card.
      6. Country: Infer the country in Traditional Chinese.
      7. Merchant: the shop name EXACTLY as printed, in its own script, untranslated.
      7b. Merchant address: the shop's street address as printed on the receipt, in its own
          script, untranslated and unabbreviated. Receipts print it near the shop name or the
          business registration number (주소, 소재지, 住所). Omit it when the receipt does not
          print one — never infer an address from the shop's name.
      8. Items: TRANSCRIBE the product lines, one entry per line printed on the paper.
         - "name": exactly as printed, in the receipt's own script. Do not translate this field.
         - "translatedName": the product name in Traditional Chinese (zh-TW), as a shopper would
           say it. A NAME ONLY, at most about 20 characters. Never a sentence, never a caveat,
           never an explanation of what the line is or how you read it. If you cannot tell what
           the product is, omit this field — saying nothing is correct, explaining yourself is not.
         - "quantity" and "amount": the line's quantity and its line total, as numbers in the receipt currency.
         - Include discount lines, with a negative amount, so the lines explain the total.
         - NEVER merge several products into one entry, and never replace the products with a
           department or category summary line (화장품, 잡화, 일반의약품, 食品). If the receipt
           prints such a subtotal AND the products above it, transcribe the products; a summary
           line on its own tells the reader nothing they did not already know from the total.
         - If the image is not an itemised receipt, return an empty list rather than inventing lines.
      9. Tax refund already deducted, only when the receipt itself shows one. The labels
         vary by till: 즉시환급, 텍스리펀드, 택스리펀드, Immediate Tax Refund, Refund value,
         Tax Refund. A store receipt shows it between 판매 계 and 결제금액:
         - "taxRefundedAtPurchase": true when the shop already deducted the tax.
         - "taxRefundActual": the refunded amount, in the receipt's currency (즉시환급 / Refund value).
         - "amountChargedAfterRefund": the amount actually charged (결제금액 / Purchase Price).
         Leave all three out on an ordinary receipt. V.A.T printed on its own is
         not a refund — tax paid and tax returned are different numbers.

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

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/**
 * What the file actually is, read from its own first bytes.
 *
 * The browser's `file.type` is not trustworthy enough to gate on. iOS hands
 * back an empty string often enough, and a type can legitimately arrive with
 * parameters ("image/jpeg; charset=utf-8"). Both were refused with 「需要一張
 * 截圖」 while holding a perfectly good photo.
 */
export const sniffImageMime = (base64Data: string): string | null => {
  const head = base64Data.slice(0, 32);
  if (head.startsWith('iVBORw0KGgo')) return 'image/png';
  if (head.startsWith('/9j/')) return 'image/jpeg';
  if (head.startsWith('UklGR')) return 'image/webp';
  // HEIC/HEIF carry an ftyp box a few bytes in; the brand lands in the same
  // base64 region regardless of the leading box length.
  if (/^[A-Za-z0-9+/]{4,8}(ZnR5cA|GZ0eXA|Zn0eXB)/.test(head)) return 'image/heic';
  return null;
};

/**
 * The type to send the provider, preferring what the bytes say over what the
 * browser claimed. Returns null only when neither is usable.
 */
export const resolveImageMime = (declared: unknown, base64Data: string): string | null => {
  const sniffed = sniffImageMime(base64Data);
  if (sniffed) return sniffed;
  if (typeof declared !== 'string') return null;
  // Drop any parameters and match on the type alone.
  const type = declared.split(';')[0].trim().toLowerCase();
  const normalized = type === 'image/jpg' ? 'image/jpeg' : type;
  return SUPPORTED_IMAGE_TYPES.includes(normalized) ? normalized : null;
};

/** Kept for the guard tests; prefer resolveImageMime, which also reads bytes. */
export const isSupportedImageMime = (value: unknown): value is string =>
  typeof value === 'string' &&
  SUPPORTED_IMAGE_TYPES.includes(
    (value.split(';')[0].trim().toLowerCase() === 'image/jpg'
      ? 'image/jpeg'
      : value.split(';')[0].trim().toLowerCase()),
  );
