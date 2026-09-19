import { describe, expect, it } from 'vitest';
import { statesAPrice, stripPriceClaims } from './priceClaims';

describe('recognising a price stated in prose', () => {
  it('catches the line that started this', () => {
    expect(statesAPrice('2000台幣預算對於兩天一夜的門票與裝備租借明顯不足，建議預算提高至約 4500 台幣。')).toBe(true);
  });

  it('catches the currencies these trips are actually priced in', () => {
    for (const claim of [
      'JPY 12,000 起',
      '約 8000 日圓',
      'NT$3,500',
      '¥15000',
      '門票 1200 元',
      '大約 2 萬日圓',
      'around USD 90 per person',
    ]) {
      expect(statesAPrice(claim), claim).toBe(true);
    }
  });

  it('does not mistake other numbers for money', () => {
    // Durations, distances and counts are everywhere in a plan, and stripping
    // a sentence that merely contains a digit would gut the text.
    for (const innocent of [
      '兩天一夜可以充分享受富士山下的滑雪氛圍。',
      '單程約 1 小時 55 分。',
      '10 月下旬僅有極少數人造雪場開放。',
      '從池袋出發僅需約 40 分鐘。',
      '這個方案需要 2 天。',
    ]) {
      expect(statesAPrice(innocent), innocent).toBe(false);
    }
  });
});

describe('removing price claims from prose', () => {
  it('drops the sentence and keeps the rest', () => {
    const text = '10月下旬日本僅有極少數人造雪場開放。2000台幣預算明顯不足，建議提高至約 4500 台幣。建議安排兩天一夜。';

    expect(stripPriceClaims(text)).toBe('10月下旬日本僅有極少數人造雪場開放。建議安排兩天一夜。');
  });

  it('removes the whole sentence rather than blanking the number', () => {
    // A sentence with a hole in it still tells the reader their budget is
    // wrong, and now looks broken too.
    const stripped = stripPriceClaims('建議預算提高至約 4500 台幣。');
    expect(stripped).toBeUndefined();
  });

  it('leaves prose that never mentions money alone', () => {
    const text = '室內環境不受天候影響，且交通費用極低。';
    expect(stripPriceClaims(text)).toBe(text);
  });

  it('keeps a list intact, since 、 is not a sentence ending', () => {
    const text = '需要準備手套、雪鏡、防水外套。';
    expect(stripPriceClaims(text)).toBe(text);
  });

  it('has nothing to do with empty input', () => {
    expect(stripPriceClaims(undefined)).toBeUndefined();
    expect(stripPriceClaims('')).toBe('');
  });
});
