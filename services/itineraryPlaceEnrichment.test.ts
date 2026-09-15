import { describe, it, expect } from 'vitest';
import {
  buildPlaceQuery,
  enrichProposalPlaces,
  isSafePlaceMatch,
  needsPlaceEnrichment,
  PlaceEnrichmentContext,
} from './itineraryPlaceEnrichment';
import { ProposedItineraryItem, TripInspirationProposal } from './itineraryPlanningService';
import { ResolvedPlace } from './placeService';

// Busan, matching the ticket's runtime fixture.
const BUSAN: PlaceEnrichmentContext = {
  destination: '釜山',
  destinationCountry: 'South Korea',
  destinationLatitude: 35.1796,
  destinationLongitude: 129.0756,
};

// Shapes taken from real /api/places/resolve responses.
const JAGALCHI: ResolvedPlace = {
  placeId: 'ChIJudkrFArpaDURbbCzajeQs0c',
  resolvedPlaceName: '札嘎其市場',
  address: '52 Jagalchihaean-ro, Jung-gu, Busan, 南韓',
  latitude: 35.0966339,
  longitude: 129.0307965,
  country: '南韓',
  photoAvailable: true,
};

const GUKJE: ResolvedPlace = {
  placeId: 'ChIJfYLMelSTaDURFlCRfk5W1PA',
  resolvedPlaceName: '國際市場',
  address: '55 Gukjesijang 2-gil, Jung-gu, Busan, 南韓',
  latitude: 35.1013575,
  longitude: 129.0281978,
  country: '南韓',
  photoAvailable: true,
};

const proposedItem = (overrides: Partial<ProposedItineraryItem> & Pick<ProposedItineraryItem, 'id' | 'placeName'>): ProposedItineraryItem => ({
  sourceInspirationIds: [],
  source: 'ai_suggestion',
  ...overrides,
});

const GAMCHEON_SAVED = proposedItem({
  id: 'saved-1',
  placeName: '甘川文化村',
  placeId: 'place-gamcheon',
  coordinates: { latitude: 35.0975, longitude: 129.0107 },
  address: '200-10 Gamnae 2-ro, Saha-gu, Busan',
  suggestedStartTime: '16:30',
  sourceInspirationIds: ['insp-b'],
  source: 'saved_inspiration',
});

const FIXTURE_PROPOSAL: TripInspirationProposal = {
  days: [{
    date: '2026-10-02',
    items: [
      proposedItem({ id: 'ai-1', placeName: '札嘎其市場', suggestedStartTime: '11:00' }),
      proposedItem({ id: 'ai-2', placeName: '國際市場', suggestedStartTime: '13:30' }),
      GAMCHEON_SAVED,
    ],
  }],
  warnings: [],
};

const resolverFor = (byQuery: Record<string, ResolvedPlace | null>) => {
  const calls: string[] = [];
  const resolve = async (query: string) => { calls.push(query); return byQuery[query] ?? null; };
  return { resolve, calls };
};

describe('buildPlaceQuery', () => {
  it('searches with the trip city and country, not the bare name', () => {
    expect(buildPlaceQuery('札嘎其市場', BUSAN)).toBe('札嘎其市場 釜山 South Korea');
  });

  it('drops missing context instead of leaving gaps in the query', () => {
    expect(buildPlaceQuery('札嘎其市場', {})).toBe('札嘎其市場');
    expect(buildPlaceQuery('札嘎其市場', { destination: '釜山' })).toBe('札嘎其市場 釜山');
  });
});

describe('needsPlaceEnrichment', () => {
  it('targets only AI suggestions that have no place identity', () => {
    expect(needsPlaceEnrichment(proposedItem({ id: 'a', placeName: '札嘎其市場' }))).toBe(true);
    expect(needsPlaceEnrichment(GAMCHEON_SAVED)).toBe(false);
    expect(needsPlaceEnrichment(proposedItem({ id: 'b', placeName: 'X', placeId: 'already-there' }))).toBe(false);
  });
});

describe('isSafePlaceMatch', () => {
  it('accepts a Google result in the right city', () => {
    expect(isSafePlaceMatch(JAGALCHI, BUSAN)).toEqual({ safe: true, place: JAGALCHI });
  });

  it('accepts a differently-named venue for a generic request', () => {
    // 「汗蒸幕」 legitimately resolves to a specific spa; a name gate would lose it.
    const spa: ResolvedPlace = { placeId: 'ChIJDT_5v8aSaDURXW8rEbumGh8', resolvedPlaceName: 'SPA LAND Centum City', address: '35 Centum nam-daero, Haeundae, Busan, 南韓', latitude: 35.1682338, longitude: 129.1295279, country: '南韓' };
    expect(isSafePlaceMatch(spa, BUSAN).safe).toBe(true);
  });

  it('rejects a lookup that returned nothing', () => {
    expect(isSafePlaceMatch(null, BUSAN)).toEqual({ safe: false, reason: 'no-result' });
  });

  it('rejects a non-Google identity so the photo path cannot break', () => {
    // The geocoding fallback returns a numeric id and no resolvedPlaceName.
    const fallback: ResolvedPlace = { placeId: '1838524', address: '釜山, 韓國', latitude: 35.1028, longitude: 129.0403, country: 'South Korea' };
    expect(isSafePlaceMatch(fallback, BUSAN)).toEqual({ safe: false, reason: 'not-google-identity' });
    const noId: ResolvedPlace = { resolvedPlaceName: '某處', address: 'x', latitude: 35.1, longitude: 129.0 };
    expect(isSafePlaceMatch(noId, BUSAN)).toEqual({ safe: false, reason: 'not-google-identity' });
  });

  it('rejects an unusable coordinate pair', () => {
    expect(isSafePlaceMatch({ ...JAGALCHI, latitude: 0, longitude: 0 }, BUSAN)).toEqual({ safe: false, reason: 'no-coordinates' });
  });

  it('rejects a result that is confidently in another country', () => {
    const tokyoMarket: ResolvedPlace = { placeId: 'ChIJtokyo', resolvedPlaceName: '築地市場', address: 'Tsukiji, Tokyo, Japan', latitude: 35.6654, longitude: 139.7707, country: '日本' };
    expect(isSafePlaceMatch(tokyoMarket, BUSAN)).toEqual({ safe: false, reason: 'different-country' });
  });

  it('rejects a same-country result in the wrong city', () => {
    // Seoul is ~325km from Busan.
    const seoulMarket: ResolvedPlace = { placeId: 'ChIJseoul', resolvedPlaceName: '廣藏市場', address: 'Jongno-gu, Seoul, 南韓', latitude: 37.5701, longitude: 126.9998, country: '南韓' };
    expect(isSafePlaceMatch(seoulMarket, BUSAN)).toEqual({ safe: false, reason: 'too-far' });
  });

  it('still accepts when the trip has no coordinates to compare against', () => {
    expect(isSafePlaceMatch(JAGALCHI, { destination: '釜山', destinationCountry: 'South Korea' }).safe).toBe(true);
  });
});

describe('enrichProposalPlaces — ticket runtime fixture', () => {
  it('resolves the AI suggestions and leaves the saved place alone', async () => {
    const { resolve, calls } = resolverFor({
      '札嘎其市場 釜山 South Korea': JAGALCHI,
      '國際市場 釜山 South Korea': GUKJE,
    });
    const { proposal, summary } = await enrichProposalPlaces(FIXTURE_PROPOSAL, BUSAN, resolve);
    const [jagalchi, gukje, gamcheon] = proposal.days[0].items;

    expect(jagalchi.placeId).toBe(JAGALCHI.placeId);
    expect(jagalchi.coordinates).toEqual({ latitude: 35.0966339, longitude: 129.0307965 });
    expect(jagalchi.address).toBe(JAGALCHI.address);
    expect(gukje.placeId).toBe(GUKJE.placeId);

    // The saved place keeps its canonical identity and was never looked up.
    expect(gamcheon.placeId).toBe('place-gamcheon');
    expect(gamcheon.coordinates).toEqual({ latitude: 35.0975, longitude: 129.0107 });
    expect(calls.some(query => query.includes('甘川文化村'))).toBe(false);
    expect(calls).toHaveLength(2);
    expect(summary).toEqual({ attempted: 2, resolved: 2, unresolved: 0 });
  });

  it('never turns a resolved AI suggestion into a saved inspiration', async () => {
    const { resolve } = resolverFor({ '札嘎其市場 釜山 South Korea': JAGALCHI, '國際市場 釜山 South Korea': GUKJE });
    const { proposal } = await enrichProposalPlaces(FIXTURE_PROPOSAL, BUSAN, resolve);
    const [jagalchi, gukje] = proposal.days[0].items;
    expect(jagalchi.source).toBe('ai_suggestion');
    expect(jagalchi.sourceInspirationIds).toEqual([]);
    expect(gukje.source).toBe('ai_suggestion');
    expect(gukje.sourceInspirationIds).toEqual([]);
  });

  it('keeps every proposed start time through enrichment', async () => {
    const { resolve } = resolverFor({ '札嘎其市場 釜山 South Korea': JAGALCHI, '國際市場 釜山 South Korea': GUKJE });
    const { proposal } = await enrichProposalPlaces(FIXTURE_PROPOSAL, BUSAN, resolve);
    expect(proposal.days[0].items.map(item => item.suggestedStartTime)).toEqual(['11:00', '13:30', '16:30']);
  });

  it('does not mutate the proposal it was given', async () => {
    const snapshot = JSON.stringify(FIXTURE_PROPOSAL);
    const { resolve } = resolverFor({ '札嘎其市場 釜山 South Korea': JAGALCHI });
    await enrichProposalPlaces(FIXTURE_PROPOSAL, BUSAN, resolve);
    expect(JSON.stringify(FIXTURE_PROPOSAL)).toBe(snapshot);
  });
});

describe('enrichProposalPlaces — best effort', () => {
  it('leaves an unresolvable place as a usable text-only item', async () => {
    const { resolve } = resolverFor({ '札嘎其市場 釜山 South Korea': JAGALCHI });
    const { proposal, summary } = await enrichProposalPlaces(FIXTURE_PROPOSAL, BUSAN, resolve);
    const gukje = proposal.days[0].items[1];
    expect(gukje.placeId).toBeUndefined();
    expect(gukje.placeName).toBe('國際市場');
    expect(gukje.suggestedStartTime).toBe('13:30');
    expect(summary).toEqual({ attempted: 2, resolved: 1, unresolved: 1 });
  });

  it('survives a resolver that throws', async () => {
    const resolve = async () => { throw new Error('places down'); };
    const { proposal, summary } = await enrichProposalPlaces(FIXTURE_PROPOSAL, BUSAN, resolve);
    expect(proposal.days[0].items.map(item => item.placeId)).toEqual([undefined, undefined, 'place-gamcheon']);
    expect(summary.resolved).toBe(0);
  });

  it('drops an unsafe match rather than attaching the wrong place', async () => {
    const wrongCity: ResolvedPlace = { placeId: 'ChIJseoul', resolvedPlaceName: '廣藏市場', address: 'Seoul', latitude: 37.5701, longitude: 126.9998, country: '南韓' };
    const { resolve } = resolverFor({ '札嘎其市場 釜山 South Korea': wrongCity, '國際市場 釜山 South Korea': GUKJE });
    const { proposal } = await enrichProposalPlaces(FIXTURE_PROPOSAL, BUSAN, resolve);
    expect(proposal.days[0].items[0].placeId).toBeUndefined();
    expect(proposal.days[0].items[1].placeId).toBe(GUKJE.placeId);
  });

  it('looks a repeated place name up only once', async () => {
    const repeated: TripInspirationProposal = {
      days: [
        { date: '2026-10-02', items: [proposedItem({ id: 'a', placeName: '札嘎其市場', suggestedStartTime: '11:00' })] },
        { date: '2026-10-03', items: [proposedItem({ id: 'b', placeName: '札嘎其市場', suggestedStartTime: '09:00' })] },
      ],
      warnings: [],
    };
    const { resolve, calls } = resolverFor({ '札嘎其市場 釜山 South Korea': JAGALCHI });
    const { proposal } = await enrichProposalPlaces(repeated, BUSAN, resolve);
    expect(calls).toHaveLength(1);
    expect(proposal.days[0].items[0].placeId).toBe(JAGALCHI.placeId);
    expect(proposal.days[1].items[0].placeId).toBe(JAGALCHI.placeId);
  });

  it('does nothing at all when there is no AI suggestion to enrich', async () => {
    const savedOnly: TripInspirationProposal = { days: [{ date: '2026-10-02', items: [GAMCHEON_SAVED] }], warnings: [] };
    const { resolve, calls } = resolverFor({});
    const { proposal, summary } = await enrichProposalPlaces(savedOnly, BUSAN, resolve);
    expect(calls).toHaveLength(0);
    expect(proposal).toBe(savedOnly);
    expect(summary).toEqual({ attempted: 0, resolved: 0, unresolved: 0 });
  });
});

/* ------------------------------------------------------------------ *
 * Lane M: place identity for items that never had one
 * ------------------------------------------------------------------ */

describe('enrichment of items with no canonical placeId', () => {
  /** A saved place the user saved without ever resolving a Google identity. */
  const GAMCHEON_UNRESOLVED = proposedItem({
    id: 'saved-unresolved',
    placeName: '甘川文化村',
    suggestedStartTime: '16:30',
    sourceInspirationIds: ['insp-b'],
    source: 'saved_inspiration',
    experienceNotes: [{ id: 'n1', sourceNoteId: 'sn1', sourceSliceId: 'ss1', sourcePostId: 'sp1', sourceCreatorId: 'sc1', type: 'recommendation', text: '下午拍照光線很好' }],
  });

  const GAMCHEON_RESOLVED: ResolvedPlace = {
    placeId: 'ChIJ-gamcheon',
    resolvedPlaceName: 'Gamcheon Culture Village',
    address: '203 Gamnae 2-ro, Saha-gu, Busan',
    latitude: 35.0975,
    longitude: 129.0107,
    country: '南韓',
  };

  it('resolves a saved place that never had an identity, and keeps it a saved place', async () => {
    // The planner promises 「尚未取得地點座標，AI 規劃時再解析」; this is that resolution.
    expect(needsPlaceEnrichment(GAMCHEON_UNRESOLVED)).toBe(true);

    const { proposal, summary } = await enrichProposalPlaces(
      { days: [{ date: '2026-10-02', items: [GAMCHEON_UNRESOLVED] }], warnings: [] },
      BUSAN,
      async () => GAMCHEON_RESOLVED,
    );

    const enriched = proposal.days[0].items[0];
    expect(summary).toEqual({ attempted: 1, resolved: 1, unresolved: 0 });
    expect(enriched.placeId).toBe('ChIJ-gamcheon');
    expect(enriched.address).toBe('203 Gamnae 2-ro, Saha-gu, Busan');
    expect(enriched.coordinates).toEqual({ latitude: 35.0975, longitude: 129.0107 });
    // Provenance is untouched, and the user's own name for the place survives.
    expect(enriched.source).toBe('saved_inspiration');
    expect(enriched.sourceInspirationIds).toEqual(['insp-b']);
    expect(enriched.placeName).toBe('甘川文化村');
    expect(enriched.experienceNotes).toHaveLength(1);
  });

  it('adopts the canonical Google name for an AI suggestion only', async () => {
    const { proposal } = await enrichProposalPlaces(
      { days: [{ date: '2026-10-02', items: [proposedItem({ id: 'ai-1', placeName: '汗蒸幕' })] }], warnings: [] },
      BUSAN,
      async () => JAGALCHI,
    );
    expect(proposal.days[0].items[0].placeName).toBe('札嘎其市場');
    expect(proposal.days[0].items[0].source).toBe('ai_suggestion');
    expect(proposal.days[0].items[0].sourceInspirationIds).toEqual([]);
  });

  it('leaves the item text-only when resolution finds nothing', async () => {
    const { proposal, summary } = await enrichProposalPlaces(
      { days: [{ date: '2026-10-02', items: [GAMCHEON_UNRESOLVED] }], warnings: [] },
      BUSAN,
      async () => null,
    );
    expect(summary).toEqual({ attempted: 1, resolved: 1 - 1, unresolved: 1 });
    expect(proposal.days[0].items[0].placeId).toBeUndefined();
    expect(proposal.days[0].items[0].experienceNotes).toHaveLength(1);
  });

  it('still never re-resolves a saved place that already has an identity', async () => {
    expect(needsPlaceEnrichment(GAMCHEON_SAVED)).toBe(false);
    let calls = 0;
    await enrichProposalPlaces(
      { days: [{ date: '2026-10-02', items: [GAMCHEON_SAVED] }], warnings: [] },
      BUSAN,
      async () => { calls += 1; return GUKJE; },
    );
    expect(calls).toBe(0);
  });
});
