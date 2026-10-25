/**
 * What a stranger may see, and what they may not.
 *
 * Every rule here was a Founder decision. The one that matters most is the
 * one his own share sheet words: 「我撰寫的心得筆記」 — a place saved from
 * somebody's post carries *their* sentence about it, attributed to them, and
 * publishing that republishes a third party's writing on a decision they
 * never made.
 */
import { describe, expect, it } from 'vitest';
import { itemsForLink, ownNotes, publishableItem, publishableItems, statedCreatorOf } from './collectionPublish';
import { SavedExperienceNote, SavedTravelInspiration } from '../types';

const ME = 'me';
const ANN = 'ann';

const note = (creator: string, text: string): SavedExperienceNote => ({
  id: `n-${creator}-${text}`,
  sourceNoteId: `n-${creator}-${text}`,
  sourceSliceId: 's1',
  sourcePostId: 'post-tokyo',
  sourceCreatorId: creator,
  type: 'recommendation',
  text,
});

const place = (patch: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id: 'i1',
  savedByUserId: ME,
  country: '日本',
  city: '東京',
  placeName: 'Onibus Coffee',
  placeId: 'g-onibus',
  formattedAddress: '東京都目黒區',
  latitude: 35.64,
  longitude: 139.69,
  placePhotoUrl: 'https://example/photo.jpg',
  category: 'cafe',
  district: '中目黑',
  sourcePostId: 'post-tokyo',
  sourceSliceId: 's1',
  sourceCreatorId: ANN,
  sourceNoteIds: [],
  savedAt: '2026-10-01T00:00:00.000Z',
  notes: [],
  ...patch,
});

const collection = (patch = {}) => ({
  id: 'c1', ownerId: ME,
  sharesOwnNotes: true, sharesPhotos: true, sharesPlaceDetails: true,
  ...patch,
});

let seq = 0;
const makeId = () => `new-${seq += 1}`;

describe('whose words get republished', () => {
  it('publishes the owner’s own notes', () => {
    const item = publishableItem(
      place({ notes: [note(ME, '手沖很好喝')] }), collection(), 0, makeId,
    );

    expect(item.notes.map(entry => entry.text)).toEqual(['手沖很好喝']);
  });

  /* The rule. Ann's sentence is Ann's to publish, not the curator's. */
  it('never publishes somebody else’s', () => {
    const item = publishableItem(
      place({ notes: [note(ANN, '座位很少'), note(ME, '手沖很好喝')] }),
      collection(), 0, makeId,
    );

    expect(item.notes.map(entry => entry.text)).toEqual(['手沖很好喝']);
  });

  it('publishes none at all when the switch is off', () => {
    const item = publishableItem(
      place({ notes: [note(ME, '手沖很好喝')] }),
      collection({ sharesOwnNotes: false }), 0, makeId,
    );

    expect(item.notes).toEqual([]);
  });

  it('answers nothing for an owner nobody named', () => {
    expect(ownNotes([note(ME, 'x')], '')).toEqual([]);
  });
});

describe('the switches', () => {
  it('withholds the place details when 餐廳與景點資訊 is off', () => {
    const item = publishableItem(place(), collection({ sharesPlaceDetails: false }), 0, makeId);

    expect(item.placeName).toBe('Onibus Coffee');
    expect(item).not.toHaveProperty('formattedAddress');
    expect(item).not.toHaveProperty('latitude');
    expect(item).not.toHaveProperty('category');
    expect(item).not.toHaveProperty('district');
    /* Still findable: the name, the country and the city are what it is. */
    expect([item.country, item.city]).toEqual(['日本', '東京']);
  });

  it('withholds the photo when 照片 is off', () => {
    expect(publishableItem(place(), collection({ sharesPhotos: false }), 0, makeId))
      .not.toHaveProperty('placePhotoUrl');
  });
});

describe('who found it', () => {
  it('keeps the original creator through a re-share', () => {
    const item = publishableItem(place(), collection(), 0, makeId);

    expect(item.sourceCreatorId).toBe(ANN);
    expect(item.sourceInspirationId).toBe('i1');
  });

  /*
    A place typed into the search box names the saver as its own creator,
    which is a statement that nobody recommended it. Carrying that forward is
    how 「來自 X」 ends up naming the person reading it.
  */
  it('credits nobody for a place the owner found themselves', () => {
    for (const marker of ['manual:g-onibus', 'screenshot:abc']) {
      const item = publishableItem(
        place({ sourcePostId: marker, sourceCreatorId: ME }), collection(), 0, makeId,
      );
      expect(item).not.toHaveProperty('sourceCreatorId');
    }
    expect(statedCreatorOf(place({ sourceCreatorId: ME }))).toBeUndefined();
  });
});

describe('a whole collection', () => {
  it('numbers the places in the order it was given', () => {
    const items = publishableItems(
      [place({ id: 'a' }), place({ id: 'b' }), place({ id: 'c' })], collection(), makeId,
    );

    expect(items.map(item => item.position)).toEqual([0, 1, 2]);
    expect(items.map(item => item.sourceInspirationId)).toEqual(['a', 'b', 'c']);
  });

  it('drops a record with no name to publish', () => {
    expect(publishableItems([place({ placeName: '  ' })], collection(), makeId)).toEqual([]);
  });
});

/**
 * 「發布之後再改成員，線上那份不會跟著變」.
 *
 * The snapshot a link reads follows the list. The owner cannot see the
 * difference — their own screen reads the local list — so the rule has to
 * hold without anybody checking it.
 */
describe('itemsForLink', () => {
  const shared = (patch = {}) => collection({ visibility: 'public', ...patch }) as never;

  it('rewrites the snapshot from whatever the list now holds', () => {
    const items = itemsForLink(shared(), [place({ id: 'a' }), place({ id: 'b' })], makeId);

    expect(items?.map(item => item.sourceInspirationId)).toEqual(['a', 'b']);
  });

  /* An emptied public collection is an empty snapshot, not a stale one. */
  it('publishes an empty list as empty', () => {
    expect(itemsForLink(shared(), [], makeId)).toEqual([]);
  });

  it('sends nothing at all for a private collection', () => {
    expect(itemsForLink(shared({ visibility: 'private' }), [place()], makeId)).toBeNull();
  });

  /*
    Revoked is not deleted. An empty upload here would take away what the
    owner still owns, on a collection they may yet publish again.
  */
  it('sends nothing at all for a revoked one', () => {
    const revoked = shared({ revokedAt: '2026-10-20T00:00:00.000Z' });
    expect(itemsForLink(revoked, [place()], makeId)).toBeNull();
  });
});
