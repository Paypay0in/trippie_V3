/**
 * The 入境規定 button told the traveller 「Travel rules research is unavailable.」
 * and nothing else — in English, with no reason, on a screen where the only
 * available action was to press it again. The cause was the daily free-tier
 * quota, which is metered per model per day, while both the grounded call and
 * its own fallback named the same model.
 *
 * The chain that fixes it lives on the server. What this pins is the other
 * half: whatever the server says must reach the person looking at the button.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { researchTravelRules, TravelRulesRequestError } from '../services/travelRulesService';

const respondWith = (status: number, body: unknown) => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response)));
};

const input = { destination: '韓國', passportCountryCode: 'TW' };

afterEach(() => vi.unstubAllGlobals());

describe('travel rules research', () => {
  it('carries the quota message through, in the words the server chose', async () => {
    respondWith(429, { error: '今日 AI 查詢額度已用完，明天會恢復。你仍可以手動建立入境待辦。' });

    await expect(researchTravelRules(input)).rejects.toMatchObject({
      name: 'TravelRulesRequestError',
      status: 429,
      message: '今日 AI 查詢額度已用完，明天會恢復。你仍可以手動建立入境待辦。',
    });
  });

  it('never invents an explanation when the server gave none', async () => {
    respondWith(502, {});

    const failure = await researchTravelRules(input).catch(error => error);
    expect(failure).toBeInstanceOf(TravelRulesRequestError);
    expect(failure.status).toBe(502);
  });

  it('returns the researched rules when the call succeeds', async () => {
    respondWith(200, {
      travelRules: {
        destination: '韓國',
        researchMode: 'model_knowledge',
        entry: {
          summary: '持台灣護照前往韓國旅遊。',
          actionableItems: [
            { actionType: 'visa_or_eta', title: 'K-ETA (韓國電子旅行許可)' },
            { actionType: 'passport_validity', title: '護照效期確認' },
          ],
          sources: [],
        },
      },
    });

    const rules = await researchTravelRules(input);
    expect(rules.entry?.actionableItems?.map(item => item.actionType)).toEqual(['visa_or_eta', 'passport_validity']);
  });
});
