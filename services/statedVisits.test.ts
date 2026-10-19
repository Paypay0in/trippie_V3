import { beforeEach, describe, expect, it } from 'vitest';
import { isStatedVisited, loadStatedVisits, saveStatedVisits, toggleStatedVisit } from './statedVisits';
import { visitLabel, visitOf, visitsByPlace } from './visitedPlaces';

/** 「下方兩個我去過了」 — and no trip in this app had ever taken him there. */
const restaurant = { placeId: 'g-123', placeName: '味贊王鹽烤肉' };
const market = { placeName: '海雲台傳統市場' };

const memory = (): Storage => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
};

describe('toggleStatedVisit', () => {
  it('marks a place under every identity it has', () => {
    const marked = toggleStatedVisit(restaurant, {}, '2026-10-19');
    expect(marked).toEqual({ 'place:g-123': '2026-10-19', 'name:味贊王鹽烤肉': '2026-10-19' });
  });

  it('takes it back', () => {
    const marked = toggleStatedVisit(restaurant, {}, '2026-10-19');
    expect(toggleStatedVisit(restaurant, marked, '2026-10-19')).toEqual({});
  });

  it('leaves other places alone', () => {
    const both = toggleStatedVisit(market, toggleStatedVisit(restaurant, {}, '2026-10-19'), '2026-10-19');
    expect(isStatedVisited(restaurant, toggleStatedVisit(market, both, '2026-10-19'))).toBe(true);
  });

  it('does nothing for a place with no identity at all', () => {
    expect(toggleStatedVisit({}, {}, '2026-10-19')).toEqual({});
  });

  /*
    The id and the name are both written, so the mark survives a record that
    only ever had one of them — the same reason the derivation indexes twice.
  */
  it('matches an unresolved copy of the same place', () => {
    const marked = toggleStatedVisit(restaurant, {}, '2026-10-19');
    expect(isStatedVisited({ placeName: '味贊王鹽烤肉' }, marked)).toBe(true);
  });
});

describe('what the traveller said, on the collection', () => {
  it('shows 已訪 on a place no trip ever visited', () => {
    const stated = toggleStatedVisit(market, {}, '2026-10-19');
    const visits = visitsByPlace([], '2026-10-19', stated);
    expect(visitOf(market, visits)).toMatchObject({ stated: true });
    // No year, because nobody said one. See `PlaceVisit.stated`.
    expect(visitLabel(visitOf(market, visits))).toBe('已訪');
  });

  it('still prefers the trip that actually went, when there was one', () => {
    const stated = toggleStatedVisit(restaurant, {}, '2026-10-19');
    const visits = visitsByPlace(
      [{ name: '釜山', itinerary: [{ id: 'i-1', date: '2026-03-22', placeId: 'g-123', title: '味贊王鹽烤肉' } as never] }],
      '2026-10-19',
      stated,
    );
    // The plan's date wins: 「去的時間」 is a day the traveller can recognise.
    expect(visitOf(restaurant, visits)).toMatchObject({ date: '2026-03-22', tripName: '釜山' });
  });
});

describe('the store', () => {
  let storage: Storage;
  beforeEach(() => { storage = memory(); });

  it('survives a round trip', () => {
    saveStatedVisits({ 'name:市場': '2026-10-19' }, storage);
    expect(loadStatedVisits(storage)).toEqual({ 'name:市場': '2026-10-19' });
  });

  it('reads nothing as nothing rather than throwing', () => {
    expect(loadStatedVisits(storage)).toEqual({});
    storage.setItem('trippie_visited_places_v1', 'not json');
    expect(loadStatedVisits(storage)).toEqual({});
    storage.setItem('trippie_visited_places_v1', '[1,2]');
    expect(loadStatedVisits(storage)).toEqual({});
  });

  it('drops entries that are not dates', () => {
    storage.setItem('trippie_visited_places_v1', JSON.stringify({ a: '2026-10-19', b: 5, c: '' }));
    expect(loadStatedVisits(storage)).toEqual({ a: '2026-10-19' });
  });
});
