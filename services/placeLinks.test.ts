import { describe, expect, it } from 'vitest';
import { placeCopyText, placeDirectionsUrl, placeMapsUrl, placeSearchQuery } from './placeLinks';

/**
 * 「讓用戶可以轉跳到 Google 地圖等」.
 *
 * Every link is built from what the save holds, strongest identity first. The
 * point of the order is that a link never claims more certainty than the data:
 * a place id opens one restaurant, a name opens a search.
 */

describe('placeMapsUrl', () => {
  it('opens the exact place when the save resolved to one', () => {
    const url = new URL(placeMapsUrl({ placeName: '味贊王鹽烤肉', placeId: 'g-123' }));
    expect(url.searchParams.get('query_place_id')).toBe('g-123');
    expect(url.searchParams.get('query')).toBe('味贊王鹽烤肉');
  });

  it('falls back to the point when there is no id', () => {
    const url = new URL(placeMapsUrl({
      placeName: '海雲台傳統市場',
      coordinates: { latitude: 35.1587, longitude: 129.1604 },
    }));
    expect(url.searchParams.get('query')).toBe('35.1587,129.1604');
    expect(url.searchParams.get('query_place_id')).toBeNull();
  });

  it('searches with the city when it has neither', () => {
    // A restaurant name alone resolves to whatever is nearest the reader, who
    // may be reading this from Taipei a week before the trip.
    const url = new URL(placeMapsUrl({ placeName: '蟻家辣炒章魚', city: '釜山', country: '韓國' }));
    expect(url.searchParams.get('query')).toBe('蟻家辣炒章魚 釜山 韓國');
  });

  it('prefers a resolved address over the name and city', () => {
    expect(placeSearchQuery({
      placeName: '蟻家辣炒章魚',
      formattedAddress: '釜山廣域市海雲台區...',
      city: '釜山',
      country: '韓國',
    })).toBe('釜山廣域市海雲台區...');
  });
});

describe('placeDirectionsUrl', () => {
  it('navigates to the point, not the name', () => {
    const url = new URL(placeDirectionsUrl({
      placeName: '味贊王鹽烤肉',
      placeId: 'g-123',
      coordinates: { latitude: 35.1, longitude: 129.1 },
    }));
    expect(url.searchParams.get('destination')).toBe('35.1,129.1');
    expect(url.searchParams.get('destination_place_id')).toBe('g-123');
  });

  it('sets no origin, so Maps uses where the traveller is', () => {
    const url = new URL(placeDirectionsUrl({ placeName: '海雲台傳統市場', city: '釜山' }));
    expect(url.searchParams.get('origin')).toBeNull();
    expect(url.searchParams.get('destination')).toBe('海雲台傳統市場 釜山');
  });
});

describe('placeCopyText', () => {
  it('copies the address when there is one', () => {
    expect(placeCopyText({ placeName: 'x', formattedAddress: '釜山廣域市...' })).toBe('釜山廣域市...');
  });

  it('copies the name when there is not', () => {
    expect(placeCopyText({ placeName: '蟻家辣炒章魚' })).toBe('蟻家辣炒章魚');
  });
});
