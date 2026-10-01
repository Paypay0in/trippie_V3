/**
 * @vitest-environment node
 *
 * 「我們不能每次都這樣修 所以之後應該怎麼做一次產出就要是正確的」.
 *
 * Two failures in one night had the same shape. The entry checklist said the
 * K-ETA exemption ran 「至 2024 年底」 and that 「由於您的旅遊日期為 2026 年，屆時
 * 可能已恢復強制要求」; Korea had extended it to 2026-12-31 a year earlier. The
 * itinerary planner offered 「廣安里海景早午餐咖啡廳」, a description wearing a
 * shop's clothes. Neither had looked anything up. Both reasoned from a training
 * cutoff and handed the uncertainty to the traveller as 「可能」.
 *
 * The first was fixed by editing one prompt — of thirteen that ask a model a
 * question, and the only one that knew what day it was. Fixing prompts one
 * incident at a time is how the other twelve wait their turn.
 *
 * So the rule lives in one function, and this fails when a call site that
 * speaks about the world forgets to use it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const server = readFileSync(resolve(__dirname, '../server.ts'), 'utf8');

/**
 * Prompts that tell the traveller something about the real world — rules,
 * places, prices, opening hours. Parsing a receipt they are holding is not one
 * of these: nothing there can be stale.
 */
const WORLD_FACING_PROMPTS = [
  '研究目前旅遊規定：',
  '從這篇旅行貼文找出可重複使用的旅行實體',
  '一位旅人正在規劃',
  '以下是一趟旅程的資料，最後一行是使用者實際提出的問題或情況：',
  '使用者這趟旅程「已經有正式行程」了。',
  '為這趟旅程安排一份行程提案。',
];

describe('the shared preamble', () => {
  it('states the date, bans reasoning from expired memory, and bans hedging', () => {
    expect(server).toContain('const factsPreamble =');
    const body = server.slice(server.indexOf('const factsPreamble ='), server.indexOf('const factsPreamble =') + 600);

    expect(body).toContain('今天是 ${new Date().toISOString().slice(0, 10)}');
    expect(body).toContain('已經到期的資訊推測現在的狀態');
    expect(body).toContain('無法確認');
    // The four words that handed tonight's uncertainty back to the traveller.
    for (const hedge of ['可能', '預計', '屆時', '應該']) {
      expect(body).toContain(hedge);
    }
  });

  it('is used by every prompt that speaks about the world', () => {
    const missing = WORLD_FACING_PROMPTS.filter(prompt => {
      const at = server.indexOf(prompt);
      if (at < 0) return false; // Prompt reworded; the name check below catches that.
      // The preamble has to be the opening of that same template literal.
      return !server.slice(Math.max(0, at - 40), at).includes('${factsPreamble()}');
    });

    expect(missing).toEqual([]);
  });

  it('still recognises every prompt it is meant to guard', () => {
    const vanished = WORLD_FACING_PROMPTS.filter(prompt => !server.includes(prompt));

    // A reworded prompt is fine; silently dropping it from this list is not.
    expect(vanished).toEqual([]);
  });
});
