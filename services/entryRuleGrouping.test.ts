import { describe, expect, it } from 'vitest';

import { isPassportAdvisory } from './entryRuleGrouping';
import type { ShoppingItem } from '../types';

/**
 * Which travel-rule row is a caution rather than a formality.
 *
 * Passport validity is a condition your own document has to meet before you
 * leave, not something the destination asks you to do on arrival, so it is
 * rendered under 注意事項 instead of 入境規定.
 *
 * It used to be decided by `task.name.includes('護照')` — a substring of
 * display text written by a language model. Now that the model answers in the
 * traveller's own language (CLB-20261028-013), an English answer says
 * "Passport validity" and that test fails silently: a required-looking caution
 * appears in the formalities list, and the cautions list loses it.
 */

const task = (overrides: Partial<ShoppingItem>): ShoppingItem =>
  ({
    id: 't1',
    name: '護照效期',
    quantity: 1,
    isPurchased: false,
    phase: 'pre',
    sourceType: 'travel_rules',
    ...overrides,
  }) as ShoppingItem;

describe('isPassportAdvisory', () => {
  it('reads the structured action type, whatever language the title is in', () => {
    expect(
      isPassportAdvisory(
        task({ name: 'Passport validity', travelRuleActionType: 'passport_validity' }),
      ),
    ).toBe(true);
  });

  it('leaves every other formality in the entry-rules list', () => {
    expect(
      isPassportAdvisory(task({ name: 'K-ETA', travelRuleActionType: 'visa_or_eta' })),
    ).toBe(false);
    expect(
      isPassportAdvisory(
        task({ name: 'Arrival card', travelRuleActionType: 'arrival_form' }),
      ),
    ).toBe(false);
  });

  it('still recognises rows written before the action type existed', () => {
    // Rows researched by an earlier release carry a Chinese title and no
    // action type. They are already on travellers' devices, so the old
    // substring stays as a fallback — never as the primary test.
    expect(isPassportAdvisory(task({ name: '護照效期是否足夠' }))).toBe(true);
    expect(isPassportAdvisory(task({ name: '入境卡' }))).toBe(false);
  });

  it('does not let the fallback override the structured field', () => {
    // A visa rule whose title happens to mention a passport is still a visa
    // rule. The substring is the last resort, not a second opinion.
    expect(
      isPassportAdvisory(
        task({ name: '申請簽證需備護照', travelRuleActionType: 'visa_or_eta' }),
      ),
    ).toBe(false);
  });

  it('recognises an English legacy row by its own word', () => {
    expect(isPassportAdvisory(task({ name: 'Passport must be valid 6 months' }))).toBe(true);
  });
});
