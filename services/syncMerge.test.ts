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

/**
 * 「為什麼我點進去 上傳照片馬上就被刪掉了」.
 *
 * Creations were protected from a read landing before the push; edits to
 * records the server already holds were not, so 「take the remote copy」 threw
 * away a change made a second earlier. The photo picker made it constant
 * rather than rare: opening it hides the document and closing it fires
 * `visibilitychange`, so the re-read ran between the edit and the push every
 * single time.
 */
describe('an edit that has not been pushed yet', () => {
  const sent = { id: 'a', photos: [] as string[] };
  const edited = { id: 'a', photos: ['the-temple'] };
  const fromServer = { id: 'a', photos: [] as string[] };

  it('survives a read that lands before the push', () => {
    const merged = mergeWithUnpushed([edited], [fromServer], ['a'], [sent]);

    expect(merged).toEqual([edited]);
  });

  it('gives way once the push has carried it', () => {
    const merged = mergeWithUnpushed([edited], [edited], ['a'], [edited]);

    expect(merged).toEqual([edited]);
  });

  /*
    A record this device has only ever read is not an edit, and the server's
    copy is the only word on it — otherwise the other traveller's changes
    would never arrive.
  */
  it('takes the remote copy of a record this device never pushed', () => {
    const theirs = { id: 'b', photos: ['hers'] };
    const stale = { id: 'b', photos: [] as string[] };

    expect(mergeWithUnpushed([stale], [theirs], ['b'], [sent])).toEqual([theirs]);
  });

  /* Without a record of what was pushed, it behaves exactly as it always did. */
  it('is unchanged when nothing has been pushed yet', () => {
    expect(mergeWithUnpushed([edited], [fromServer], ['a'])).toEqual([fromServer]);
  });
});

/**
 * 「我剛剛存了很多 都不見了」.
 *
 * `shopping_items` was created tonight, so it was empty for every account the
 * moment it existed. Applying the server's snapshot on open — right for a
 * table the server has held for months — handed back `[]` over a list nobody
 * had pushed yet, and the push that followed sent the emptiness on.
 */
describe('a table the server has only just been given', () => {
  const mine = [{ id: 'a', name: '護髮精油' }, { id: 'b', name: 'SK-II' }];

  it('keeps a list the server has never acknowledged', () => {
    expect(mergeWithUnpushed(mine, [], [])).toEqual(mine);
  });

  /* Once pushed, the server is authoritative again — including about deletions. */
  it('lets the server remove what it has acknowledged', () => {
    expect(mergeWithUnpushed(mine, [mine[0]], ['a', 'b'])).toEqual([mine[0]]);
  });
});

/**
 * 「我按刪除 全部又回來」.
 *
 * Deleting is two steps — the removal, and the prune that carries it — and a
 * read landing between them found the row still on the server and handed it
 * back. It then looked like a row this device had never heard of, so the
 * prune had nothing to remove and it stayed for good.
 */
describe('a deletion still on its way to the server', () => {
  const sent = [{ id: 'a', name: 'SK-II' }, { id: 'b', name: '護髮精油' }];
  const afterDeleting = [sent[1]];

  it('does not come back on a read', () => {
    expect(mergeWithUnpushed(afterDeleting, sent, ['a', 'b'], sent)).toEqual(afterDeleting);
  });

  /*
    What somebody else added since our push is not our deletion: it was never
    in what this device sent, so the server's word stands.
  */
  it('still accepts a row the other traveller added', () => {
    const hers = { id: 'c', name: '洗面乳' };

    expect(mergeWithUnpushed(afterDeleting, [...sent, hers], ['a', 'b'], sent))
      .toEqual([sent[1], hers]);
  });

  /* With nothing pushed from here, a local absence proves nothing. */
  it('leaves the server alone when this device has pushed nothing', () => {
    expect(mergeWithUnpushed(afterDeleting, sent, ['a', 'b'])).toEqual(sent);
  });
});
