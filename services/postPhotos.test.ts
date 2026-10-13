/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { MAX_POST_PHOTOS, addPhotos, readForUpload, removePhoto } from './postPhotos';

const photo = (n: number) => `data:image/jpeg;base64,${n}`;

describe('post photos', () => {
  it('adds photos up to the limit', () => {
    const result = addPhotos([photo(1)], [photo(2), photo(3)]);
    expect(result.photos).toHaveLength(3);
    expect(result.rejected).toBe(0);
  });

  it('reports what would not fit instead of dropping it quietly', () => {
    // Someone selecting fifteen photos should be told, not left to count.
    const existing = Array.from({ length: 9 }, (_, index) => photo(index));
    const result = addPhotos(existing, [photo(90), photo(91), photo(92)]);
    expect(result.photos).toHaveLength(MAX_POST_PHOTOS);
    expect(result.rejected).toBe(2);
  });

  it('refuses everything once the post is full', () => {
    const full = Array.from({ length: MAX_POST_PHOTOS }, (_, index) => photo(index));
    const result = addPhotos(full, [photo(99)]);
    expect(result.photos).toEqual(full);
    expect(result.rejected).toBe(1);
  });

  it('removes exactly the photo asked for', () => {
    expect(removePhoto([photo(1), photo(2)], photo(1))).toEqual([photo(2)]);
  });
});

/**
 * 「讀取很久」.
 *
 * The screenshot entry read the file whole and sent it twice — once to
 * classify, once to parse — so a 4 MB screenshot became roughly 11 MB of
 * base64 over a mobile connection before any model had started thinking.
 *
 * Shrinking is an optimisation, so it is never the reason an upload fails.
 */
describe('reading a picture for upload', () => {
  const file = (type = 'image/png') => new File(['x'], 'shot.png', { type });

  /**
   * jsdom has no drawing context, which is exactly the case this guards: with
   * nothing to shrink into, the decode never answers at all, and the timer
   * would be the only thing ending it — five seconds, every upload.
   */
  it('sends the original when the browser cannot shrink it', async () => {
    const payload = await readForUpload(file());

    expect(payload.mimeType).toBe('image/png');
    expect(payload.data.length).toBeGreaterThan(0);
  });

  /** And carries the file's own type, so the parser is told what it is. */
  it('reports the type it actually sent', async () => {
    expect((await readForUpload(file('image/heic'))).mimeType).toBe('image/heic');
  });
});
