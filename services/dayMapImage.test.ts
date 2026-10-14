/**
 * 「行程的地圖模式」, built the way the Founder chose: a picture composed by
 * Google and relayed by our own server, so no Maps key reaches the browser.
 *
 * These assert the request this module builds, because the thing it must never
 * do is leak a key or let a caller aim our key at anything else.
 */
import { describe, expect, it } from 'vitest';
import { dayMapQuery, dayMapSrc, mappableStops, pinLabel } from './dayMapImage';

const stop = (id: string, latitude: number, longitude: number, number: number) =>
  ({ id, latitude, longitude, number });

const HND = stop('a', 35.5494, 139.7798, 1);
const SHIBUYA = stop('b', 35.6595, 139.7005, 2);

describe('which stops can be drawn', () => {
  it('keeps only the ones with coordinates', () => {
    const drawn = mappableStops([
      { id: 'a', latitude: 35.5494, longitude: 139.7798 },
      { id: 'b' },
      { id: 'c', latitude: 35.6595, longitude: 139.7005 },
    ]);

    expect(drawn.map(entry => entry.id)).toEqual(['a', 'c']);
  });

  /*
    Numbering follows the day, not the drawable subset. Pin 3 is the third
    thing on the plan even when the second could not be placed — otherwise the
    map and the list beside it disagree about what 2 means.
  */
  it('numbers by position in the day, not by position on the map', () => {
    const drawn = mappableStops([
      { id: 'a', latitude: 1, longitude: 1 },
      { id: 'b' },
      { id: 'c', latitude: 2, longitude: 2 },
    ]);

    expect(drawn.map(entry => entry.number)).toEqual([1, 3]);
  });
});

describe('the numbers on the pins', () => {
  it('labels the first nine', () => {
    expect(pinLabel(1)).toBe('1');
    expect(pinLabel(9)).toBe('9');
  });

  /** A Static Maps label is one character, so the tenth gets a plain pin. */
  it('gives no label rather than a wrong one past nine', () => {
    expect(pinLabel(10)).toBeUndefined();
    expect(pinLabel(12)).toBeUndefined();
  });
});

describe('the request', () => {
  const query = (over = {}) =>
    dayMapQuery({ stops: [HND, SHIBUYA], width: 640, height: 400, ...over });

  it('asks for one marker per stop, numbered', () => {
    const markers = query().getAll('markers');

    expect(markers).toHaveLength(2);
    expect(markers[0]).toContain('label:1');
    expect(markers[0]).toContain('35.5494,139.7798');
    expect(markers[1]).toContain('label:2');
  });

  /** Road geometry when it has been fetched. */
  it('draws the real path when there is one', () => {
    const paths = query({ encodedPaths: ['abc_def'] }).getAll('path');

    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain('enc:abc_def');
  });

  /*
    A straight connector when there is not. It says the order of the stops,
    which is true, rather than a road nobody looked up.
  */
  it('falls back to a line through the stops', () => {
    const paths = query().getAll('path');

    expect(paths[0]).toContain('35.5494,139.7798|35.6595,139.7005');
    expect(paths[0]).not.toContain('enc:');
  });

  it('draws no path for a single stop', () => {
    expect(dayMapQuery({ stops: [HND], width: 640, height: 400 }).getAll('path')).toHaveLength(0);
  });

  /** Framing is Google's job; anything we computed would be worse. */
  it('sets no centre and no zoom', () => {
    expect(query().get('center')).toBeNull();
    expect(query().get('zoom')).toBeNull();
  });

  it('asks for a retina image, because it is read on a phone', () => {
    expect(query().get('scale')).toBe('2');
  });
});

describe('what the browser is given', () => {
  /** The one thing that must never change: no key, and not Google's host. */
  it('points at our own server and carries no key', () => {
    const src = dayMapSrc({ stops: [HND, SHIBUYA], width: 640, height: 400 });

    expect(src.startsWith('/api/maps/day?')).toBe(true);
    expect(src).not.toContain('googleapis');
    expect(src.toLowerCase()).not.toContain('key=');
  });
});
