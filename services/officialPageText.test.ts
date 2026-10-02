/**
 * 「K-ETA 回復無法確認現況 這是不專業的回答」.
 *
 * It was. Google Search grounding runs on its own quota and every model
 * answered 429 to it that day, so the lookup fell back to memory, wrote 「無法
 * 確認現況」 and offered a link to k-eta.go.kr — where Korea had posted, on
 * 2025-12-23, that the exemption runs to 2026-12-31. The answer was one HTTP
 * request away from the page it was telling the traveller to go and read.
 *
 * So the server reads it. These are the pieces that decide what it will fetch
 * and what it will feed back.
 */
import { describe, expect, it } from 'vitest';
import { extractReadableText, isFetchableOfficialUrl, officialUrlsFromAnswer } from './officialPageText';

describe('which pages are worth reading', () => {
  it('takes an https site', () => {
    expect(isFetchableOfficialUrl('https://www.k-eta.go.kr/portal/apply/index.do')).toBe(true);
  });

  it('refuses plain http, loopback and raw addresses', () => {
    expect(isFetchableOfficialUrl('http://www.k-eta.go.kr/')).toBe(false);
    expect(isFetchableOfficialUrl('https://localhost/admin')).toBe(false);
    expect(isFetchableOfficialUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isFetchableOfficialUrl('not a url')).toBe(false);
  });
});

describe('the urls an answer names', () => {
  /** The shape the K-ETA answer actually came back in. */
  const answer = {
    entry: {
      summary: '台灣旅客入境韓國短期觀光享免簽證待遇。',
      actionableItems: [
        { title: 'K-ETA', description: '無法確認現況，請至 https://www.k-eta.go.kr/ 查詢', source: { url: 'https://www.k-eta.go.kr/' } },
        { title: '入境卡', source: { url: 'https://www.e-arrivalcard.go.kr/' } },
      ],
    },
    taxRefund: { summary: '…', sources: [{ url: 'https://www.k-eta.go.kr/' }] },
  };

  it('collects each one once, in the order it meets them', () => {
    expect(officialUrlsFromAnswer(answer)).toEqual([
      'https://www.k-eta.go.kr/',
      'https://www.e-arrivalcard.go.kr/',
    ]);
  });

  it('stops at the limit rather than fetching a page per sentence', () => {
    const many = { items: Array.from({ length: 10 }, (_, i) => `https://site${i}.go.kr/`) };
    expect(officialUrlsFromAnswer(many, 3)).toHaveLength(3);
  });

  it('finds nothing to read in an answer with no links', () => {
    expect(officialUrlsFromAnswer({ entry: { summary: '免簽證' } })).toEqual([]);
  });
});

describe('reading a page', () => {
  it('keeps the notice and drops the markup around it', () => {
    const html = `
      <html><head><style>.a{color:red}</style><script>var x=1</script></head>
      <body><div class="notice">대한민국 전자여행허가제(K-ETA) 한시 면제 기간 연장 알림</div>
      <p>2026. 1. 1. ~ 2026. 12. 31.</p></body></html>`;

    const text = extractReadableText(html);

    expect(text).toContain('한시 면제 기간 연장');
    expect(text).toContain('2026. 12. 31.');
    expect(text).not.toContain('var x');
    expect(text).not.toContain('color:red');
  });

  it('caps one page so it cannot crowd out the question', () => {
    expect(extractReadableText(`<p>${'가'.repeat(20000)}</p>`, 500)).toHaveLength(500);
  });
});
