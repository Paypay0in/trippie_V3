/**
 * 「應該之後怎麼樣來做這個搜索引擎好」 — no price comparison site searches the
 * whole web and guesses. They know their shops.
 */
import { describe, expect, it } from 'vitest';
import { isTrustedShop, TRUSTED_SHOPS } from './trustedShops';

describe('shops a traveller would name', () => {
  it('recognises the Japanese ones', () => {
    expect(isTrustedShop('www.matsukiyo.co.jp', 'JP')).toBe(true);
    expect(isTrustedShop('store.shopping.yahoo.co.jp', 'JP')).toBe(true);
    expect(isTrustedShop('item.rakuten.co.jp', 'JP')).toBe(true);
    expect(isTrustedShop('www.askul.co.jp', 'JP')).toBe(true);
  });

  it('recognises the Taiwanese ones', () => {
    expect(isTrustedShop('www.momoshop.com.tw', 'TW')).toBe(true);
    expect(isTrustedShop('24h.pchome.com.tw', 'TW')).toBe(true);
    expect(isTrustedShop('shop.cosmed.com.tw', 'TW')).toBe(true);
    expect(isTrustedShop('shop.muji.tw', 'TW')).toBe(true);
  });

  /*
    False is not a verdict against a page. It only means nothing is known
    about it — and the pages that produced wrong figures were department
    stores and brand indexes, which is exactly what this demotes.
  */
  it('says nothing about a shop it has not heard of', () => {
    expect(isTrustedShop('www.takashimaya.co.jp', 'JP')).toBe(false);
    expect(isTrustedShop('yshop.tw', 'TW')).toBe(false);
    expect(isTrustedShop('www.momoshop.com.tw', 'XX')).toBe(false);
  });

  /* A Japanese shop is not a Taiwanese one. */
  it('keeps each market’s shops to that market', () => {
    expect(isTrustedShop('www.matsukiyo.co.jp', 'TW')).toBe(false);
    expect(isTrustedShop('www.momoshop.com.tw', 'JP')).toBe(false);
  });

  it('names each market once', () => {
    const codes = TRUSTED_SHOPS.map(entry => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
