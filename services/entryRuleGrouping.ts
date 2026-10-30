import type { ShoppingItem } from '../types';

/**
 * Whether a travel-rule row belongs under 注意事項 rather than 入境規定.
 *
 * Passport validity is the one travel-rule row that is not a formality the
 * destination asks you to complete. It is a condition your own document has to
 * meet before you leave, so it reads as a caution and is rendered with the
 * cautions.
 *
 * The decision is made on `travelRuleActionType`, the structured field the
 * entry-rules lookup already fills in (`App.tsx` writes it, `tripPersistence`
 * keeps it, `taskAssistance` already classifies by it). It used to be made on
 * `task.name.includes('護照')` — a substring of display text written by a
 * language model.
 *
 * That mattered the moment the model started answering in the traveller's own
 * language: an English answer titles the row "Passport validity", the
 * substring misses, and the row silently moves from the cautions into the list
 * of things you must do before you fly. Nothing errors. The checklist just
 * tells somebody the wrong thing two days before a flight.
 *
 * One rule, one home — the same correction made to the diary check and the
 * refund description earlier today.
 */

/**
 * Titles from before `travelRuleActionType` existed.
 *
 * Those rows are already on travellers' devices, with no structured field to
 * read, so the old substring survives as a fallback. Both languages, because
 * a row researched after the model switched languages but before this fix
 * could be in either. It is consulted ONLY when the structured field is
 * absent: a visa rule whose title mentions a passport is still a visa rule.
 */
// i18n-data: regex anchors matched against task names already on devices.
const LEGACY_PASSPORT_TITLES = [/護照/, /passport/i];

export const isPassportAdvisory = (task: ShoppingItem): boolean => {
  if (task.travelRuleActionType) {
    return task.travelRuleActionType === 'passport_validity';
  }
  return LEGACY_PASSPORT_TITLES.some(pattern => pattern.test(task.name));
};
