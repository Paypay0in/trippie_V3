/**
 * The twenty-second re-read stops downloading every photo on the trip.
 *
 * Measured on the Founder's project, 2026-11-05: **0.04 GB** of database,
 * **7.33 GB** of egress over thirty days. The database was not big; it was
 * fetched about a hundred and eighty times, because `useTripSync` re-reads on
 * a twenty-second timer with `select('*')` and two of those columns hold
 * base64 images. One tab, open for an hour, on one trip.
 *
 * At one traveller that is a free-tier warning with a date on it. At the ten
 * thousand planned for December it is the biggest line in a bill nobody had
 * counted — and it was missing from every estimate I gave him.
 *
 * Two things are pinned here, and the second is the one that would rot in
 * silence:
 *
 *  1. A light row says **nothing** about photos, and must never be read as
 *     「no photos」. This repo already paid for that confusion once —
 *     「為什麼我點進去 上傳照片馬上就被刪掉了」.
 *  2. The hand-written column list cannot drift from the row interfaces.
 *     PostgREST has no 「everything but」, so the list is a second home for the
 *     row's shape, and a column added to one and not the other would be
 *     dropped from every re-read and then merged over the local copy.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { restoreExpensePhotos, restoreItineraryPhotos } from './syncHeavyFields';
import { Expense, ItineraryItem } from '../types';

const item = (id: string, photos?: string[]): ItineraryItem => ({
  id, date: '2026-12-01', time: '09:00', title: '新莊廟街', type: 'SIGHTSEEING',
  ...(photos ? { photos } : {}),
} as unknown as ItineraryItem);

const expense = (id: string, receiptPhotos?: string[]): Expense => ({
  id, description: '午餐', amount: 300, currency: 'TWD',
  ...(receiptPhotos ? { receiptPhotos } : {}),
} as unknown as Expense);

describe('re-joining a light row to the photos this device holds', () => {
  it('keeps the photos the light read did not ask about', () => {
    const light = [item('a'), item('b')];
    const held = [item('a', ['data:image/jpeg;base64,AAA']), item('b', [])];

    const { rows, unknownIds } = restoreItineraryPhotos(light, held);
    expect(rows[0].photos).toEqual(['data:image/jpeg;base64,AAA']);
    expect(rows[1].photos).toEqual([]);
    expect(unknownIds).toEqual([]);
  });

  it('does the same for receipt images', () => {
    const { rows } = restoreExpensePhotos([expense('e1')], [expense('e1', ['data:image/jpeg;base64,BBB'])]);
    expect(rows[0].receiptPhotos).toEqual(['data:image/jpeg;base64,BBB']);
  });

  it('names rows it has never held instead of calling them photoless', () => {
    /*
      A stop added on the other traveller's phone. Its photos are unknown, not
      absent — and the difference is somebody's pictures. The caller fetches
      these rows whole rather than publishing them empty.
    */
    const { rows, unknownIds } = restoreItineraryPhotos([item('a'), item('new')], [item('a', ['x'])]);
    expect(unknownIds).toEqual(['new']);
    expect(rows[0].photos).toEqual(['x']);
  });

  it('overwrites a light row even when the held copy has none', () => {
    // The light value carries no information at all, so the local copy wins
    // unconditionally — including when the local answer is 「none」.
    const { rows } = restoreItineraryPhotos([item('a', ['stale'])], [item('a')]);
    expect(rows[0].photos).toBeUndefined();
  });
});

describe('the light column list', () => {
  const sync = readFileSync(join(process.cwd(), 'services/tripSync.ts'), 'utf8');
  const mapping = readFileSync(join(process.cwd(), 'services/tripSyncMapping.ts'), 'utf8');

  const listed = (constName: string): string[] => {
    const match = new RegExp(`const ${constName} = "([^"]+)"`).exec(sync);
    expect(match, `${constName} not found in tripSync.ts`).not.toBeNull();
    return match![1].split(',');
  };

  const rowFields = (interfaceName: string): string[] => {
    const body = new RegExp(`interface ${interfaceName}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(mapping);
    expect(body, `${interfaceName} not found`).not.toBeNull();
    return [...body![1].matchAll(/^\s*([a-z_]+)\??\s*:/gm)].map(m => m[1]);
  };

  it('covers every expense column except the images', () => {
    expect(listed('EXPENSE_COLUMNS_WITHOUT_IMAGES').sort())
      .toEqual(rowFields('ExpenseRow').filter(field => field !== 'receipt_photos').sort());
  });

  it('covers every itinerary column except the images', () => {
    expect(listed('ITINERARY_COLUMNS_WITHOUT_IMAGES').sort())
      .toEqual(rowFields('ItineraryItemRow').filter(field => field !== 'photos').sort());
  });

  it('leaves the image columns out', () => {
    expect(listed('EXPENSE_COLUMNS_WITHOUT_IMAGES')).not.toContain('receipt_photos');
    expect(listed('ITINERARY_COLUMNS_WITHOUT_IMAGES')).not.toContain('photos');
  });
});

describe('who reads light and who reads whole', () => {
  const hook = readFileSync(join(process.cwd(), 'hooks/useTripSync.ts'), 'utf8');

  it('asks the periodic re-read to omit images', () => {
    expect(hook).toContain("fetchTripSnapshot(tripId, { omitImages: true })");
  });

  it('restores the held photos before anything is merged', () => {
    const rereadStart = hook.indexOf("fetchTripSnapshot(tripId, { omitImages: true })");
    const mergeStart = hook.indexOf('mergeWithUnpushed', rereadStart);
    const between = hook.slice(rereadStart, mergeStart);
    expect(between).toContain('restoreItineraryPhotos');
    expect(between).toContain('restoreExpensePhotos');
  });

  it('still reads the first snapshot whole', () => {
    // A device that has never seen the trip has nothing to re-join to.
    expect(hook).toMatch(/fetchTripSnapshot\(tripId\)/);
  });
});
