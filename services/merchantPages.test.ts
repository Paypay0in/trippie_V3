/**
 * 「這個點進去明顯是錯誤」.
 *
 * `roomie.tw/posts/157366` was quoted as a Taiwanese price of NT$389, and it
 * passed every check: the address says Taiwan, the page opened, and the page
 * published a `Product` with a price. It is an article, and the 389 belongs
 * to something else mentioned in it.
 */
import { describe, expect, it } from 'vitest';
import { looksEditorial } from './merchantPages';

describe('writing about a thing, or selling it', () => {
  it('knows the article the Founder clicked', () => {
    expect(looksEditorial('https://www.roomie.tw/posts/157366')).toBe(true);
  });

  it('knows a shop selling the same product', () => {
    expect(looksEditorial('https://shiro-shiro.tw/products/essence-lip_1')).toBe(false);
    expect(looksEditorial('https://shop.muji.tw/SalePage/Index/8920730')).toBe(false);
    expect(looksEditorial('https://store.shopping.yahoo.co.jp/kirindo/4987188116036.html')).toBe(false);
  });

  /* The shape is the same whatever language the publisher writes in. */
  it('reads the path as well as the host', () => {
    expect(looksEditorial('https://example.com/blog/best-sunscreen-2026')).toBe(true);
    expect(looksEditorial('https://example.com/news/12345')).toBe(true);
    expect(looksEditorial('https://example.com/review/anessa')).toBe(true);
    expect(looksEditorial('https://example.com/article/anessa')).toBe(true);
  });

  /*
    A shop whose products live under a path that merely contains one of those
    words is not an article: the segment has to be the segment.
  */
  it('does not mistake a product path for an article', () => {
    expect(looksEditorial('https://example.com/products/newsstand-mug')).toBe(false);
    expect(looksEditorial('https://example.com/item/storybook-lamp')).toBe(false);
  });

  it('survives something that is not a URL', () => {
    expect(looksEditorial('not a url')).toBe(false);
    expect(looksEditorial('')).toBe(false);
  });
});
