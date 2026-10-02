/**
 * 「住房資訊重複了好幾個，要自動 pop up 詢問用戶哪個是正確的」.
 *
 * His stays card, exactly as it looked: one hotel entered twice, once under its
 * Chinese name and once under its English one, leaving four cards for one room.
 */
import { describe, expect, it } from 'vitest';
import { findStayConflicts, idsToDropAsCopies, idsToDropForChoice, stayPropertyName } from './stayConflicts';
import { ItineraryItem } from '../types';

const stay = (over: Partial<ItineraryItem>): ItineraryItem => ({
  id: 's', time: '21:55', title: '', location: '', notes: '', type: 'HOTEL',
  date: '2026-10-02', fixedEventKind: 'accommodation', ...over,
});

/** The four cards on his screen. */
const cards = [
  stay({ id: 'in-kent-1', title: '入住 Kent Hotel Gwangalli by Kensington' }),
  stay({ id: 'in-kent-2', title: '入住 Kent Hotel Gwangalli by Kensington' }),
  stay({ id: 'out-cn', date: '2026-10-07', time: '11:00', title: '退房 廣安里凱星頓特酒店' }),
  stay({ id: 'out-kent', date: '2026-10-07', time: '11:00', title: '退房 Kent Hotel Gwangalli by Kensington' }),
];

describe('找出互相矛盾的住宿', () => {
  it('同一天的入住與退房各自被認出是重複的', () => {
    expect(findStayConflicts(cards).map(conflict => conflict.id))
      .toEqual(['2026-10-02|check_in', '2026-10-07|check_out']);
  });

  it('名字完全不一樣也抓得到——靠的是同一個時段，不是字面相似', () => {
    const checkout = findStayConflicts(cards).find(conflict => conflict.role === 'check_out');

    expect(checkout?.items.map(stayPropertyName))
      .toEqual(['廣安里凱星頓特酒店', 'Kent Hotel Gwangalli by Kensington']);
  });

  it('只有一筆住宿時不問問題', () => {
    expect(findStayConflicts([cards[0], cards[3]])).toEqual([]);
  });

  it('不是住宿的項目不算', () => {
    const flight = stay({ id: 'f', type: 'FLIGHT', fixedEventKind: undefined, title: '航班起飛' });

    expect(findStayConflicts([cards[0], flight])).toEqual([]);
  });

  it('沒有日期的住宿不會被湊成一組', () => {
    expect(findStayConflicts([stay({ id: 'a', date: undefined, title: '入住 某民宿' }), stay({ id: 'b', date: undefined, title: '入住 另一間' })]))
      .toEqual([]);
  });
});

describe('選了之後要刪掉什麼', () => {
  const conflicts = findStayConflicts(cards);

  it('留下 Kent，中文名那張就該走', () => {
    expect(idsToDropForChoice(conflicts, 'Kent Hotel Gwangalli by Kensington')).toEqual(['out-cn']);
  });

  it('同一間重複輸入的副本也一起清掉，只留第一張', () => {
    expect(idsToDropAsCopies(conflicts, 'Kent Hotel Gwangalli by Kensington')).toEqual(['in-kent-2']);
  });

  it('四張卡片最後剩下一組入住與退房', () => {
    const dropped = new Set([
      ...idsToDropForChoice(conflicts, 'Kent Hotel Gwangalli by Kensington'),
      ...idsToDropAsCopies(conflicts, 'Kent Hotel Gwangalli by Kensington'),
    ]);

    expect(cards.filter(card => !dropped.has(card.id)).map(card => card.id)).toEqual(['in-kent-1', 'out-kent']);
  });

  it('改留中文名那間，刪掉的就反過來', () => {
    expect(idsToDropForChoice(conflicts, '廣安里凱星頓特酒店').sort())
      .toEqual(['in-kent-1', 'in-kent-2', 'out-kent']);
  });

  it('沒有選擇就不刪任何東西', () => {
    expect(idsToDropForChoice(conflicts, '  ')).toEqual([]);
  });
});
