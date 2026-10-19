/**
 * 「沒動」.
 *
 * A friendship this device cannot put a name to is still a friendship. Both
 * lists used to drop it, so one unresolved profile took the whole thing off
 * the screen — and ✓ had been pressed into a void.
 */
import { describe, expect, it } from 'vitest';
import { personOrStranger } from './personOrStranger';

describe('叫不出名字的那個人', () => {
  it('keeps the person when there is one', () => {
    const ann = { id: 'u-ann', displayName: 'Ann', avatarUrl: 'https://example.com/a.jpg' };

    expect(personOrStranger(ann, 'u-ann')).toBe(ann);
  });

  it('still returns somebody when the profile did not resolve', () => {
    expect(personOrStranger(undefined, 'u-ann')).toEqual({ id: 'u-ann', displayName: '旅人' });
  });

  /* The id is the identity every action here is addressed by. */
  it('keeps the id, which is what the actions use', () => {
    expect(personOrStranger(undefined, 'u-ann').id).toBe('u-ann');
  });
});
