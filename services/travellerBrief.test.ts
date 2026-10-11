import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_BRIEF, TripPlanBrief } from './tripPlanBrief';
import { briefChips, promptSuggestions, travellerBriefText } from './travellerBrief';
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

/**
 * 「需求表單填完要被帶入進去」 — said about a screen where it already was.
 *
 * The sentence goes into the prompt and nowhere else, so from the outside it
 * is indistinguishable from not being carried at all. These are about it
 * being visible, which is the half that was missing.
 */
describe('what the traveller can see', () => {
  it('shows the people, the start and the pace', () => {
    expect(briefChips({ brief: brief() })).toEqual(['2 人', '09:00 出發', '一天 3 個行程', '步行', '大眾運輸']);
  });

  it('counts the days with a car rather than saying 開車', () => {
    const chips = briefChips({ brief: brief({ transport: ['drive'] }), rentals: [hire] });
    expect(chips).toContain('3 天有車');
    expect(chips).not.toContain('開車');
  });

  /**
   * Saying both would make a five-day trip sound driven when the car covers
   * three days — the distinction this whole feature turns on.
   */
  it('keeps the other modes beside the car days', () => {
    const chips = briefChips({ brief: brief({ transport: ['drive', 'transit'] }), rentals: [hire] });
    expect(chips).toContain('3 天有車');
    expect(chips).toContain('大眾運輸');
    expect(chips).not.toContain('開車');
  });

  /** 開車 with no confirmation is all we know, so it is what is shown. */
  it('says 開車 when there is no confirmation to count days from', () => {
    expect(briefChips({ brief: brief({ transport: ['drive'] }) })).toContain('開車');
  });

  it('says one person as one person', () => {
    expect(briefChips({ brief: brief({ travellers: 1 }) })[0]).toBe('一個人');
  });

  /**
   * A trip created before the form existed carries nothing, and the card says
   * so rather than showing an empty strip that looks the same as carried.
   */
  it('is empty when there was no form', () => {
    expect(briefChips({})).toEqual([]);
  });

  it('still shows the car days when only a hire was uploaded', () => {
    expect(briefChips({ rentals: [hire] })).toEqual(['3 天有車']);
  });
});

describe('the card shows them', () => {
  const CARD = readFileSync(
    resolve(__dirname, '../components/TripPlanOverview.tsx'), 'utf8',
  );

  it('renders the chips', () => {
    expect(CARD).toContain('data-testid="plan-brief-chips"');
    expect(CARD).toContain('會一起告訴 AI');
  });

  /** Silence looks the same as carried; it must not be silent. */
  it('says plainly when there is no brief to carry', () => {
    expect(CARD).toContain('這趟還沒有旅行計畫表單');
  });

  it('is given them at both mount sites', () => {
    const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    expect(app.split('briefChips={planBriefChips}').length - 1).toBe(2);
  });
});

/**
 * 「這些要存在 即使你有其他的提示詞出現 且提示詞是延續這些表單來的
 *   你要在這個欄位去引導用戶給你資訊 你才能幫他完整行程」.
 *
 * Every question below has to trace back to something the form said, and ask
 * the one thing that answer leaves open. A list of pleasant openers would
 * pass a test that only counted them.
 */
describe('what to ask next, and where it comes from', () => {
  /**
   * The shape of every day depends on which ones have a car, nothing in the
   * app knows, and only the traveller can say.
   */
  it('asks which days from 開車, until a confirmation answers it', () => {
    expect(promptSuggestions({ brief: brief({ transport: ['drive'] }) }))
      .toContain('開車是哪幾天？');
    expect(promptSuggestions({ brief: brief({ transport: ['drive'] }), rentals: [hire] }))
      .not.toContain('開車是哪幾天？');
  });

  it('does not ask about a car nobody mentioned', () => {
    expect(promptSuggestions({ brief: brief({ transport: ['walk'] }) }))
      .not.toContain('開車是哪幾天？');
  });

  /** A rhythm with no subject: the form set the pace and never the point. */
  it('asks what the trip is about when 補充描述 is empty', () => {
    expect(promptSuggestions({ brief: brief({ transport: ['walk'] }) }))
      .toContain('想以美食、景點還是購物為主？');
  });

  it('stops asking once they have written it', () => {
    expect(promptSuggestions({ brief: brief({ transport: ['walk'], notes: '想泡溫泉' }) }))
      .not.toContain('想以美食、景點還是購物為主？');
  });

  /** 3 人 says how many and never who — and that changes what is worth proposing. */
  it('asks who the third person is', () => {
    expect(promptSuggestions({ brief: brief({ transport: ['walk'], travellers: 3 }) }))
      .toContain('有長輩或小孩同行嗎？');
    expect(promptSuggestions({ brief: brief({ transport: ['walk'], travellers: 2 }) }))
      .not.toContain('有長輩或小孩同行嗎？');
  });

  /** What must not be dropped when a packed day runs over is theirs to say. */
  it('asks what is fixed when they asked for a full day', () => {
    expect(promptSuggestions({ brief: brief({ transport: ['walk'], pace: 4 }) }))
      .toContain('有哪幾個點一定要排？');
  });

  it('asks where the slack goes when they asked for a light one', () => {
    expect(promptSuggestions({ brief: brief({ transport: ['walk'], pace: 2 }) }))
      .toContain('想留哪一天完全放空？');
  });

  /** Passes are bought before the first ride, not during it. */
  it('asks about passes from 大眾運輸', () => {
    expect(promptSuggestions({ brief: brief({ transport: ['transit'] }) }))
      .toContain('要先買交通卡或一日券嗎？');
  });

  /** A row of six questions is a form the traveller did not agree to fill twice. */
  it('never shows more than three', () => {
    const asks = promptSuggestions({
      brief: brief({ transport: ['drive', 'transit'], travellers: 4, pace: 4 }),
    });
    expect(asks.length).toBeLessThanOrEqual(3);
    expect(asks[0]).toBe('開車是哪幾天？');
  });

  /** The only case with nothing to continue from. */
  it('falls back to openers when there is no form', () => {
    expect(promptSuggestions({})).toEqual(['想找咖啡廳', '想逛美術館', '想去當地市集']);
  });
});

/**
 * 「這些要存在 即使你有其他的提示詞出現」.
 *
 * The chips are what the traveller can see being carried; the suggestions
 * come and go with the box. Tying the two together is the easy mistake —
 * a row that disappears while somebody types takes the evidence with it.
 */
describe('the chips outlive everything beside them', () => {
  const CARD = readFileSync(resolve(__dirname, '../components/TripPlanOverview.tsx'), 'utf8');

  it('shows the chips on their own count, not on the box being empty', () => {
    const chips = CARD.indexOf('{briefChips.length > 0 ?');
    expect(chips).toBeGreaterThan(-1);
    // The condition is the chips themselves; nothing about `prompt` is in it.
    expect(CARD.slice(chips, chips + 60)).not.toContain('prompt');
  });

  it('is the suggestions that hide while typing, not the chips', () => {
    expect(CARD).toContain('!prompt.trim() && promptSuggestions.length > 0');
  });
});

describe('the box shows them', () => {
  const CARD = readFileSync(resolve(__dirname, '../components/TripPlanOverview.tsx'), 'utf8');

  it('renders them under the input', () => {
    expect(CARD).toContain('data-testid="plan-prompt-suggestions"');
  });

  /** Tapping writes it; a placeholder vanishes the moment anybody types. */
  it('writes the suggestion into the box rather than hinting', () => {
    expect(CARD).toContain('onClick={() => setPrompt(suggestion)}');
  });

  it('hides them once the box has something in it', () => {
    expect(CARD).toContain('!prompt.trim() && promptSuggestions.length > 0');
  });

  it('is given them at both mount sites', () => {
    const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    expect(app.split('promptSuggestions={planPromptSuggestions}').length - 1).toBe(2);
  });
});
