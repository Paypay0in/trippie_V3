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

/** The language someone would need to speak locally. Only where it is unambiguous. */
const LOCAL_LANGUAGE: Record<string, string> = {
  日本: '日文',
  韓國: '韓文',
  南韓: '韓文',
  泰國: '泰文',
  越南: '越南文',
  法國: '法文',
  德國: '德文',
  西班牙: '西班牙文',
  義大利: '義大利文',
};

const CATEGORY_HINTS: Array<{ words: string[]; category: ServiceCategory }> = [
  { words: ['預約', '訂位', '代訂', '購票'], category: 'booking' },
  { words: ['翻譯', '口譯', '語言'], category: 'translation' },
  { words: ['陪同', '現場', '接送', '帶路'], category: 'on_site' },
  { words: ['諮詢', '建議', '規劃'], category: 'consultation' },
];

const NEED_HINTS: Array<{ words: string[]; need: AssistanceNeed }> = [
  { words: ['預約', '訂位', '代訂', '致電', '打電話', '聯絡'], need: 'phone_call' },
  { words: ['陪同', '現場', '接送', '帶路'], need: 'on_site' },
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
 */
export const defaultRequestTitle = (tasks: ShoppingItem[], fallback = '旅行協助'): string => {
  const first = tasks[0]?.name?.trim();
  if (!first) return fallback;
  return tasks.length > 1 ? `${first} 等 ${tasks.length} 項` : first;
};
