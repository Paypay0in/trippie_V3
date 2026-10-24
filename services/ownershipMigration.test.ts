/**
 * @vitest-environment jsdom
 */
/**
 * Signing in renames the person, and it has to rename them everywhere.
 *
 * An anonymous traveller is a `trippie_user_id` UUID. That id is written onto
 * every record they make — as `savedByUserId`, which says who has it, and as
 * `sourceCreatorId`, which says who found it, because for a place typed into
 * the search box or read off a screenshot those are the same person.
 *
 * Only the first was being rewritten. The anonymous id stood as the creator
 * forever, and `inspirationMerge` then carried that dead id outward as the
 * surviving credit — which is where 「來自 Ann 的東京咖啡地圖」 would have got
 * a name nobody can resolve.
 */
import { describe, expect, it } from 'vitest';
import { migrateLocalOwnership } from './ownershipMigration';
import { SavedTravelInspiration } from '../types';

const ANON = 'anon-uuid';
const SIGNED_IN = 'auth-uuid';

const saved = (patch: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id: 'i1',
  savedByUserId: ANON,
  country: '日本',
  city: '東京',
  placeName: 'Onibus Coffee',
  sourcePostId: 'manual:abc',
  sourceSliceId: 'manual:abc',
  sourceCreatorId: ANON,
  sourceNoteIds: [],
  savedAt: '2026-10-01T00:00:00.000Z',
  notes: [],
  ...patch,
});

const run = (savedTravelInspirations: SavedTravelInspiration[]) => migrateLocalOwnership({
  anonymousUserId: ANON,
  authenticatedUserId: SIGNED_IN,
  drafts: [],
  tripHistory: [],
  communityPosts: [],
  savedTravelInspirations,
  activeDraftId: null,
});

describe('who the record belongs to after signing in', () => {
  it('renames both the saver and the creator', () => {
    const [record] = run([saved()]).savedTravelInspirations;

    expect(record.savedByUserId).toBe(SIGNED_IN);
    expect(record.sourceCreatorId).toBe(SIGNED_IN);
  });

  it('counts the credit it changed', () => {
    expect(run([saved()]).debug.provenanceChanged).toBe(1);
  });

  it('renames the creator on the notes too', () => {
    const [record] = run([saved({
      notes: [{
        id: 'n1', sourceNoteId: 'n1', sourceSliceId: 's1', sourcePostId: 'p1',
        sourceCreatorId: ANON, type: 'recommendation', text: '手沖很好喝',
      }],
    })]).savedTravelInspirations;

    expect(record.notes[0].sourceCreatorId).toBe(SIGNED_IN);
  });

  /*
    The whole point of the field. Somebody else's recommendation keeps their
    name on it, whoever signs in.
  */
  it('never renames somebody else’s credit', () => {
    const [record] = run([saved({ sourcePostId: 'post-1', sourceCreatorId: 'ann' })])
      .savedTravelInspirations;

    expect(record.savedByUserId).toBe(SIGNED_IN);
    expect(record.sourceCreatorId).toBe('ann');
  });

  /* A record that is nobody's business here is returned untouched. */
  it('leaves a stranger’s record alone', () => {
    const other = saved({ id: 'i2', savedByUserId: 'someone', sourceCreatorId: 'someone' });

    expect(run([other]).savedTravelInspirations[0]).toBe(other);
  });
});
