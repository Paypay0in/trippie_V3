import { describe, expect, it } from 'vitest';
import { isEmptied, loadEmptiedSlots, saveEmptiedSlots, toggleEmptied } from './emptiedSlots';

/**
 * 「要有『無』的選項」.
 *
 * A gap nobody has chosen for and a gap decided against look identical in an
 * itinerary, so this is recorded rather than derived.
 */
const store = (): Storage => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => { data.clear(); },
    key: () => null,
    length: 0,
  } as unknown as Storage;
};

describe('emptiedSlots', () => {
  it('remembers a block said to be empty', () => {
    const shelf = store();
    saveEmptiedSlots(toggleEmptied([], '2026-10-21#2'), shelf);

    expect(isEmptied(loadEmptiedSlots(shelf), '2026-10-21#2')).toBe(true);
  });

  /* A traveller is allowed to change their mind about lunch. */
  it('takes it back', () => {
    const marked = toggleEmptied([], '2026-10-21#2');

    expect(toggleEmptied(marked, '2026-10-21#2')).toEqual([]);
  });

  it('says nothing about the blocks it was not told about', () => {
    expect(isEmptied(toggleEmptied([], '2026-10-21#2'), '2026-10-21#4')).toBe(false);
  });

  it('survives a key that is not a list', () => {
    const shelf = store();
    shelf.setItem('trippie_emptied_slots_v1', '{"nope":1}');

    expect(loadEmptiedSlots(shelf)).toEqual([]);
  });

  it('is empty before anything is said', () => {
    expect(loadEmptiedSlots(store())).toEqual([]);
  });
});
