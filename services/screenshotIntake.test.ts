import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENSHOT_KINDS, normalizeScreenshotKind, routeFor } from './screenshotKind';
import { readScreenshot } from './screenshotIntake';

/**
 * 「旅行靈感的截圖、租車或是訂了什麼旅遊票的截圖都可以上傳上來」.
 *
 * One entry, five parsers behind it. The thing worth guarding is not that a
 * picture is read — it is that it reaches the parser written for it. A hire
 * routed to the itinerary parser comes back as a line of text, and the dates
 * the planner needs are gone without anything reporting a failure.
 */

const ok = (body: unknown) => ({
  ok: true,
  json: () => Promise.resolve(body),
}) as unknown as Response;

const calls: string[] = [];

/** Answers the classify call with `kind`, then whatever the parser returns. */
const stub = (kind: string, parsed: unknown) => {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    calls.push(url);
    return Promise.resolve(url === '/api/screenshots/kind' ? ok({ kind }) : ok(parsed));
  }));
};

afterEach(() => vi.unstubAllGlobals());

describe('a screenshot reaches the parser written for it', () => {
  it('sends a hire to the rental parser, with its dates intact', async () => {
    stub('rental', {
      company: 'OTS レンタカー',
      pickUpDate: '2026-11-02',
      dropOffDate: '2026-11-04',
    });

    const result = await readScreenshot({ base64Data: 'x', mimeType: 'image/jpeg' });

    expect(calls).toEqual(['/api/screenshots/kind', '/api/rentals/parse-image']);
    expect(result.kind).toBe('rental');
    // The reason routing matters at all: a slice has nowhere to put these.
    if (!('rental' in result)) throw new Error('unreachable');
    expect(result.rental.pickUpDate).toBe('2026-11-02');
    expect(result.rental.dropOffDate).toBe('2026-11-04');
  });

  it('sends anything else to the itinerary parser', async () => {
    stub('inspiration', { slices: [{ type: 'food', title: '暖暮拉麵' }] });

    const result = await readScreenshot({ base64Data: 'x', destination: '沖繩' });

    expect(calls).toEqual(['/api/screenshots/kind', '/api/itinerary/parse-image']);
    expect(result.kind).toBe('inspiration');
  });

  /**
   * The destination is what keeps a saved post about Tokyo out of an Okinawa
   * trip, and the itinerary route is the only one that takes it.
   */
  it('tells the itinerary parser where the trip is', async () => {
    const sent: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      sent.push(String(init?.body));
      return Promise.resolve(url === '/api/screenshots/kind'
        ? ok({ kind: 'inspiration' })
        : ok({ slices: [{ type: 'place', title: '美麗海水族館' }] }));
    }));

    await readScreenshot({ base64Data: 'x', destination: '沖繩', destinationCountry: '日本' });

    expect(sent[1]).toContain('沖繩');
    // The classify call does not need it and is not given it.
    expect(sent[0]).not.toContain('沖繩');
  });

  /**
   * 「這張截圖讀不出完整的訂單」 rather than a hire with no company.
   *
   * `normalizeParsedRental` returns null on purpose for exactly this, and
   * passing that null through as a booking would put an unnamed car on the
   * trip — the confidently-wrong record that refusal exists to prevent.
   */
  it('refuses a booking it could not read, rather than filing an empty one', async () => {
    stub('rental', { pickUpDate: '2026-11-02' });
    await expect(readScreenshot({ base64Data: 'x' })).rejects.toThrow('讀不出完整的訂單');
  });

  it('says so when a picture has nothing to plan from', async () => {
    stub('inspiration', { slices: [] });
    await expect(readScreenshot({ base64Data: 'x' })).rejects.toThrow('換一張再試試');
  });

  /** The server words its failures; replacing them hides whether to retry. */
  it('surfaces the server message as written', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ error: '辨識服務忙碌中，請稍後再試。' }),
    } as unknown as Response)));

    await expect(readScreenshot({ base64Data: 'x' })).rejects.toThrow('辨識服務忙碌中');
  });
});

/**
 * An unreadable answer goes to the parser that knows how to say no.
 *
 * The booking parsers will produce a confident hire from a photo of a menu;
 * the itinerary one returns 「看不出可以排進行程的地點」. Guessing towards the
 * parser that can refuse is the cheap mistake.
 */
describe('an answer nobody understands', () => {
  it('falls back to inspiration rather than failing', () => {
    expect(normalizeScreenshotKind('車子')).toBe('inspiration');
    expect(normalizeScreenshotKind(undefined)).toBe('inspiration');
    expect(normalizeScreenshotKind('')).toBe('inspiration');
  });

  it('keeps the kinds it does understand', () => {
    for (const kind of SCREENSHOT_KINDS) {
      expect(normalizeScreenshotKind(kind)).toBe(kind);
      expect(normalizeScreenshotKind(` ${kind.toUpperCase()} `)).toBe(kind);
    }
  });

  /** Every kind must reach a route, or classification routes into nothing. */
  it('has an endpoint for every kind', () => {
    for (const kind of SCREENSHOT_KINDS) {
      expect(routeFor(kind).endpoint).toMatch(/^\/api\//);
    }
  });
});

/**
 * The route exists on the server, with the body limit the picture needs.
 *
 * A 12mb allowance is granted route by route on purpose — see the catalogue
 * test that lists them. This checks the other half: that the route this
 * service posts to is actually registered.
 */
describe('the server answers it', () => {
  const SERVER = readFileSync(resolve(__dirname, '../server.ts'), 'utf8');

  it('registers the classify route', () => {
    expect(SERVER).toContain('app.post("/api/screenshots/kind", express.json({ limit: "12mb" })');
  });

  /** The five parsers are untouched; the point of classifying first. */
  it('leaves the parsers it routes to alone', () => {
    for (const kind of SCREENSHOT_KINDS) {
      expect(SERVER).toContain(`app.post("${routeFor(kind).endpoint}"`);
    }
  });
});
