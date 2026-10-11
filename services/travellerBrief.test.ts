import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_BRIEF, TripPlanBrief } from './tripPlanBrief';
import { travellerBriefText } from './travellerBrief';
import { ParsedRental } from './rentalIntake';

/**
 * 「前面表單填好的資訊可以儲存帶入到這邊」.
 *
 * The car is the part that has to be right: 「是租兩天的車等 但旅行有五天」.
 */

const brief = (over: Partial<TripPlanBrief> = {}): TripPlanBrief => ({
  ...DEFAULT_BRIEF, destination: '日本 沖繩', ...over,
});

const hire: ParsedRental = {
  company: 'OTS レンタカー', pickUpDate: '2026-10-03', dropOffDate: '2026-10-05',
};

describe('carrying the form over', () => {
  it('says how many people and how the day runs', () => {
    const text = travellerBriefText({ brief: brief() });
    expect(text).toContain('2 人同行。');
    expect(text).toContain('每天大約 09:00 開始，一天希望安排 3 個行程。');
  });

  it('says one person as one person, not 1 人同行', () => {
    expect(travellerBriefText({ brief: brief({ travellers: 1 }) })).toContain('一個人旅行。');
  });

  it('passes the traveller’s own words through', () => {
    expect(travellerBriefText({ brief: brief({ notes: '想去咖啡廳' }) }))
      .toContain('使用者補充：想去咖啡廳');
  });

  it('leaves blank notes out rather than sending an empty label', () => {
    expect(travellerBriefText({ brief: brief({ notes: '   ' }) })).not.toContain('使用者補充');
  });
});

describe('the car, which is days and not a mode', () => {
  /**
   * The whole correction: three named days out of five, so the model can
   * suggest driving on exactly those and nothing on the others.
   */
  it('names the days the confirmation covers', () => {
    const text = travellerBriefText({ brief: brief({ transport: ['drive'] }), rentals: [hire] });
    expect(text).toContain('2026-10-03、2026-10-04、2026-10-05 這 3 天有租車（OTS レンタカー）');
  });

  it('never reports the hire as a blanket travel mode', () => {
    const text = travellerBriefText({ brief: brief({ transport: ['drive'] }), rentals: [hire] });
    expect(text).not.toContain('主要交通方式：開車');
  });

  it('says what the other days use', () => {
    const text = travellerBriefText({
      brief: brief({ transport: ['drive', 'transit'] }), rentals: [hire],
    });
    expect(text).toContain('其餘日子主要使用：大眾運輸。');
  });

  /** Two hires over two stretches are two facts; merging them claims the gap. */
  it('lists two separate hires separately', () => {
    const text = travellerBriefText({
      brief: brief(),
      rentals: [hire, { company: 'Hertz', pickUpDate: '2026-10-08', dropOffDate: '2026-10-08' }],
    });
    expect(text).toContain('OTS レンタカー');
    expect(text).toContain('Hertz');
    expect(text).not.toContain('2026-10-06');
  });

  /**
   * 開車 ticked with nothing uploaded is a maybe, and is said as one — the
   * planner should ask rather than assume a car it has no dates for.
   */
  it('calls an unconfirmed car a maybe, and asks', () => {
    const text = travellerBriefText({ brief: brief({ transport: ['drive'] }) });
    expect(text).toContain('沒有上傳租車訂單');
    expect(text).toContain('請先問過他');
  });

  it('says nothing uncertain when driving was never mentioned', () => {
    const text = travellerBriefText({ brief: brief({ transport: ['walk', 'transit'] }) });
    expect(text).toContain('主要交通方式：步行、大眾運輸。');
    expect(text).not.toContain('請先問過他');
  });

  /** A half-read confirmation claims no days, so it contributes nothing. */
  it('ignores a hire with only one end', () => {
    const text = travellerBriefText({
      brief: brief(), rentals: [{ company: 'Hertz', pickUpDate: '2026-10-03' }],
    });
    expect(text).not.toContain('Hertz');
  });
});

describe('when there is nothing to say', () => {
  /**
   * A sentence that says nothing still costs the model attention, and
   * 「沒有特別偏好」 reads like an answer when it is the absence of one.
   */
  it('is empty, not polite', () => {
    expect(travellerBriefText({})).toBe('');
    expect(travellerBriefText({ brief: null, rentals: [] })).toBe('');
  });

  it('still carries a hire when the form was never filled in', () => {
    expect(travellerBriefText({ rentals: [hire] })).toContain('這 3 天有租車');
  });
});

/**
 * The sentence has to reach the model, not just exist.
 *
 * Tonight already produced three tiles that led nowhere; a brief that is
 * built and never sent is the same fault wearing a different shape.
 */
describe('it actually reaches the prompt', () => {
  const read = (path: string) =>
    readFileSync(resolve(__dirname, path), 'utf8');

  it('is sent on both of the planner’s requests', () => {
    const overview = read('../components/TripPlanOverview.tsx');
    expect(overview.split('travellerBrief,').length - 1).toBe(2);
  });

  it('is built once and given to both of its mount sites', () => {
    const app = read('../App.tsx');
    expect(app.split('travellerBrief={travellerBrief}').length - 1).toBe(2);
  });

  it('is read by the server and written into the prompt', () => {
    const server = read('../server.ts');
    expect(server).toContain('req.body?.travellerBrief');
    expect(server).toContain('${travellerBrief}');
  });

  /**
   * The rule the correction demands: a car on three of five days must not
   * become a car for the whole trip once a model is reading it.
   */
  it('tells the model the car days are only the ones listed', () => {
    expect(read('../server.ts')).toContain('不要假設整趟都有車');
  });
});
