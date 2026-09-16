import { Category, Phase } from '../types';
import { CATEGORIES_BY_PHASE } from '../constants';

/**
 * Categories a traveller adds for themselves.
 *
 * The built-in list covers what most trips need and will never cover what any
 * particular trip needs — 溫泉, 潛水裝備, 寵物寄宿. A category the app refuses
 * to hold ends up as 其他, and the settlement report then says a third of the
 * trip went on "other", which helps nobody.
 *
 * Stored per stage, because that is how the picker is organised: a category
 * invented while recording lunch belongs with the 旅行中 list, not with 簽證.
 */

export const CUSTOM_CATEGORIES_STORAGE_KEY = 'trippie_custom_categories_v1';

export type CustomCategories = Partial<Record<Phase, string[]>>;

const MAX_LENGTH = 12;

const builtInFor = (phase: Phase): string[] =>
  (CATEGORIES_BY_PHASE[phase] ?? []).map(category => String(category));

/** Trimmed, length-capped, and rejected when it is blank or already offered. */
export const normalizeCategoryName = (
  value: string,
  phase: Phase,
  existing: string[],
): string | null => {
  const name = (value || '').trim().slice(0, MAX_LENGTH);
  if (!name) return null;
  const taken = new Set([...builtInFor(phase), ...existing]);
  return taken.has(name) ? null : name;
};

export const addCustomCategory = (
  current: CustomCategories,
  phase: Phase,
  value: string,
): CustomCategories => {
  const existing = current[phase] ?? [];
  const name = normalizeCategoryName(value, phase, existing);
  if (!name) return current;
  return { ...current, [phase]: [...existing, name] };
};

export const removeCustomCategory = (
  current: CustomCategories,
  phase: Phase,
  value: string,
): CustomCategories => ({
  ...current,
  [phase]: (current[phase] ?? []).filter(name => name !== value),
});

/** What the picker shows: the built-ins first, then this traveller's own. */
export const categoriesForPhase = (
  phase: Phase,
  custom: CustomCategories,
): Category[] => [
  ...(CATEGORIES_BY_PHASE[phase] ?? []),
  ...((custom[phase] ?? []) as unknown as Category[]),
];

export const loadCustomCategories = (): CustomCategories => {
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CustomCategories;
    if (!parsed || typeof parsed !== 'object') return {};
    // Anything not a list of strings is dropped rather than trusted: this feeds
    // the category picker, and a malformed entry would render as blank buttons.
    const clean: CustomCategories = {};
    (Object.keys(parsed) as Phase[]).forEach(phase => {
      const names = parsed[phase];
      if (Array.isArray(names)) {
        clean[phase] = names.filter(name => typeof name === 'string' && name.trim()).map(name => name.trim());
      }
    });
    return clean;
  } catch {
    return {};
  }
};

export const saveCustomCategories = (value: CustomCategories) => {
  try {
    localStorage.setItem(CUSTOM_CATEGORIES_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // A full or blocked store must not stop someone recording an expense.
  }
};
