import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { entryPoints, worthListing } from './entryPoints';

/**
 * 「我到現在都覺得這個提示寫太長。這些資訊不能用條列式 1.2.3 重點說明就好嗎」.
 */

describe('rules researched with points', () => {
  it('uses them as written', () => {
    expect(entryPoints({ points: ['持台灣護照可免簽 90 天', '出發前至外務省官網確認'] }))
      .toEqual(['持台灣護照可免簽 90 天', '出發前至外務省官網確認']);
  });

  it('drops blanks rather than showing an empty bullet', () => {
    expect(entryPoints({ points: ['免簽 90 天', '   ', ''] })).toEqual(['免簽 90 天']);
  });

  it('prefers points over a paragraph when both are there', () => {
    expect(entryPoints({ points: ['免簽 90 天'], description: '很長的一段話。又一句。' }))
      .toEqual(['免簽 90 天']);
  });
});

describe('rules already stored as a paragraph', () => {
  /** Nobody should have to re-run a search to stop reading prose. */
  it('splits the paragraph into sentences', () => {
    const points = entryPoints({
      description: '這是日本官方提供的入境預先登記系統。旅客可事先在線上填寫入境審查及海關申報。自 2024 年起已整合為單一 QR Code。',
    });
    expect(points).toHaveLength(3);
    expect(points[0]).toBe('這是日本官方提供的入境預先登記系統。');
    expect(points[2]).toContain('單一 QR Code');
  });

  /**
   * Not on commas. 「入境審查及海關申報，填寫完成後產生 QR Code」 is one
   * instruction, and cutting it makes two halves that each sound complete.
   */
  it('does not cut an instruction at its comma', () => {
    const points = entryPoints({ description: '旅客可事先填寫入境審查，填寫完成後會產生 QR Code。' });
    expect(points).toHaveLength(1);
  });

  /** A split URL is a link that goes nowhere and looks like it should. */
  it('keeps a url whole', () => {
    const points = entryPoints({
      description: '請至官網確認。網址 https://www.vjw.digital.go.jp/main/#/top 最新公告。',
    });
    expect(points.some(point => point.includes('https://www.vjw.digital.go.jp/main/#/top')))
      .toBe(true);
  });

  it('is nothing when there is nothing to say', () => {
    expect(entryPoints({})).toEqual([]);
    expect(entryPoints({ description: '   ' })).toEqual([]);
  });
});

describe('whether to draw it as a list', () => {
  /**
   * A single short sentence is not a list of one — numbering it adds a
   * character and takes away the directness it already had.
   */
  it('leaves one short point alone', () => {
    expect(worthListing(['需要回程機票證明'])).toBe(false);
  });

  it('lists two or more', () => {
    expect(worthListing(['免簽 90 天', '出發前確認'])).toBe(true);
  });

  /**
   * One point is never a list, however long it runs. An earlier version
   * bulleted a long single sentence, which was a magic number doing nothing.
   */
  it('leaves one long sentence alone too', () => {
    expect(worthListing(['持中華民國普通護照且護照內載有國民身分證統一編號者，赴日從事觀光可享 90 日免簽證待遇']))
      .toBe(false);
  });

  it('draws nothing for nothing', () => {
    expect(worthListing([])).toBe(false);
  });
});

/**
 * Short at the source, not only on screen.
 *
 * Splitting a paragraph rescues what is already stored; it does not stop the
 * next search writing another one. The research has to ask for points.
 */
describe('the research asks for points', () => {
  const SERVER = readFileSync(resolve(__dirname, '../server.ts'), 'utf8');

  it('offers the model a points array to fill', () => {
    expect(SERVER).toContain('points: { type: Type.ARRAY, items: { type: Type.STRING } }');
  });

  it('tells it how short, and why', () => {
    expect(SERVER).toContain('2 到 4 個短句');
    expect(SERVER).toContain('不要用 description 欄位');
    expect(SERVER).toContain('整段文字會被跳過');
  });

  it('keeps the points it is given', () => {
    expect(SERVER).toContain('points: Array.isArray(action?.points)');
  });
});

describe('the card draws them', () => {
  const CARD = readFileSync(
    resolve(__dirname, '../components/EntryRequirementsChecklist.tsx'), 'utf8',
  );

  it('uses the shared rule rather than reading description itself', () => {
    expect(CARD).toContain('entryPoints(action)');
    expect(CARD).not.toContain('{action.description}');
  });

  it('numbers them, which is what was asked for', () => {
    expect(CARD).toContain('list-decimal');
  });
});
