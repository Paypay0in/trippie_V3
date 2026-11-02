import { describe, expect, it } from 'vitest';
import { briefFromSentence, unreadFields } from './briefFromSentence';
import { DEFAULT_BRIEF } from './tripPlanBrief';

/**
 * 「11月去東京五天，兩個人，喜歡美術館、咖啡廳和購物，不想太趕。住宿在新宿，想去
 * teamLab。」 — the sentence from the spec, as the model would hand it back.
 */
const THE_SENTENCE = {
  destination: '東京',
  travellers: 2,
  month: 11,
  days: 5,
  pace: 2 as const,
  interests: ['美術館', '咖啡廳', '購物'],
  mustDo: ['teamLab'],
  lodging: '新宿',
};

describe('briefFromSentence', () => {
  it('fills the form from one sentence', () => {
    const { brief } = briefFromSentence(THE_SENTENCE);

    expect(brief).toMatchObject({
      destination: '東京',
      travellers: 2,
      approximateDays: 5,
      pace: 2,
    });
  });

  /*
    The rule this file exists for. 「11 月」 is a month, and a trip carrying
    invented dates is indistinguishable from a planned one on every screen
    that reads them.
  */
  it('never turns a month into dates', () => {
    const { brief } = briefFromSentence(THE_SENTENCE);

    expect(brief.startDate).toBeUndefined();
    expect(brief.endDate).toBeUndefined();
    expect(brief.notes).toContain('預計 11 月出發');
  });

  it('takes real dates when real dates were said', () => {
    const { brief } = briefFromSentence({
      destination: '釜山', startDate: '2026-11-03', endDate: '2026-11-07',
    });

    expect(brief).toMatchObject({ startDate: '2026-11-03', endDate: '2026-11-07' });
    expect(brief.approximateDays).toBeUndefined();
  });

  it('carries the prose into the notes the planner already reads', () => {
    const { brief } = briefFromSentence(THE_SENTENCE);

    expect(brief.notes).toContain('喜歡美術館、咖啡廳、購物');
    expect(brief.notes).toContain('住宿在新宿');
    expect(brief.notes).toContain('一定要去teamLab');
  });

  it('keeps what the traveller had already typed', () => {
    const { brief } = briefFromSentence(THE_SENTENCE, { ...DEFAULT_BRIEF, notes: '帶了嬰兒車' });

    expect(brief.notes).toContain('帶了嬰兒車');
    expect(brief.notes).toContain('住宿在新宿');
  });

  /*
    Reading a second sentence must not wipe a field just corrected by hand.
    Only what the new sentence speaks about moves.
  */
  it('leaves fields the sentence says nothing about alone', () => {
    const corrected = { ...DEFAULT_BRIEF, travellers: 4, dayStartTime: '11:00' };
    const { brief } = briefFromSentence({ destination: '京都' }, corrected);

    expect(brief).toMatchObject({ destination: '京都', travellers: 4, dayStartTime: '11:00' });
  });

  it('ignores a nonsense time or transport mode', () => {
    const { brief } = briefFromSentence({
      dayStartTime: '25:00', transport: ['teleport'] as never,
    });

    expect(brief.dayStartTime).toBe(DEFAULT_BRIEF.dayStartTime);
    expect(brief.transport).toEqual(DEFAULT_BRIEF.transport);
  });

  /**
   * The chip read 「交通：walk、transit」 — the stored ids, printed raw.
   *
   * Wrong in Chinese already, and under an English interface it would have
   * looked deliberate rather than broken. The words live at `transport.modes.*`
   * keyed on the uppercase mode the routing code uses; the brief stores them
   * lowercase, so the chip has to bridge the two spellings.
   */
  it('names the transport modes in words, never as the stored ids', () => {
    const { read } = briefFromSentence({ transport: ['walk', 'transit'] });

    const chip = read.find(line => line.includes('交通'));
    expect(chip).toBeDefined();
    expect(chip).toContain('步行');
    expect(chip).toContain('大眾運輸');
    expect(chip).not.toContain('walk');
    expect(chip).not.toContain('transit');
  });

  it('shows back everything it understood', () => {
    const { read } = briefFromSentence(THE_SENTENCE);

    expect(read).toContain('目的地：東京');
    expect(read).toContain('2 個人');
    expect(read).toContain('5 天（日期還沒定）');
    expect(read).toContain('步調：悠閒');
    expect(read).toContain('必去：teamLab');
  });

  it('reads nothing from nothing', () => {
    const { brief, read } = briefFromSentence({});

    expect(brief).toEqual(DEFAULT_BRIEF);
    expect(read).toEqual([]);
  });
});

/**
 * A default that arrived without being mentioned looks exactly like an answer.
 */
describe('unreadFields', () => {
  it('names what the sentence never said', () => {
    expect(unreadFields({ destination: '東京', days: 5 }))
      .toEqual(['幾個人', '步調']);
  });

  it('is empty when the sentence covered everything', () => {
    expect(unreadFields(THE_SENTENCE)).toEqual([]);
  });

  it('counts stated dates as having said how long', () => {
    expect(unreadFields({ destination: '東京', startDate: '2026-11-03', travellers: 2, pace: 3 }))
      .toEqual([]);
  });
});

/**
 * The new modes have to survive the parser, not just the form.
 *
 * The filter used to name 'walk', 'drive' and 'transit' inline, so a sentence
 * saying 「我會搭新幹線」 would have been understood by the model and then
 * dropped here — while the read-back chips claimed the field was understood.
 */
describe('transport modes the sentence names', () => {
  it('keeps train, bus, flight and other', () => {
    const { brief } = briefFromSentence({ ...THE_SENTENCE, transport: ['train', 'bus', 'flight', 'other'] });
    expect(brief.transport).toEqual(['train', 'bus', 'flight', 'other']);
  });

  it('still keeps the three that existed before', () => {
    const { brief } = briefFromSentence({ ...THE_SENTENCE, transport: ['walk', 'transit', 'drive'] });
    expect(brief.transport).toEqual(['walk', 'transit', 'drive']);
  });

  it('drops a mode the app does not have, rather than storing it', () => {
    const { brief } = briefFromSentence({ ...THE_SENTENCE, transport: ['helicopter' as never, 'bus'] });
    expect(brief.transport).toEqual(['bus']);
  });

  it('reads a stated mode back to the traveller', () => {
    const { read } = briefFromSentence({ ...THE_SENTENCE, transport: ['train'] });
    expect(read.join(' ')).toContain('火車');
  });

  it('a stated mode means they have decided', () => {
    const { brief } = briefFromSentence({ ...THE_SENTENCE, transport: ['bus'] });
    expect(brief.transportUndecided).toBe(false);
  });

  it('says nothing about transport when the sentence did not', () => {
    const { brief } = briefFromSentence(THE_SENTENCE);
    expect(brief.transport).toEqual([]);
  });
});
