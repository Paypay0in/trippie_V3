import { describe, expect, it } from 'vitest';
import { slotLabelFor } from './slotLabel';

/**
 * 「午餐的標注要以地點標籤判斷 不是用時間判斷」.
 *
 * 八十八淺草 is a café. Sitting at 18:30 did not make it dinner, and the row
 * said 晚餐 and then asked whether that was really meant — a question the
 * screen only had to ask because it had just asserted something it could see
 * was untrue.
 */
describe('slotLabelFor', () => {
  it('names a café block after the café', () => {
    expect(slotLabelFor({ label: '晚餐', kind: 'meal', category: 'cafe' })).toBe('咖啡');
  });

  it('names a temple block after the temple', () => {
    expect(slotLabelFor({ label: '下午行程', kind: 'activity', category: 'sight' })).toBe('景點');
  });

  /*
    The one case where the clock still says something: 餐廳 at noon is lunch,
    and 午餐 tells a traveller more about their day than 餐廳 does. The two do
    not disagree, so there is nothing to correct.
  */
  it('leaves a restaurant in a meal window called by the meal', () => {
    expect(slotLabelFor({ label: '午餐', kind: 'meal', category: 'food' })).toBe('午餐');
  });

  it('calls a restaurant outside a meal window 用餐', () => {
    expect(slotLabelFor({ label: '下午行程', kind: 'activity', category: 'food' })).toBe('用餐');
  });

  /*
    An empty block has nothing to be named after, and the clock's guess is
    what makes the row suggest restaurants at noon.
  */
  it('keeps the clock for a block with nothing in it', () => {
    expect(slotLabelFor({ label: '晚餐', kind: 'meal' })).toBe('晚餐');
  });

  /* 「I cannot tell what this is」 is not a reason to rename somebody's day. */
  it('keeps the clock when the tag says nothing', () => {
    expect(slotLabelFor({ label: '晚餐', kind: 'meal', category: 'other' })).toBe('晚餐');
  });
});
