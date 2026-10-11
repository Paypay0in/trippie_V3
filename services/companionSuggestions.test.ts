import { describe, expect, it } from 'vitest';
import {
  CompanionSeat,
  companionSuggestions,
  metOnLabel,
} from './companionSuggestions';

/**
 * 「gina已經是跟我有共同建立旅行本的人 是不是可以直接新增成朋友」.
 *
 * Each test names the failure it prevents, because most of them are about
 * suggesting the wrong person rather than about failing to suggest anybody.
 */

const seat = (over: Partial<CompanionSeat> = {}): CompanionSeat => ({
  userId: 'gina',
  name: 'Gina',
  tripId: 't1',
  tripName: '日本東京',
  ...over,
});

describe('suggesting people you have travelled with', () => {
  it('offers a companion whose seat has an account', () => {
    const out = companionSuggestions([seat()], { me: 'north' });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ userId: 'gina', name: 'Gina', tripCount: 1 });
  });

  /**
   * A seat with no account is a name the owner typed into the roster. There is
   * nobody to send a request to, and guessing from the name would reach a
   * stranger who happens to be called Gina.
   */
  it('skips a seat nobody has claimed', () => {
    const out = companionSuggestions([seat({ userId: undefined })], { me: 'north' });
    expect(out).toEqual([]);
  });

  it('never suggests yourself', () => {
    const out = companionSuggestions([seat({ userId: 'north' })], { me: 'north' });
    expect(out).toEqual([]);
  });

  it('offers nothing when nobody is signed in, rather than offering everyone', () => {
    const out = companionSuggestions([seat()], {});
    expect(out).toEqual([]);
  });

  it('drops somebody who is already a friend', () => {
    const out = companionSuggestions([seat()], { me: 'north', friendIds: ['gina'] });
    expect(out).toEqual([]);
  });

  /**
   * Both directions, and pending counts. A sent invitation that stays in the
   * list gets sent twice, and to the person who has not answered yet that
   * looks like being asked again.
   */
  it('drops somebody already invited, whichever side asked', () => {
    const sent = companionSuggestions([seat()], {
      me: 'north',
      friendships: [{ requesterId: 'north', addresseeId: 'gina', status: 'pending' }],
    });
    expect(sent).toEqual([]);

    const received = companionSuggestions([seat()], {
      me: 'north',
      friendships: [{ requesterId: 'gina', addresseeId: 'north', status: 'pending' }],
    });
    expect(received).toEqual([]);
  });

  it('ignores a friendship between two other people', () => {
    const out = companionSuggestions([seat()], {
      me: 'north',
      friendships: [{ requesterId: 'gina', addresseeId: 'someone', status: 'accepted' }],
    });
    expect(out).toHaveLength(1);
  });

  /** Three trips with one person is one friend, not three suggestions. */
  it('lists a person once however many trips you have shared', () => {
    const out = companionSuggestions(
      [
        seat({ tripId: 't1', tripName: '日本東京' }),
        seat({ tripId: 't2', tripName: '韓國釜山' }),
        seat({ tripId: 't3', tripName: '台南' }),
      ],
      { me: 'north' },
    );
    expect(out).toHaveLength(1);
    expect(out[0].tripCount).toBe(3);
    expect(out[0].tripNames).toEqual(['日本東京', '韓國釜山', '台南']);
  });

  /** Two seats for one person on one trip is a duplicate, not a second trip. */
  it('does not count one trip twice when a person holds two seats on it', () => {
    const out = companionSuggestions(
      [seat({ tripId: 't1' }), seat({ tripId: 't1' })],
      { me: 'north' },
    );
    expect(out[0].tripCount).toBe(1);
  });

  it('keeps several different companions', () => {
    const out = companionSuggestions(
      [seat(), seat({ userId: 'mei', name: 'Mei' })],
      { me: 'north' },
    );
    expect(out.map(entry => entry.userId)).toEqual(['gina', 'mei']);
  });

  it('falls back to 旅人 for a seat left unnamed', () => {
    const out = companionSuggestions([seat({ name: '' })], { me: 'north' });
    expect(out[0].name).toBe('旅人');
  });
});

describe('where you met', () => {
  it('names the trip', () => {
    expect(metOnLabel({ userId: 'g', name: 'Gina', tripNames: ['日本東京'], tripCount: 1 }))
      .toBe('一起去過 日本東京');
  });

  it('names the first and counts the rest', () => {
    expect(metOnLabel({ userId: 'g', name: 'Gina', tripNames: ['日本東京', '台南'], tripCount: 2 }))
      .toBe('一起去過 日本東京 等 2 趟旅行');
  });

  /** An unnamed trip is 「未命名旅程」 on screen; a count says more than that. */
  it('counts when no trip has a name', () => {
    expect(metOnLabel({ userId: 'g', name: 'Gina', tripNames: [], tripCount: 2 }))
      .toBe('一起去過 2 趟旅行');
  });
});
