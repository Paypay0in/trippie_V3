/**
 * What survives a read that arrives mid-edit.
 *
 * The re-read exists so the other traveller's records show up without a
 * reload. It replaces the local list, so without this it would also delete
 * whatever this device had typed in the last second and not yet pushed.
 */
import { describe, expect, it } from 'vitest';
import { mergeWithUnpushed } from './syncMerge';

const item = (id: string) => ({ id });

describe('mergeWithUnpushed', () => {
  it('keeps a record created here and not pushed yet', () => {
    // The race the re-read introduced: typed, debounce still running, read
    // lands. Replacing outright would remove it from its author's screen
    // before the server ever heard of it.
    const merged = mergeWithUnpushed([item('mine-new')], [item('theirs')], []);

    expect(merged.map(entry => entry.id)).toEqual(['theirs', 'mine-new']);
  });

  it('drops a record the other person deleted', () => {
    // Known here and gone from the server means deleted elsewhere. Keeping it
    // would resurrect a cancelled charge, which is worse than losing one —
    // nobody is looking for it.
    const merged = mergeWithUnpushed([item('a-1')], [], ['a-1']);

    expect(merged).toEqual([]);
  });

  it('prefers the remote copy of a record that exists on both', () => {
    const local = { id: 'a-1', amount: 100 };
    const remote = { id: 'a-1', amount: 250 };

    expect(mergeWithUnpushed([local], [remote], ['a-1'])).toEqual([remote]);
  });

  it('is exactly the remote list when nothing is pending', () => {
    const remote = [item('a'), item('b')];

    expect(mergeWithUnpushed([item('a')], remote, ['a'])).toEqual(remote);
  });

  it('keeps both travellers when each added one', () => {
    // The reported symptom, in one line: each phone must end up with both.
    const merged = mergeWithUnpushed([item('his')], [item('hers')], []);

    expect(merged.map(entry => entry.id).sort()).toEqual(['hers', 'his']);
  });
});
