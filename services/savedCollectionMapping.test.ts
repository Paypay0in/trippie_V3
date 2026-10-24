/**
 * 收藏集 rows, in and out.
 *
 * Tested apart from the transport because every defect this project has had
 * in a sync path turned out to live in the mapping rather than in the
 * network call.
 */
import { describe, expect, it } from 'vitest';
import {
  fromCollectionItemRow,
  fromCollectionRow,
  toCollectionItemRow,
  toCollectionRow,
  visibilityOf,
} from './savedCollectionMapping';
import { SavedCollection, SavedCollectionItem } from '../types';

const collection = (patch: Partial<SavedCollection> = {}): SavedCollection => ({
  id: 'c1',
  ownerId: 'u1',
  title: '東京咖啡地圖',
  country: '日本',
  city: '東京',
  visibility: 'private',
  sharesOwnNotes: true,
  sharesPhotos: true,
  sharesPlaceDetails: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...patch,
});

describe('a collection row', () => {
  it('carries what was set, and says nothing about what was not', () => {
    const back = fromCollectionRow(toCollectionRow(collection({
      description: '在東京找了很多間咖啡廳',
      visibility: 'link',
      shareToken: 'tok-1',
      publishedAt: '2026-10-02T00:00:00.000Z',
    })));

    expect(back.description).toBe('在東京找了很多間咖啡廳');
    expect(back.visibility).toBe('link');
    expect(back.shareToken).toBe('tok-1');
    expect(back).not.toHaveProperty('coverUrl');
    expect(back).not.toHaveProperty('revokedAt');
  });

  /*
    The safe direction. A row written by a build that knew a word this one
    does not must not become readable by accident, and 私人 is the only
    answer that cannot leak anything.
  */
  it('reads a visibility it does not recognise as 私人', () => {
    expect(visibilityOf('friends')).toBe('private');
    expect(visibilityOf(null)).toBe('private');
    expect(visibilityOf('public')).toBe('public');
    expect(visibilityOf('link')).toBe('link');
  });
});

describe('a collection item row', () => {
  const item = (patch: Partial<SavedCollectionItem> = {}): SavedCollectionItem => ({
    id: 'i1', collectionId: 'c1', position: 2,
    placeName: 'Onibus Coffee', country: '日本', city: '東京',
    notes: [], ...patch,
  });

  it('carries the lineage', () => {
    const back = fromCollectionItemRow(toCollectionItemRow(item({
      sourceCreatorId: 'ann', sourceInspirationId: 'ins-1',
    })));

    expect(back.sourceCreatorId).toBe('ann');
    expect(back.sourceInspirationId).toBe('ins-1');
    expect(back.position).toBe(2);
  });

  /* A note nobody can attribute is not a note anybody should read. */
  it('drops a note missing any of the ids that attribute it', () => {
    const row = {
      ...toCollectionItemRow(item()),
      notes: [
        { id: 'n1', sourceNoteId: 'n1', sourceSliceId: 's', sourcePostId: 'p', sourceCreatorId: 'ann', type: 'recommendation', text: '好喝' },
        { id: 'n2', sourceNoteId: '', sourceSliceId: 's', sourcePostId: 'p', sourceCreatorId: 'ann', type: 'recommendation', text: '沒有來源' },
      ],
    };

    expect(fromCollectionItemRow(row).notes.map(note => note.id)).toEqual(['n1']);
  });

  it('survives a row with nothing optional in it', () => {
    const back = fromCollectionItemRow({
      id: 'i9', collection_id: 'c1', position: 0, place_id: null,
      place_name: 'Fuglen', formatted_address: null, latitude: null, longitude: null,
      place_photo_url: null, category: null, country: '', city: '', district: null,
      notes: null, source_creator_id: null, source_collection_id: null,
      source_inspiration_id: null,
    });

    expect(back.placeName).toBe('Fuglen');
    expect(back.notes).toEqual([]);
    expect(back).not.toHaveProperty('placeId');
  });
});
