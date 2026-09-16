import { describe, expect, it } from 'vitest';
import { MAX_POST_PHOTOS, addPhotos, removePhoto } from './postPhotos';

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
