/**
 * 「讀取很久」, and then 「還是不行」.
 *
 * Measured on the deployed service: one flight screenshot spent 429, 503 and a
 * 55.7-second 503 before reaching the model that read it correctly in six
 * seconds — and the next upload repeated all of it, because nothing remembered
 * that those three had just said no.
 */
import { describe, expect, it } from 'vitest';
import { createModelLadder } from './modelLadder';

const MODELS = ['a', 'b', 'c', 'd'];

/** A clock the test moves by hand; nothing here should sleep. */
const clockAt = (start = 0) => {
  let now = start;
  return { now: () => now, advance: (ms: number) => { now += ms; } };
};

describe('the order the ladder is walked in', () => {
  it('leaves the hand-written order alone until something fails', () => {
    expect(createModelLadder(clockAt().now).order(MODELS)).toEqual(MODELS);
  });

  it('starts at the model that has not just refused', () => {
    const clock = clockAt();
    const ladder = createModelLadder(clock.now);

    ladder.note('a', 'quota');
    ladder.note('b', 'busy');
    ladder.note('c', 'busy');

    expect(ladder.order(MODELS)).toEqual(['d', 'a', 'b', 'c']);
  });

  /** A refusal is a reason to go last, never a reason to be dropped. */
  it('still offers every model', () => {
    const ladder = createModelLadder(clockAt().now);
    for (const model of MODELS) ladder.note(model, 'quota');

    expect(ladder.order(MODELS).sort()).toEqual(MODELS);
  });

  /** Among models with nothing against them, the authored order survives. */
  it('keeps the relative order of the healthy ones', () => {
    const ladder = createModelLadder(clockAt().now);
    ladder.note('b', 'busy');

    expect(ladder.order(MODELS)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('gives a busy model its turn back after a minute', () => {
    const clock = clockAt();
    const ladder = createModelLadder(clock.now);
    ladder.note('a', 'busy');

    expect(ladder.order(MODELS)[0]).toBe('b');
    clock.advance(61_000);
    expect(ladder.order(MODELS)[0]).toBe('a');
  });

  /** A spent allowance is believed for longer than a demand spike. */
  it('holds a quota refusal past the busy window', () => {
    const clock = clockAt();
    const ladder = createModelLadder(clock.now);
    ladder.note('a', 'quota');

    clock.advance(61_000);
    expect(ladder.order(MODELS)[0]).toBe('b');
    clock.advance(5 * 60_000);
    expect(ladder.order(MODELS)[0]).toBe('a');
  });
});
