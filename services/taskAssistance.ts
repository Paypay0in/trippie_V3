import { ShoppingItem } from '../types';

/**
 * Which to-dos are worth a person's time.
 *
 * Three kinds of task sit in the same checklist and they are not the same job:
 *
 *  - `app`      Trippie can answer it — opening hours, an official site, a
 *               lookup the trip screen already resolves.
 *  - `self`     Only the traveller can do it: an official form in their own
 *               name, a visa application, a health declaration.
 *  - `human`    Worth handing to someone there — phoning a shop in Japanese,
 *               chasing several businesses, confirming an unusual requirement.
 *
 * Only `human` may be published as a service request, and the decision is made
 * from fields the app already holds, never by a model. A model that misreads
 * 「確認開場日期」 as human work turns a free lookup into a paid errand; one
 * that misreads a booking call as an app lookup silently removes the only
 * option that would have worked. Both failures are invisible to the person
 * reading the list, so neither is the model's to make.
 *
 * When the signals disagree the answer is `human` — that only offers a button,
 * which the traveller is free to ignore. Guessing the other way takes the
 * choice away.
 */

export type AssistanceCategory = 'app' | 'self' | 'human';

/** Formalities the traveller completes in their own name. */
const SELF_ONLY_ACTIONS = new Set([
  'visa_or_eta',
  'passport_validity',
  'health_declaration',
  'customs_declaration',
  'arrival_form',
  'required_documents',
  'onward_travel',
]);

/** Verbs that describe reading something off a page. */
const LOOKUP_VERBS = ['查詢', '確認', '查看', '了解', '比較', '搜尋'];

/** Verbs that describe dealing with a person or a business. */
const HUMAN_VERBS = ['預約', '訂位', '聯絡', '致電', '打電話', '洽詢', '安排', '代訂', '協助', '翻譯', '陪同'];

const includesAny = (text: string, needles: string[]): boolean =>
  needles.some(needle => text.includes(needle));

export const classifyTask = (
  task: ShoppingItem,
  context: { hasResolvedVenue?: boolean } = {},
): AssistanceCategory => {
  const name = task.name || '';

  // An official formality is the traveller's own to file, whoever helps them
  // find the page.
  if (SELF_ONLY_ACTIONS.has(task.travelRuleActionType ?? '')) return 'self';

  // Booking, phoning, arranging: a person on the other end, so a person can
  // take it on — even when the venue's own site is already linked, because a
  // link is not the same as the reservation being made.
  if (includesAny(name, HUMAN_VERBS)) return 'human';

  // A pure lookup whose venue the map service already resolved is answered on
  // the card itself; sending it to a helper would be asking someone to read a
  // page that is one tap away.
  if (context.hasResolvedVenue && includesAny(name, LOOKUP_VERBS)) return 'app';

  return 'human';
};

/** The tasks a traveller may put into a help request. */
export const eligibleForHumanHelp = (
  tasks: ShoppingItem[],
  resolvedVenueNames: Set<string> = new Set(),
): ShoppingItem[] =>
  tasks.filter(
    task => classifyTask(task, { hasResolvedVenue: resolvedVenueNames.has(task.name) }) === 'human',
  );
