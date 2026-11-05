/**
 * `/api/places/details` must not ask Google for a phone number or a website.
 *
 * Google bills a Place Details request at the most expensive tier any single
 * field in the mask belongs to. `nationalPhoneNumber`,
 * `internationalPhoneNumber` and `websiteUri` are Enterprise — $20/1000 with
 * 1,000 free calls a month — while the rest of this mask tops out at
 * `primaryType`, which is Pro at $17/1000 with 5,000 free.
 *
 * Three of the four callers (`resolvePlace`, used by the trip screen, the
 * inspiration planner and the screenshot intake) never rendered either value,
 * so every place anybody added was bought at the Enterprise rate for two
 * fields nothing read. The fourth, the stay sheet, did show a dial and a
 * website button; the Founder's answer on 2026-11-05 was to drop both and let
 * the traveller reach them through Google's own page, which the 「在地圖上查看」
 * link on that card already opens.
 *
 * Asserted against the source rather than a live call because the mask is a
 * string in a header: it is invisible in any response, and a well-meant edit
 * that re-adds one field quadruples a bill nobody is watching. `googleMapsUri`
 * is asserted present for the same reason — it is now the only route to the
 * number, so losing it silently would remove the capability rather than move
 * it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'server.ts'), 'utf8');

/** The details endpoint's body, from its route to the one that follows it. */
const detailsEndpoint = (): string => {
  const start = source.indexOf('app.post("/api/places/details"');
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf('app.post(', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

/**
 * The mask literal alone, not the comment above it.
 *
 * Read off the header rather than the whole endpoint on purpose: the comment
 * explaining this rule has to be able to name the fields it forbids, and a
 * substring check over the endpoint body made that comment fail its own test.
 */
const fieldMask = (): string => {
  const match = /"X-Goog-FieldMask":\s*"([^"]+)"/.exec(detailsEndpoint());
  expect(match).not.toBeNull();
  return match![1];
};

describe('the place details field mask', () => {
  it('asks for no phone number', () => {
    const mask = fieldMask();
    expect(mask).not.toContain('nationalPhoneNumber');
    expect(mask).not.toContain('internationalPhoneNumber');
  });

  it('asks for no website', () => {
    expect(fieldMask()).not.toContain('websiteUri');
  });

  it('still asks for the Google Maps link, which is how the number is reached', () => {
    expect(fieldMask()).toContain('googleMapsUri');
  });

  it('returns neither value, so no caller can start depending on one again', () => {
    const body = detailsEndpoint();
    expect(body).not.toMatch(/^\s*phone:/m);
    expect(body).not.toMatch(/^\s*website:/m);
  });
});
