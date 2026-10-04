import { describe, expect, it } from 'vitest';
import { findMisplacedPlaces, withoutPlaceIdentity } from './misplacedPlaces';

/**
 * 「錯的就刪了（但要用戶知道）」.
 *
 * 다고소님 resolved to Danyang-gun in 忠清北道 — 200km from Busan and from every
 * other place on the list. The name came off a screenshot that misread 단골손님,
 * so the search had nothing real to find, Google answered with its best guess,
 * and the pick bound it.
 */

const place = (id: string, latitude?: number, longitude?: number) =>
  ({ id, placeName: id, latitude, longitude });

/** The real trip: four on 廣安里, two at 海雲台, one out in 機張. */
const busan = [
  place('nasari', 35.1535, 129.1190),
  place('dongmyeon', 35.1532, 129.1183),
  place('working', 35.1529, 129.1181),
  place('diart', 35.1588, 129.1983),
  place('photowave', 35.1590, 129.1985),
  place('peak', 35.2443, 129.2229),
];

/** Danyang, 忠清北道 — where 다고소님 was bound. */
const danyang = place('dagoso', 36.9846, 128.3655);

describe('findMisplacedPlaces', () => {
  it('finds the place two hundred kilometres from the rest', () => {
    const found = findMisplacedPlaces([...busan, danyang]);

    expect(found.map(entry => entry.place.id)).toEqual(['dagoso']);
    expect(found[0].distanceFromTripKm).toBeGreaterThan(150);
  });

  it('leaves a genuine day trip alone', () => {
    // 機張 is 12km up the coast from 海雲台 and is a real place to spend a day.
    expect(findMisplacedPlaces(busan)).toEqual([]);
  });

  it('says nothing with too little to compare against', () => {
    // With two places there is no way to tell which one is the outlier, and
    // guessing unbinds the right one half the time.
    expect(findMisplacedPlaces([busan[0], danyang])).toEqual([]);
  });

  it('ignores a place that was never bound to anywhere', () => {
    const found = findMisplacedPlaces([...busan, place('unbound')]);

    expect(found).toEqual([]);
  });

  it('flags every outlier, not just the first', () => {
    const jeju = place('jeju', 33.4996, 126.5312);
    const found = findMisplacedPlaces([...busan, danyang, jeju]);

    expect(found.map(entry => entry.place.id).sort()).toEqual(['dagoso', 'jeju']);
  });
});

describe('withoutPlaceIdentity', () => {
  it('clears the binding and keeps what the traveller saved', () => {
    const saved = {
      id: 'i-1', placeName: '다고소님', notes: [{ text: '韓式餐廳' }],
      placeId: 'g-wrong', resolvedPlaceName: '다고소님', formattedAddress: 'Danyang-gun',
      latitude: 36.98, longitude: 128.36, placePhotoUrl: 'https://example.com/a.jpg',
    };

    const cleared = withoutPlaceIdentity(saved);

    expect(cleared.placeId).toBeUndefined();
    expect(cleared.latitude).toBeUndefined();
    expect(cleared.formattedAddress).toBeUndefined();
    // The name came off their screenshot and the notes off the post they read:
    // neither was ever the thing that was wrong.
    expect(cleared.placeName).toBe('다고소님');
    expect(cleared.notes).toEqual([{ text: '韓式餐廳' }]);
  });
});
