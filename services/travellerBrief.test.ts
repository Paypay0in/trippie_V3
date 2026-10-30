import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import i18n from '../i18n/config';
import { DEFAULT_BRIEF, TripPlanBrief } from './tripPlanBrief';
import { briefChips, promptQuestions, travellerBriefText } from './travellerBrief';
import { ParsedRental } from './rentalIntake';

/**
 * 「前面表單填好的資訊可以儲存帶入到這邊」.
 *
 * The car is the part that has to be right: 「是租兩天的車等 但旅行有五天」.
 */

/**
 * The chips and the question headings are asserted through the same keys the
 * code resolves, not through the Chinese they happen to render.
 *
 * The sentences below are unchanged — `t` returns the identical zh-Hant string,
 * which is the language these tests are pinned to. What changes is what a
 * failure means: a hardcoded 「3 天有車」 would keep passing if the chip stopped
 * being translated at all, and would start failing for the wrong reason the day
 * somebody ran the suite in English. The prompt assertions stay hardcoded on
 * purpose — `travellerBriefText` is model input and is still Chinese.
 */
const chip = {
  travellers: (count: number) => i18n.t('plan.brief.chips.travellers', { count }),
  solo: () => i18n.t('plan.brief.chips.solo'),
  dayStart: (time: string) => i18n.t('plan.brief.chips.dayStart', { time }),
  pace: (count: number) => i18n.t('plan.brief.chips.pace', { count }),
  carDays: (count: number) => i18n.t('plan.brief.chips.carDays', { count }),
  mode: (mode: 'WALK' | 'DRIVE' | 'TRANSIT') => i18n.t(`transport.modes.${mode}`),
};

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
    expect(briefChips({ brief: brief() })).toEqual([
      chip.travellers(2), chip.dayStart('09:00'), chip.pace(3), chip.mode('WALK'), chip.mode('TRANSIT'),
    ]);
  });

  it('counts the days with a car rather than saying 開車', () => {
    const chips = briefChips({ brief: brief({ transport: ['drive'] }), rentals: [hire] });
    expect(chips).toContain(chip.carDays(3));
    expect(chips).not.toContain(chip.mode('DRIVE'));
  });

  /**
   * Saying both would make a five-day trip sound driven when the car covers
   * three days — the distinction this whole feature turns on.
   */
  it('keeps the other modes beside the car days', () => {
    const chips = briefChips({ brief: brief({ transport: ['drive', 'transit'] }), rentals: [hire] });
    expect(chips).toContain(chip.carDays(3));
    expect(chips).toContain(chip.mode('TRANSIT'));
    expect(chips).not.toContain(chip.mode('DRIVE'));
  });

  /** 開車 with no confirmation is all we know, so it is what is shown. */
  it('says 開車 when there is no confirmation to count days from', () => {
    expect(briefChips({ brief: brief({ transport: ['drive'] }) })).toContain(chip.mode('DRIVE'));
  });

  it('says one person as one person', () => {
    expect(briefChips({ brief: brief({ travellers: 1 }) })[0]).toBe(chip.solo());
  });

  /**
   * A trip created before the form existed carries nothing, and the card says
   * so rather than showing an empty strip that looks the same as carried.
   */
  it('is empty when there was no form', () => {
    expect(briefChips({})).toEqual([]);
  });

  it('still shows the car days when only a hire was uploaded', () => {
    expect(briefChips({ rentals: [hire] })).toEqual([chip.carDays(3)]);
  });
});

describe('the card shows them', () => {
  const CARD = readFileSync(
    resolve(__dirname, '../components/TripPlanOverview.tsx'), 'utf8',
  );

  it('renders the chips', () => {
    expect(CARD).toContain('data-testid="plan-brief-chips"');
    // The label moved into the locale bundles, so the card holds its key.
    expect(CARD).toContain("t('plan.willTellAi')");
  });

  /** Silence looks the same as carried; it must not be silent. */
  it('says plainly when there is no brief to carry', () => {
    expect(CARD).toContain("t('plan.noBriefYet')");
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
  /** The questions by id, which is how the UI keys them. */
  const ids = (input: Parameters<typeof promptQuestions>[0]) =>
    promptQuestions(input).map(question => question.id);

  /**
   * The shape of every day depends on which ones have a car, nothing in the
   * app knows, and only the traveller can say.
   */
  it('asks which days from 開車, until a confirmation answers it', () => {
    expect(ids({ brief: brief({ transport: ['drive'] }) })).toContain('car-days');
    expect(ids({ brief: brief({ transport: ['drive'] }), rentals: [hire] }))
      .not.toContain('car-days');
  });

  it('does not ask about a car nobody mentioned', () => {
    expect(ids({ brief: brief({ transport: ['walk'] }) })).not.toContain('car-days');
  });

  /** A rhythm with no subject: the form set the pace and never the point. */
  it('asks what the trip is about when 補充描述 is empty', () => {
    expect(ids({ brief: brief({ transport: ['walk'] }) })).toContain('interest');
  });

  it('stops asking once they have written it', () => {
    expect(ids({ brief: brief({ transport: ['walk'], notes: '想泡溫泉' }) }))
      .not.toContain('interest');
  });

  /** 3 人 says how many and never who — and that changes what is worth proposing. */
  it('asks who the third person is', () => {
    expect(ids({ brief: brief({ transport: ['walk'], travellers: 3 }) })).toContain('who');
    expect(ids({ brief: brief({ transport: ['walk'], travellers: 2 }) })).not.toContain('who');
  });

  /** What must not be dropped when a packed day runs over is theirs to say. */
  it('asks what is fixed when they asked for a full day', () => {
    expect(ids({ brief: brief({ transport: ['walk'], pace: 4 }) })).toContain('must');
  });

  it('asks where the slack goes when they asked for a light one', () => {
    expect(ids({ brief: brief({ transport: ['walk'], pace: 2 }) })).toContain('slack');
  });

  /** Passes are bought before the first ride, not during it. */
  it('asks about passes from 大眾運輸', () => {
    expect(ids({ brief: brief({ transport: ['transit'] }) })).toContain('pass');
  });

  /** A row of six questions is a form the traveller did not agree to fill twice. */
  it('never shows more than three', () => {
    const asks = promptQuestions({
      brief: brief({ transport: ['drive', 'transit'], travellers: 4, pace: 4 }),
    });
    expect(asks.length).toBeLessThanOrEqual(3);
    expect(asks[0].id).toBe('car-days');
  });

  /** The only case with nothing to continue from. */
  it('still asks something when there is no form', () => {
    const asks = promptQuestions({});
    expect(asks).toHaveLength(1);
    expect(asks[0].options.length).toBeGreaterThan(1);
  });
});

/**
 * 「這些疑問應該是需要獲得答案的 目前只變成可以點擊勾選的按鈕 應該是要產出能回答
 *   的選項讓用戶來點選 協助AI 了解用戶的需求」.
 *
 * The first version made the question the button. Tapping 「開車是哪幾天？」 sent
 * those five characters to the model, which is the one asking — so the
 * traveller had answered nothing while appearing to, and the planner was no
 * better informed than before the tap.
 *
 * This is the test that would have caught it: a thing you tap has to be an
 * answer.
 */
describe('every option is an answer', () => {
  const EVERY_CASE: Array<Parameters<typeof promptQuestions>[0]> = [
    {},
    { brief: brief({ transport: ['drive'] }) },
    { brief: brief({ transport: ['transit'] }) },
    { brief: brief({ transport: ['walk'], pace: 2 }) },
    { brief: brief({ transport: ['walk'], pace: 4 }) },
    { brief: brief({ transport: ['walk'], travellers: 3 }) },
  ];

  it('never offers a question as something to tap', () => {
    for (const input of EVERY_CASE) {
      for (const question of promptQuestions(input)) {
        for (const option of question.options) {
          expect(option).not.toContain('？');
          expect(option).not.toContain('?');
          // 「嗎」「哪」 are how the questions here are phrased; an option
          // carrying one is a question wearing an answer's place.
          expect(option).not.toContain('嗎');
        }
      }
    }
  });

  /** A question with one answer is a statement nobody chose. */
  it('gives every question at least two answers', () => {
    for (const input of EVERY_CASE) {
      for (const question of promptQuestions(input)) {
        expect(question.options.length).toBeGreaterThan(1);
        expect(question.question).toContain('？');
      }
    }
  });

  /** The ids key the rows; two of the same would drop one. */
  it('never repeats an id', () => {
    for (const input of EVERY_CASE) {
      const seen = promptQuestions(input).map(question => question.id);
      expect(new Set(seen).size).toBe(seen.length);
    }
  });
});

/**
 * 「這些要存在 即使你有其他的提示詞出現」.
 *
 * The chips are what the traveller can see being carried; the questions come
 * and go with what the form left open. Tying the two together is the easy
 * mistake — a row that disappears while somebody types takes the evidence
 * with it.
 */
describe('the chips outlive everything beside them', () => {
  const CARD = readFileSync(resolve(__dirname, '../components/TripPlanOverview.tsx'), 'utf8');

  it('shows the chips on their own count, not on the box being empty', () => {
    const chips = CARD.indexOf('{briefChips.length > 0 ?');
    expect(chips).toBeGreaterThan(-1);
    expect(CARD.slice(chips, chips + 60)).not.toContain('prompt');
  });

  it('depends on nothing but itself', () => {
    const chips = CARD.indexOf('{briefChips.length > 0 ?');
    const condition = CARD.slice(chips, CARD.indexOf('?', chips));
    expect(condition).not.toContain('prompt');
    expect(condition).not.toContain('picked');
  });
});

describe('the box shows them', () => {
  const CARD = readFileSync(resolve(__dirname, '../components/TripPlanOverview.tsx'), 'utf8');

  it('renders the questions under the input', () => {
    expect(CARD).toContain('data-testid="plan-prompt-questions"');
  });

  /**
   * The question is a heading and the answers are the buttons. Asserted on
   * the component text because this is the distinction the Founder asked for,
   * and it is one line away from being lost again.
   */
  it('taps an answer, never the question', () => {
    expect(CARD).toContain('onClick={() => togglePick(option)}');
    expect(CARD).not.toContain('togglePick(item.question)');
    expect(CARD).not.toContain('togglePick(suggestion)');
  });

  /**
   * 「提示詞應該要多選的 可以讓用戶選很多」.
   *
   * Picks are kept beside the typed text, never written into it. Writing one
   * in meant a second tap destroyed the first, and once an answer is
   * characters in a textarea the app cannot tell it from typing — so it
   * cannot show the choice back or let it be taken off again.
   */
  it('toggles a pick instead of overwriting the box', () => {
    expect(CARD).not.toContain('setPrompt(option)');
  });

  it('keeps the questions visible while the traveller keeps choosing', () => {
    expect(CARD).toContain('{promptQuestions.length > 0 && (');
    expect(CARD).not.toContain("!prompt.trim() && promptQuestions.length > 0");
  });

  it('marks what has been picked', () => {
    expect(CARD).toContain('aria-pressed={on}');
  });

  /** Picks alone are a question; the box no longer has to be typed in. */
  it('sends the picks together with anything typed', () => {
    // The separator moved to `settle.listSeparator`; what matters here is
    // that the picks and the typed sentence are still joined into one ask.
    expect(CARD).toContain('const askText = [...picked, prompt.trim()].filter(Boolean).join(');
    expect(CARD).toContain('disabled={!askText || isGenerating}');
  });

  it('is given them at both mount sites', () => {
    const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    expect(app.split('promptQuestions={planPromptQuestions}').length - 1).toBe(2);
  });
});
