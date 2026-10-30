import { AssistanceNeed, ServiceCategory, ShoppingItem } from '../types';

/**
 * What the publish form can fill in by itself.
 *
 * A ten-field form nobody finishes is a feature nobody uses, so anything the
 * trip already knows is pre-filled. Anything it does not know is left empty —
 * particularly the date, because a date is the one field a helper will act on,
 * and a plausible guess is worse than a blank.
 *
 * Every default here is a pre-selection the traveller can change, never a
 * statement made on their behalf.
 */

/**
 * The language someone would need to speak locally. Only where it is unambiguous.
 *
 * Both halves are DATA. The keys are matched against a stored
 * `destinationCountry` with `includes`, and the values go into
 * `ServiceRequest.languageNeeds` — `ServiceRequestSheet` already says so on
 * its own copy of the list, and compares what it renders against what this
 * returns, so a translated value would stop the pre-selection matching.
 */
const LOCAL_LANGUAGE: Record<string, string> = {
  // i18n-data: matched against a stored country; value stored in languageNeeds
  日本: '日文',
  // i18n-data: matched against a stored country; value stored in languageNeeds
  韓國: '韓文',
  // i18n-data: matched against a stored country; value stored in languageNeeds
  南韓: '韓文',
  // i18n-data: matched against a stored country; value stored in languageNeeds
  泰國: '泰文',
  // i18n-data: matched against a stored country; value stored in languageNeeds
  越南: '越南文',
  // i18n-data: matched against a stored country; value stored in languageNeeds
  法國: '法文',
  // i18n-data: matched against a stored country; value stored in languageNeeds
  德國: '德文',
  // i18n-data: matched against a stored country; value stored in languageNeeds
  西班牙: '西班牙文',
  // i18n-data: matched against a stored country; value stored in languageNeeds
  義大利: '義大利文',
};

/*
  Words looked for inside traveller-written task names. Nothing here is ever
  rendered — each row only decides which `ServiceCategory` is pre-selected, so
  every string is a matching anchor.
*/
const CATEGORY_HINTS: Array<{ words: string[]; category: ServiceCategory }> = [
  // i18n-data: matched against traveller-written task names
  { words: ['預約', '訂位', '代訂', '購票'], category: 'booking' },
  // i18n-data: matched against traveller-written task names
  { words: ['翻譯', '口譯', '語言'], category: 'translation' },
  // i18n-data: matched against traveller-written task names
  { words: ['陪同', '現場', '接送', '帶路'], category: 'on_site' },
  // i18n-data: matched against traveller-written task names
  { words: ['諮詢', '建議', '規劃'], category: 'consultation' },
];

const NEED_HINTS: Array<{ words: string[]; need: AssistanceNeed }> = [
  // i18n-data: matched against traveller-written task names
  { words: ['預約', '訂位', '代訂', '致電', '打電話', '聯絡'], need: 'phone_call' },
  // i18n-data: matched against traveller-written task names
  { words: ['陪同', '現場', '接送', '帶路'], need: 'on_site' },
  // i18n-data: matched against traveller-written task names
  { words: ['翻譯', '口譯'], need: 'translation' },
];

const includesAny = (text: string, words: string[]): boolean => words.some(word => text.includes(word));

export const defaultLanguageNeeds = (country?: string): string[] => {
  if (!country) return [];
  const match = Object.keys(LOCAL_LANGUAGE).find(name => country.includes(name));
  return match ? [LOCAL_LANGUAGE[match]] : [];
};

export const defaultServiceCategory = (tasks: ShoppingItem[]): ServiceCategory => {
  const text = tasks.map(task => task.name).join(' ');
  return CATEGORY_HINTS.find(hint => includesAny(text, hint.words))?.category ?? 'other';
};

export const defaultAssistanceNeeds = (tasks: ShoppingItem[]): AssistanceNeed[] => {
  const text = tasks.map(task => task.name).join(' ');
  // More than one may apply: booking a venue in Japanese is a call and a
  // translation at once, and matching later compares on both.
  const needs = NEED_HINTS.filter(hint => includesAny(text, hint.words)).map(hint => hint.need);
  return needs.length > 0 ? needs : [];
};

/**
 * A title for a request the traveller has not named.
 *
 * Built from the tasks rather than described in general terms, so a list of
 * requests stays readable without opening each one.
 *
 * DATA rather than copy, and the closest call in this file. What this returns
 * is pre-filled into the title field and published as `ServiceRequest.title`,
 * so the moment it is stored it is the traveller's own words — and it is made
 * mostly of their own words already, since `first` is a task name they typed.
 * A title that read 「代訂餐廳 等 3 項」 to the helper who accepted it and
 * "Book a restaurant and 2 more" in the list afterwards would be two titles
 * for one request.
 */
export const defaultRequestTitle = (
  // i18n-data: becomes the stored ServiceRequest.title
  tasks: ShoppingItem[], fallback = '旅行協助',
): string => {
  const first = tasks[0]?.name?.trim();
  if (!first) return fallback;
  // i18n-data: composed with a traveller-written task name into the stored title
  return tasks.length > 1 ? `${first} 等 ${tasks.length} 項` : first;
};
