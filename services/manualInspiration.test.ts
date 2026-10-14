import { describe, expect, it } from 'vitest';
import { isManualInspiration, manualInspirationFrom } from './manualInspiration';

/**
 * 「這裡要有可以手動加入的功能」.
 *
 * The collection could only be filled from a screenshot, so a place somebody
 * simply knows about — recommended over dinner, remembered from last time —
 * had no way in short of screenshotting something first.
 */

const dangol = {
  placeId: 'g-dangol',
  placeName: '단골손님',
  address: '南韓釜山中區 BIFF廣場路 1',
  latitude: 35.0982,
  longitude: 129.0292,
};

const context = {
  savedByUserId: 'north',
  country: '韓國',
  city: '釜山',
  makeId: () => 'insp-manual',
  savedAt: '2026-10-05T01:00:00.000Z',
};

describe('manualInspirationFrom', () => {
  it('keeps the place identity the traveller picked', () => {
    const saved = manualInspirationFrom(dangol, context);

    expect(saved.placeId).toBe('g-dangol');
    expect(saved.latitude).toBe(35.0982);
    expect(saved.formattedAddress).toBe('南韓釜山中區 BIFF廣場路 1');
  });

  it('claims the name as resolved, because a person confirmed it', () => {
    // Picking this exact place off a list of candidates is the strongest
    // confirmation the app ever gets.
    expect(manualInspirationFrom(dangol, context).resolvedPlaceName).toBe('단골손님');
  });

  it('takes the trip’s country and city, which a search result does not state', () => {
    const saved = manualInspirationFrom(dangol, context);

    expect(saved.country).toBe('韓國');
    expect(saved.city).toBe('釜山');
  });

  it('carries no notes and credits nobody', () => {
    // Nobody wrote it, so nobody is credited for it — and a Google description
    // frozen at save time is one that quietly goes stale.
    const saved = manualInspirationFrom(dangol, context);

    expect(saved.notes).toEqual([]);
    expect(saved.sourceCreatorId).toBe('north');
  });

  it('says where it came from', () => {
    expect(isManualInspiration(manualInspirationFrom(dangol, context))).toBe(true);
  });

  it('does not claim a screenshot save as manual', () => {
    expect(isManualInspiration({ sourcePostId: 'screenshot:abc' })).toBe(false);
  });
});

/**
 * 「這個我手動加入的景點」 — saved, and filed under 「日本・日本」.
 *
 * The town came from the trip's own destination field, and on a trip created
 * from a boarding pass that field holds whatever destination detection wrote:
 * for this one, the country. `docs/PRODUCT.md` already settles the ownership —
 * Places owns a place's identity, and the trip is the fallback.
 */
describe('where a manually added place says it is', () => {
  const resolved = {
    placeId: 'p1',
    placeName: 'Alchemy',
    address: '東京都渋谷区…',
    latitude: 35.6595,
    longitude: 139.7005,
  };

  it('prefers the town Google named over the trip s own', () => {
    const saved = manualInspirationFrom(
      { ...resolved, city: '渋谷区', country: '日本' },
      { savedByUserId: 'me', country: '日本', city: '日本', makeId: () => 'x' },
    );

    expect(saved.city).toBe('渋谷区');
    expect(saved.country).toBe('日本');
  });

  /** Google says nothing: the trip is still better than a blank. */
  it('falls back to the trip when Google named no town', () => {
    const saved = manualInspirationFrom(
      resolved,
      { savedByUserId: 'me', country: '日本', city: '東京', makeId: () => 'x' },
    );

    expect(saved.city).toBe('東京');
  });
});
