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
    expect(SERVER).toContain('最多 3 句');
    expect(SERVER).toContain('不要用 description 欄位');
    expect(SERVER).toContain('整段文字會被跳過');
  });

  /**
   * 「要給用戶行動指令跟確定的答案 我覺得免簽就免簽 不要叫他自己查」.
   *
   * The card that prompted this said 「無法確認現況，請於出發前至官方網站查詢」
   * where the answer should have been — which is the app handing the
   * question back to the person who opened it to avoid asking it.
   */
  it('demands an answer first, not an instruction to go and check', () => {
    expect(SERVER).toContain('第一句必須是旅客的結論或動作');
    expect(SERVER).toContain('旅客打開這個 app 就是為了不用自己查');
  });

  it('still allows 「no official source found」 when that is the truth', () => {
    expect(SERVER).toContain('只有在這次搜尋真的找不到任何官方說法時');
  });

  it('keeps the points it is given', () => {
    expect(SERVER).toContain('points: Array.isArray(action?.points)');
  });
});

/**
 * The card that is actually on screen.
 *
 * An earlier version of this file checked EntryRequirementsChecklist.tsx,
 * which nothing imports — so it passed while the rules the traveller reads
 * were untouched. The component has been deleted; a dead renderer beside a
 * live one is a trap for whoever fixes this next.
 */
describe('the card draws them', () => {
  const CARD = readFileSync(resolve(__dirname, '../components/TripPlanOverview.tsx'), 'utf8');

  it('uses the shared rule rather than reading description itself', () => {
    expect(CARD).toContain('entryPoints({ description: ruleTask.description })');
  });

  it('numbers them, which is what was asked for', () => {
    expect(CARD).toContain('list-decimal');
  });
});

describe('three at most', () => {
  it('keeps only three written points', () => {
    expect(entryPoints({ points: ['一', '二', '三', '四'] })).toEqual(['一', '二', '三']);
  });

  /** Old paragraphs lose their tail, which is the cost of the rule. */
  it('keeps only the first three sentences of an old paragraph', () => {
    const points = entryPoints({ description: '第一句。第二句。第三句。第四句。' });
    expect(points).toEqual(['第一句。', '第二句。', '第三句。']);
  });
});

/**
 * The regression I caused: the research was changed to write `points` and
 * told 「不要用 description 欄位」, while the only thing that renders a rule
 * reads `description`. The cards came back with a title, a link and no words.
 */
describe('points reach the card that renders them', () => {
  const APP = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');

  it('does not read description straight off the action any more', () => {
    expect(APP).not.toContain('description: action.description');
  });

  it('runs all three merge paths through one rule', () => {
    expect(APP.split('description: ruleText(action)').length - 1).toBe(3);
  });

  /**
   * Joined rather than carried as an array: a new field on ShoppingItem would
   * need the autosave, the hydrate and the loader's hand-written rebuild, and
   * the third is the one that was dropping planBrief an hour ago.
   */
  it('joins the points so the display can split them again', () => {
    expect(APP).toContain("const ruleText = (action: EntryActionableItem)");
    expect(APP).toContain('/[。！？.]$/.test(point)');
  });
});
