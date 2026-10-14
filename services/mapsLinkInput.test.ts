/**
 * 「我希望他可以即使輸入地址或是 google map 連結都可以帶入」.
 *
 * The box sent whatever it was given to autocomplete as a shop name, so a
 * pasted link searched for the literal string `https://maps.app.goo.gl/…` and
 * found nothing — and a link is how people actually pass a place to each other.
 */
import { describe, expect, it } from 'vitest';
import { isExpandableMapsLink, readMapsInput } from './mapsLinkInput';

describe('plain typing', () => {
  it('is searched as it was typed', () => {
    expect(readMapsInput('Alchemy')).toEqual({ kind: 'text', query: 'Alchemy' });
  });

  /** An address is words, and words are what the search already took. */
  it('treats an address as words', () => {
    const input = readMapsInput('東京都台東区寿4丁目6-2');
    expect(input.kind).toBe('text');
  });

  it('is unbothered by a stray non-maps URL', () => {
    expect(readMapsInput('https://tabelog.com/tokyo/A1311/').kind).toBe('text');
  });
});

describe('a Google Maps link', () => {
  const PLACE_URL =
    'https://www.google.com/maps/place/%E6%9D%B1%E4%BA%AC%E3%82%B9%E3%82%AB%E3%82%A4%E3%83%84%E3%83%AA%E3%83%BC/'
    + '@35.7100627,139.8107004,17z/data=!3m1!4b1!4m6!3m5!1s0x60188ed0d1b2d3b3:0x0!8m2!3d35.7100627!4d139.8107004';

  it('reads the place name out of the path', () => {
    const input = readMapsInput(PLACE_URL);

    expect(input.kind).toBe('link');
    expect(input.kind === 'link' && input.query).toBe('東京スカイツリー');
  });

  it('reads where the pin is, so the search is biased to it', () => {
    const input = readMapsInput(PLACE_URL);

    expect(input.kind === 'link' && input.latitude).toBeCloseTo(35.7100627, 5);
    expect(input.kind === 'link' && input.longitude).toBeCloseTo(139.8107004, 5);
  });

  /*
    `!3d!4d` is the pin; `@lat,lng` is merely where the map was centred when
    the link was made. They are usually the same and occasionally are not, and
    the pin is the thing that was shared.
  */
  it('prefers the pin over the map centre', () => {
    const url = 'https://www.google.com/maps/place/A/@1.0,2.0,17z/data=!8m2!3d35.5!4d139.5';
    const input = readMapsInput(url);

    expect(input.kind === 'link' && input.latitude).toBe(35.5);
  });

  it('reads a ?q= search link', () => {
    const input = readMapsInput('https://www.google.com/maps?q=Senso-ji+Temple');

    expect(input.kind === 'link' && input.query).toBe('Senso-ji Temple');
  });

  it('reads an api=1 query link', () => {
    const input = readMapsInput('https://www.google.com/maps/search/?api=1&query=Alchemy%20Tokyo');

    expect(input.kind === 'link' && input.query).toBe('Alchemy Tokyo');
  });
});

describe('a link with a spot but no name', () => {
  /** Nothing to search for. A guessed name would be worse than saying so. */
  it('is a position, not a search', () => {
    const input = readMapsInput('https://www.google.com/maps/@35.6595,139.7005,17z');

    expect(input).toEqual({ kind: 'position', latitude: 35.6595, longitude: 139.7005 });
  });

  it('reads a bare coordinate pair the same way', () => {
    expect(readMapsInput('35.6595, 139.7005'))
      .toEqual({ kind: 'position', latitude: 35.6595, longitude: 139.7005 });
  });

  /** A query that is itself a coordinate pair is not a name. */
  it('does not mistake coordinates in ?q= for a name', () => {
    expect(readMapsInput('https://www.google.com/maps?q=35.6595,139.7005').kind).toBe('position');
  });
});

describe('short links', () => {
  it('are handed to the server rather than read here', () => {
    const input = readMapsInput('https://maps.app.goo.gl/abc123');

    expect(input).toEqual({ kind: 'shortLink', url: 'https://maps.app.goo.gl/abc123' });
  });

  it('covers the older goo.gl/maps form', () => {
    expect(readMapsInput('https://goo.gl/maps/abc123').kind).toBe('shortLink');
  });
});

/**
 * The server follows these. An endpoint that fetches any URL a caller names is
 * a server that can be pointed at a private network, so the allowlist is the
 * whole safety of that route.
 */
describe('what the server is allowed to follow', () => {
  it('allows Google s own shorteners', () => {
    expect(isExpandableMapsLink('https://maps.app.goo.gl/abc')).toBe(true);
    expect(isExpandableMapsLink('https://goo.gl/maps/abc')).toBe(true);
  });

  it('refuses everything else', () => {
    expect(isExpandableMapsLink('https://evil.example.com/x')).toBe(false);
    expect(isExpandableMapsLink('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isExpandableMapsLink('file:///etc/passwd')).toBe(false);
    expect(isExpandableMapsLink('https://goo.gl.evil.com/abc')).toBe(false);
    expect(isExpandableMapsLink('not a url')).toBe(false);
  });
});
