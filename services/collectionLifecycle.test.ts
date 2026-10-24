/**
 * Publishing, unpublishing, and what each one means.
 *
 * 「All trips and saved collections are private by default」 is the first
 * approved rule in the ticket, and every assertion below is one of the ways
 * that rule can be broken by accident.
 */
import { describe, expect, it } from 'vitest';
import {
  collectionFromUrl,
  isPublished,
  newCollection,
  publishCollection,
  shareLinkFor,
  unpublishCollection,
} from './collectionLifecycle';

const now = () => '2026-10-24T00:00:00.000Z';
const later = () => '2026-10-25T00:00:00.000Z';
const token = () => 'tok-abc';

const fresh = () => newCollection({ title: '東京咖啡地圖', country: '日本', city: '東京' }, 'me', () => 'c1', now);

describe('a new collection', () => {
  it('is private, unpublished, and has no link', () => {
    const collection = fresh();

    expect(collection.visibility).toBe('private');
    expect(collection).not.toHaveProperty('publishedAt');
    expect(collection).not.toHaveProperty('shareToken');
    expect(isPublished(collection)).toBe(false);
    expect(shareLinkFor(collection, 'https://trippie')).toBeUndefined();
  });
});

describe('publishing', () => {
  it('stamps the date and makes it reachable', () => {
    const published = publishCollection(fresh(), 'public', now, token);

    expect(published.publishedAt).toBe(now());
    expect(isPublished(published)).toBe(true);
    expect(shareLinkFor(published, 'https://trippie')).toBe('https://trippie/?c=c1');
  });

  it('mints a token only for 僅連結', () => {
    expect(publishCollection(fresh(), 'public', now, token)).not.toHaveProperty('shareToken');

    const linked = publishCollection(fresh(), 'link', now, token);
    expect(linked.shareToken).toBe('tok-abc');
    expect(shareLinkFor(linked, 'https://trippie')).toBe('https://trippie/?c=c1&t=tok-abc');
  });

  /*
    Somebody has that link in a message. Quietly invalidating it when the
    owner toggles 公開 and back is a broken promise, not a security measure.
  */
  it('keeps a token it already minted', () => {
    const linked = publishCollection(fresh(), 'link', now, token);
    const opened = publishCollection(linked, 'public', later, () => 'tok-different');
    const relinked = publishCollection(opened, 'link', later, () => 'tok-different');

    expect(relinked.shareToken).toBe('tok-abc');
  });

  /* The original date is when people first saw it. */
  it('does not re-stamp a collection that was already published', () => {
    const first = publishCollection(fresh(), 'public', now, token);
    expect(publishCollection(first, 'public', later, token).publishedAt).toBe(now());
  });
});

describe('unpublishing', () => {
  it('revokes without deleting, and the link stops working', () => {
    const revoked = unpublishCollection(publishCollection(fresh(), 'link', now, token), later);

    expect(revoked.revokedAt).toBe(later());
    expect(revoked.visibility).toBe('private');
    expect(isPublished(revoked)).toBe(false);
    expect(shareLinkFor(revoked, 'https://trippie')).toBeUndefined();
    /* The token survives, so republishing restores the link somebody holds. */
    expect(revoked.shareToken).toBe('tok-abc');
  });

  it('clears the revocation when it is published again', () => {
    const revoked = unpublishCollection(publishCollection(fresh(), 'public', now, token), later);

    expect(publishCollection(revoked, 'public', later, token)).not.toHaveProperty('revokedAt');
  });
});

describe('the address a visitor arrives with', () => {
  it('reads the id and the token', () => {
    expect(collectionFromUrl('?c=c1&t=tok-abc')).toEqual({ id: 'c1', token: 'tok-abc' });
    expect(collectionFromUrl('?c=c1')).toEqual({ id: 'c1' });
  });

  it('says nothing about an address that is not one', () => {
    expect(collectionFromUrl('')).toBeUndefined();
    expect(collectionFromUrl('?join=xyz')).toBeUndefined();
    expect(collectionFromUrl('?c=')).toBeUndefined();
  });
});
