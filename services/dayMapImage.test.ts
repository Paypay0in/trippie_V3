/**
 * 「行程的地圖模式」, built the way the Founder chose: a picture composed by
 * Google and relayed by our own server, so no Maps key reaches the browser.
 *
 * These assert the request this module builds, because the thing it must never
 * do is leak a key or let a caller aim our key at anything else.
 */
import { describe, expect, it } from 'vitest';
import { dayMapQuery, dayMapSrc, mappableStops, pinLabel, stopsOnTheGround } from './dayMapImage';

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

/**
 * 「最後一天會跨國！且也只能跨國。最後一天還有行程欸！」
 *
 * His last day: four real stops across Tokyo, then 抵達機場 and 航班起飛 at
 * Narita, then 航班抵達 at Taoyuan. The map drew one line across the East China
 * Sea and squashed the whole day into a dot at the Tokyo end, and the day's
 * 「最遠兩點」 read two thousand kilometres.
 */
describe('一天裡不在地面上的那一點', () => {
  const stop = (id: string, latitude: number, longitude: number) => ({ id, latitude, longitude });

  /* His actual last day. */
  const lastDay = [
    stop('chavaty', 35.6659, 139.7105),
    stop('tsutaya', 35.6489, 139.6998),
    stop('nakameguro', 35.6387, 139.7026),
    stop('sky', 35.6580, 139.7016),
    stop('narita-arrive', 35.7720, 140.3929),
    stop('narita-depart', 35.7720, 140.3929),
    stop('taoyuan', 25.0797, 121.2342),
  ];

  it('把跨海的那一點排除在地面動線之外', () => {
    const kept = stopsOnTheGround(lastDay).map(entry => entry.id);

    expect(kept).not.toContain('taoyuan');
    // Narita is 60 km out and genuinely part of the day's ground movement.
    expect(kept).toContain('narita-depart');
    expect(kept).toContain('chavaty');
  });

  /* A day that is all in one place is left exactly as it is. */
  it('正常的一天一個都不排除', () => {
    const asakusa = [
      stop('a', 35.7148, 139.7967),
      stop('b', 35.7119, 139.7936),
      stop('c', 35.7040, 139.7930),
    ];

    expect(stopsOnTheGround(asakusa)).toHaveLength(3);
  });

  /*
    Two points cannot tell which of them is the outlier, so neither is dropped:
    a day of exactly 「here and the airport」 is a real shape.
  */
  it('只有兩個點時不判斷誰是離群的', () => {
    expect(stopsOnTheGround([stop('a', 35.6, 139.7), stop('b', 25.0, 121.2)])).toHaveLength(2);
  });
});

/**
 * 「收藏區可以每一區也都給一張靜態地圖嗎」.
 *
 * A day is walked in an order and the line is that order. A collection is not.
 */
describe('a map with no route through it', () => {
  const pins = [
    { id: 'a', number: 0, latitude: 35.7148, longitude: 139.7967 },
    { id: 'b', number: 0, latitude: 35.7100, longitude: 139.7900 },
  ];

  it('draws the pins and no path', () => {
    const query = dayMapQuery({ stops: pins, width: 640, height: 220, connect: false });

    expect(query.getAll('markers')).toHaveLength(2);
    expect(query.getAll('path')).toHaveLength(0);
  });

  /* Even a route the caller handed in: the collection never had an order. */
  it('ignores encoded paths when it is not connecting', () => {
    const query = dayMapQuery({
      stops: pins, width: 640, height: 220, connect: false, encodedPaths: ['abcdef'],
    });

    expect(query.getAll('path')).toHaveLength(0);
  });

  /* A day still joins its stops — every existing caller passes nothing. */
  it('still connects by default', () => {
    const query = dayMapQuery({ stops: pins, width: 640, height: 220 });

    expect(query.getAll('path')).toHaveLength(1);
  });

  /* 0 is not a pin number, so no 1..9 label is invented for a collection. */
  it('labels nothing when the stops are unnumbered', () => {
    const query = dayMapQuery({ stops: pins, width: 640, height: 220, connect: false });

    query.getAll('markers').forEach(marker => expect(marker).not.toContain('label:'));
  });
});
