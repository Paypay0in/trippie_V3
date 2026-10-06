/**
 * @vitest-environment jsdom
 *
 * 「刪掉的帳又一直出現了」.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { EVER_SEEN_STORAGE_PREFIX, loadEverSeen, rememberSeen, saveEverSeen } from './everSeenRemoteIds';
import { mergeWithUnpushed } from './syncMerge';

beforeEach(() => localStorage.clear());

describe('remembering what the server held', () => {
  it('keeps what it saw before, not only what it sees now', () => {
    // The whole bug: the set was replaced by the latest snapshot, so a bill
    // deleted elsewhere stopped being 「something the server had」 the instant
    // it was deleted.
    const seen = rememberSeen(['e-coffee', 'e-lunch'], ['e-lunch']);

    expect(seen.has('e-coffee')).toBe(true);
    expect(seen.has('e-lunch')).toBe(true);
  });

  it('adds rows it had not seen before', () => {
    expect(Array.from(rememberSeen(['a'], ['b'])).sort()).toEqual(['a', 'b']);
  });

  it('starts from nothing on a trip it has never read', () => {
    expect(Array.from(rememberSeen(undefined, ['a']))).toEqual(['a']);
  });
});

describe('across a reload', () => {
  it('still knows the row existed', () => {
    saveEverSeen('trip-1', { expenses: ['e-coffee'] });

    expect(loadEverSeen('trip-1').expenses).toEqual(['e-coffee']);
  });

  it('keeps one trip apart from another', () => {
    saveEverSeen('trip-1', { expenses: ['e-coffee'] });
    saveEverSeen('trip-2', { expenses: ['e-dinner'] });

    expect(loadEverSeen('trip-1').expenses).toEqual(['e-coffee']);
    expect(loadEverSeen('trip-2').expenses).toEqual(['e-dinner']);
  });

  it('reads a corrupt store as having seen nothing', () => {
    // The safe direction: records are kept rather than dropped, and the worst
    // case is one reappearance, corrected on the next read.
    localStorage.setItem(`${EVER_SEEN_STORAGE_PREFIX}trip-1`, '{oops');

    expect(loadEverSeen('trip-1').expenses).toEqual([]);
  });

  it('ignores anything stored that is not an id', () => {
    localStorage.setItem(`${EVER_SEEN_STORAGE_PREFIX}trip-1`, JSON.stringify({ expenses: ['ok', 42, null, ''] }));

    expect(loadEverSeen('trip-1').expenses).toEqual(['ok']);
  });
});

/**
 * The two cases the merge has to tell apart, run end to end against the real
 * merge — this is the pair that was collapsing into one answer.
 */
describe('a bill the other traveller deleted', () => {
  const coffee = { id: 'e-coffee', description: 'Strut coffee' };
  const lunch = { id: 'e-lunch', description: '午餐' };

  it('lets it go, instead of publishing it again', () => {
    const seen = rememberSeen(['e-coffee', 'e-lunch'], ['e-lunch']);

    const merged = mergeWithUnpushed([coffee, lunch], [lunch], seen);

    expect(merged.map(entry => entry.id)).toEqual(['e-lunch']);
  });

  it('still keeps a bill this device has only just written', () => {
    const fresh = { id: 'e-new', description: '剛記的' };
    const seen = rememberSeen(['e-lunch'], ['e-lunch']);

    const merged = mergeWithUnpushed([lunch, fresh], [lunch], seen);

    expect(merged.map(entry => entry.id)).toEqual(['e-lunch', 'e-new']);
  });

  it('lets it go after a reload too, which is when it kept coming back', () => {
    saveEverSeen('trip-1', { expenses: ['e-coffee', 'e-lunch'] });

    const afterReload = loadEverSeen('trip-1');
    const merged = mergeWithUnpushed([coffee, lunch], [lunch], afterReload.expenses);

    expect(merged.map(entry => entry.id)).toEqual(['e-lunch']);
  });
});
