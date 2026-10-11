import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { drivingPreparationFor } from './drivingDocuments';
import { DEFAULT_BRIEF, TripPlanBrief } from './tripPlanBrief';

/**
 * 「當我表單中勾選開車 是不是成立旅程的時候 提醒事項就要有要換台灣的駕照日譯本」.
 *
 * The translation is issued in Taiwan, so a reminder that arrives after
 * departure is a reminder about something that can no longer be done.
 */

const brief = (transport: TripPlanBrief['transport']): TripPlanBrief =>
  ({ ...DEFAULT_BRIEF, transport });

describe('when driving was ticked', () => {
  it('names the Japanese translation for a trip to Japan', () => {
    const need = drivingPreparationFor(brief(['drive']), '日本沖繩')!;
    expect(need.item).toContain('日文譯本');
    expect(need.specific).toBe(true);
  });

  it('finds Japan however the destination was typed', () => {
    for (const destination of ['日本 東京', '日本', 'Japan', 'japan okinawa']) {
      expect(drivingPreparationFor(brief(['drive']), destination)!.specific).toBe(true);
    }
  });

  /**
   * Most countries are not in the table and must not be answered as if they
   * were. Driving on the wrong paperwork is uninsured at best.
   */
  it('sends the traveller to check for a country nobody has verified', () => {
    const need = drivingPreparationFor(brief(['drive']), '韓國 釜山')!;
    expect(need.specific).toBe(false);
    expect(need.item).toContain('確認在韓國 釜山開車需要的駕照文件');
    expect(need.item).not.toContain('國際駕照');
    expect(need.item).not.toContain('日文譯本');
  });

  it('still says something useful with no destination', () => {
    expect(drivingPreparationFor(brief(['drive']), '')!.item)
      .toContain('確認在目的地開車需要的駕照文件');
  });

  /** It has to be arranged before leaving, and the item says so. */
  it('says to do it before departure', () => {
    expect(drivingPreparationFor(brief(['drive']), '日本')!.item).toContain('出國前');
    expect(drivingPreparationFor(brief(['drive']), '韓國')!.item).toContain('出國前');
  });
});

describe('when driving was not ticked', () => {
  /**
   * A preparation list that fills itself with things nobody asked for is a
   * list people stop reading — and then the item that mattered is in it too.
   */
  it('adds nothing', () => {
    expect(drivingPreparationFor(brief(['walk', 'transit']), '日本沖繩')).toBeNull();
    expect(drivingPreparationFor(brief([]), '日本沖繩')).toBeNull();
  });

  it('adds nothing when there was no form at all', () => {
    expect(drivingPreparationFor(null, '日本沖繩')).toBeNull();
    expect(drivingPreparationFor(undefined, '日本沖繩')).toBeNull();
  });
});

/**
 * The reminder has to be seeded onto the trip, not merely computable.
 *
 * And after the trip exists: a preparation item added before the new trip is
 * the active one lands on whichever trip was open a moment ago — the mistake
 * this night already found once, in the flights.
 */
describe('where it is seeded', () => {
  const APP = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');

  it('is added when a trip is created from the form', () => {
    const start = APP.indexOf('const handleGenerateFromBrief');
    expect(start).toBeGreaterThan(-1);
    const body = APP.slice(start, start + 1400);
    expect(body).toContain('drivingPreparationFor(brief, setup.destination)');
    expect(body).toContain('handleBatchAddShoppingItems');
  });

  it('waits until the trip has been created', () => {
    const start = APP.indexOf('const handleGenerateFromBrief');
    const body = APP.slice(start, start + 1400);
    const added = body.indexOf('handleBatchAddShoppingItems');
    const created = body.indexOf('.then(');
    expect(created).toBeGreaterThan(-1);
    expect(added).toBeGreaterThan(created);
  });
});
