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
