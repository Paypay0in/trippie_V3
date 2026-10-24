/**
 * Somebody else's collection, becoming yours.
 *
 * The last link in the chain §8 asks for, and the one most easily broken:
 * a curator may share a place somebody else found, and the latest sharer's
 * identity must never overwrite the original author's.
 */
import { describe, expect, it } from 'vitest';
import {
  alreadyHeld,
  collectionIdOf,
  isFromCollection,
  savedFromCollection,
  savedFromCollectionItem,
} from './collectionSave';
import { SavedCollectionItem, SavedTravelInspiration } from '../types';

const ME = 'me';
const ANN = 'ann';
const CURATOR = 'ben';

const item = (patch: Partial<SavedCollectionItem> = {}): SavedCollectionItem => ({
  id: 'ci-1', collectionId: 'c1', position: 0,
  placeName: 'Onibus Coffee', placeId: 'g-onibus',
  country: '日本', city: '東京', district: '中目黑',
  formattedAddress: '東京都目黑區', latitude: 35.64, longitude: 139.69,
  category: 'cafe', notes: [], ...patch,
});

const context = {
  savedByUserId: ME, collectionId: 'c1', publisherId: CURATOR,
  makeId: () => 'new-1', now: () => '2026-10-24T00:00:00.000Z',
};

describe('a place saved from a collection', () => {
  it('belongs to the person saving it', () => {
    const saved = savedFromCollectionItem(item(), context);

    expect(saved.savedByUserId).toBe(ME);
    expect(saved.id).toBe('new-1');
    expect(saved.placeName).toBe('Onibus Coffee');
    expect(saved.placeId).toBe('g-onibus');
  });

  /* A curator sharing somebody else's find does not become the finder. */
  it('keeps the original creator through a re-share', () => {
    const saved = savedFromCollectionItem(item({ sourceCreatorId: ANN }), context);

    expect(saved.sourceCreatorId).toBe(ANN);
  });

  it('credits the publisher only where the item credits nobody', () => {
    expect(savedFromCollectionItem(item(), context).sourceCreatorId).toBe(CURATOR);
  });

  /*
    A real source, not a synthetic one. 「manual:…」 means 「nobody recommended
    this」 and a published place is the opposite; everything downstream keys
    off that difference.
  */
  it('says which collection it came from', () => {
    const saved = savedFromCollectionItem(item(), context);

    expect(saved.sourcePostId).toBe('collection:c1');
    expect(saved.sourceSliceId).toBe('ci-1');
    expect(isFromCollection(saved)).toBe(true);
    expect(collectionIdOf(saved)).toBe('c1');
  });

  it('carries the notes with whoever wrote them', () => {
    const saved = savedFromCollectionItem(item({
      notes: [{
        id: 'n1', sourceNoteId: 'n1', sourceSliceId: 's', sourcePostId: 'p',
        sourceCreatorId: ANN, type: 'recommendation', text: '手沖很好喝',
      }],
    }), context);

    expect(saved.notes[0].sourceCreatorId).toBe(ANN);
    expect(saved.sourceNoteIds).toEqual(['n1']);
  });
});

describe('一次收藏整份，或只挑幾個', () => {
  /* One function for both, so one cannot keep provenance the other drops. */
  it('is the same conversion either way', () => {
    let n = 0;
    const many = savedFromCollection(
      [item({ id: 'a' }), item({ id: 'b', placeId: 'g-b' })],
      { ...context, makeId: () => `new-${n += 1}` },
    );

    expect(many).toHaveLength(2);
    expect(many.every(saved => saved.sourcePostId === 'collection:c1')).toBe(true);
  });

  it('drops an item with no name', () => {
    expect(savedFromCollection([item({ placeName: '  ' })], context)).toEqual([]);
  });
});

describe('已經收藏過的地點', () => {
  const held = (patch: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
    id: 'h1', savedByUserId: ME, country: '日本', city: '東京',
    placeName: 'Onibus Coffee', placeId: 'g-onibus',
    sourcePostId: 'manual:x', sourceSliceId: 'manual:x', sourceCreatorId: ME,
    sourceNoteIds: [], savedAt: '2026-10-01T00:00:00.000Z', notes: [], ...patch,
  });

  it('is found by its Google place id', () => {
    expect(alreadyHeld(item(), [held()])?.id).toBe('h1');
  });

  it('falls back to the name only when neither has a place id', () => {
    expect(alreadyHeld(item({ placeId: undefined }), [held({ placeId: undefined })])?.id).toBe('h1');
    /* A place id that disagrees is a different place, whatever it is called. */
    expect(alreadyHeld(item({ placeId: 'g-other' }), [held()])).toBeUndefined();
  });

  it('says nothing about a place nobody holds', () => {
    expect(alreadyHeld(item({ placeId: 'g-new' }), [held()])).toBeUndefined();
  });
});
