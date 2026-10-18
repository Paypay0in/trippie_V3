/**
 * @vitest-environment jsdom
 *
 * 「這為啥都沒圖」, asked again about the three flight cards.
 *
 * The timeline has fetched a photo per stop for months, keyed on `placeId` —
 * which is the one thing an item built from a boarding pass does not have.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAirportPhotoCache, fetchAirportPhoto } from './airportPhoto';
import { clearPlacePhotoCache } from './placePhotoService';

const NRT = 'Narita International Airport';

const answers = (resolve: unknown, photo: unknown) => vi.fn(async (url: string) => ({
  ok: true,
  json: async () => (String(url).includes('/api/places/resolve') ? resolve : photo),
}));

beforeEach(() => { clearAirportPhotoCache(); clearPlacePhotoCache(); });
afterEach(() => vi.unstubAllGlobals());

describe('a photo for an airport', () => {
  it('resolves the name, then asks for that place’s photo', async () => {
    const fetchMock = answers(
      { placeId: 'ChIJ-nrt', resolvedPlaceName: '成田国際空港', latitude: 35.77, longitude: 140.38 },
      { photo: { imageUrl: 'https://maps.example/nrt.jpg' } },
    );
    vi.stubGlobal('fetch', fetchMock as never);

    expect((await fetchAirportPhoto(NRT))?.imageUrl).toBe('https://maps.example/nrt.jpg');
  });

  /*
    The resolve endpoint also answers from geocoding, whose id is not a Google
    place id. `resolvedPlaceName` is the discriminator, and a photo built on
    the wrong kind of id returns nothing, slowly.
  */
  it('does not ask for a photo when the answer came from geocoding', async () => {
    const fetchMock = answers(
      { placeId: '12345', latitude: 35.77, longitude: 140.38 },
      { photo: { imageUrl: 'https://maps.example/nrt.jpg' } },
    );
    vi.stubGlobal('fetch', fetchMock as never);

    expect(await fetchAirportPhoto(NRT)).toBeNull();
    expect((fetchMock.mock.calls as unknown[][])
      .some(call => String(call[0]).includes('/api/places/photo'))).toBe(false);
  });

  /* 出發 and 抵達 at the same airport are one picture, and one lookup. */
  it('asks once per airport', async () => {
    const fetchMock = answers(
      { placeId: 'ChIJ-nrt', resolvedPlaceName: '成田国際空港' },
      { photo: { imageUrl: 'https://maps.example/nrt.jpg' } },
    );
    vi.stubGlobal('fetch', fetchMock as never);

    await Promise.all([fetchAirportPhoto(NRT), fetchAirportPhoto(NRT)]);

    expect((fetchMock.mock.calls as unknown[][])
      .filter(call => String(call[0]).includes('/api/places/resolve'))).toHaveLength(1);
  });

  it('asks nothing for a card with no airport on it', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as never);

    expect(await fetchAirportPhoto('   ')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /* A card keeps its icon rather than breaking when the lookup fails. */
  it('is no picture when the lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }) as never);

    expect(await fetchAirportPhoto(NRT)).toBeNull();
  });
});
