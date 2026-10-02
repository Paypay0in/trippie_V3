/**
 * @vitest-environment jsdom
 *
 * 「這些列出的內容是確定要做的嗎」 — 「對 所以這些資訊是過時的 不正確」.
 *
 * Two days before flying to Busan, the entry checklist said of K-ETA: the
 * exemption for Taiwan 「至 2024 年底」, and 「由於您的旅遊日期為 2026 年，屆時
 * 可能已恢復強制要求」. Korea's own notice, dated 2025-12-23, had extended that
 * exemption to 2026-12-31. Nothing had been looked up: the model took a rule it
 * remembered, noticed the expiry had passed, and predicted forwards.
 *
 * The prompt had never told it what today was, so every answer was reasoned
 * from a training cutoff; and nothing forbade dressing a guess as advice. A
 * traveller cannot act on 「可能」, and this is the screen they act on at the
 * immigration desk.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const server = readFileSync(resolve(__dirname, '../server.ts'), 'utf8');
const prompt = server.slice(
  server.indexOf('app.post("/api/travel-rules/research"'),
  server.indexOf('RESEARCH_MODELS'),
);

describe('the entry-rules research prompt', () => {
  /**
   * The date moved into the shared preamble once it turned out twelve other
   * prompts had never had one; `promptsKnowWhatDayItIs` guards its contents.
   * This only asserts that this prompt takes it.
   */
  it('takes the shared preamble, so it knows what today is', () => {
    expect(prompt).toContain('${factsPreamble()}');
  });

  it('forbids predicting a current rule from an expired one', () => {
    expect(prompt).toContain('已到期的規定推測現在的狀態');
    // The exact shape of the K-ETA answer, named so it cannot come back.
    expect(prompt).toContain('2024 年底到期');
  });

  it('requires saying "unconfirmed" plus the official link instead of hedging', () => {
    expect(prompt).toContain('無法確認現況');
    expect(prompt).toMatch(/可能.*預計.*屆時/);
  });

  /**
   * The checklist offered 「填寫入國申報書（Arrival Card）」 as a paper form handed
   * out on the plane. Korea runs K-EAC, a free official site that takes the
   * same declaration from three days before arrival — so the traveller could
   * have finished it at home and was never told.
   */
  it('requires naming the official online system where one exists', () => {
    expect(prompt).toContain('官方線上系統');
    expect(prompt).toContain('不要只說「在飛機上填紙本」');
  });

  /**
   * The live lookup answered with a 10% refund rate and, in its own summary,
   * 「扣除手續費後實際退費額度通常在 6% 至 8% 之間」. Ten per cent is the VAT rate;
   * the traveller never sees it. A refund estimate built on it overstates the
   * money coming back.
   */
  it('refuses to pass the VAT rate off as the refund rate', () => {
    expect(prompt).toContain('實際拿得回來的比例');
    expect(prompt).toContain('高估旅客能拿到的錢');
  });

  /**
   * 「我覺得預估退稅不需如此精準 只要預估即可」.
   *
   * Demanding a precise after-fee rate pushed the answer to not_calculable,
   * which is the 「目前無法安全估算退稅金額」 card he had just complained about.
   * A conservative estimate, labelled as one, is the useful answer.
   */
  it('takes a conservative estimate rather than refusing to estimate', () => {
    expect(prompt).toContain('這個數字是概估，不需要精準');
    expect(prompt).toContain('偏保守的一端');
    expect(prompt).toContain('只有在連大概能拿回多少都說不出來時');
  });

  it('asks for rules that depend on each other to say so', () => {
    // Skipping K-ETA is exactly what makes the paper arrival card compulsory,
    // and the checklist listed both without connecting them.
    expect(prompt).toContain('連動關係');
  });
});
