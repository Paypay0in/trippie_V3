import i18n from '../i18n/config';
import { ParsedRental, rentalDays } from './rentalIntake';
import { TRANSPORT_LABEL, TripPlanBrief } from './tripPlanBrief';

/**
 * What the traveller already told us, said back to the model.
 *
 * 「前面表單填好的資訊可以儲存帶入到這邊」. 告訴我你的旅行計畫 collects how many
 * people, when the day starts, how full it should be and how they get around
 * — and the planner that proposes activities was asking for one sentence and
 * nothing else. Everything already answered was being asked for again, by
 * implication, and usually not answered twice.
 *
 * It is written as a sentence rather than a field list because that is what
 * the prompt already takes beside it: `tripDaysBrief` has been handing the
 * trip's days over this way, and two shapes for the same job is how one of
 * them stops being read.
 *
 * The car is the part that has to be right. 「是租兩天的車等 但旅行有五天 因此
 * 先不要直接預設交通馬上排用租車」 — so a hire is never reported as a travel
 * mode. It is reported as the dates it covers, from the confirmation, so the
 * model can suggest driving on exactly those days and nothing on the others.
 * 開車 ticked with no confirmation uploaded says only that a car may exist,
 * and says it as a maybe.
 */

export interface TravellerBriefInput {
  brief?: TripPlanBrief | null;
  rentals?: ParsedRental[];
}

/*
  Everything `travellerBriefText` builds is prompt text, not copy: it is joined
  into the request sent to the model and is never shown to the traveller.
  i18n-data: model prompt — prompt language is a separate, undecided call.
*/
const peopleLine = (brief: TripPlanBrief): string =>
  // i18n-data: model prompt — sent to the model, never shown to the traveller.
  brief.travellers > 1 ? `${brief.travellers} 人同行。` : '一個人旅行。';

const rhythmLine = (brief: TripPlanBrief): string =>
  // i18n-data: model prompt — sent to the model, never shown to the traveller.
  `每天大約 ${brief.dayStartTime} 開始，一天希望安排 ${brief.pace} 個行程。`;

/**
 * Days with keys, named.
 *
 * Several hires are listed separately rather than merged: two cars over two
 * stretches is two facts, and a merged range would quietly claim the gap
 * between them.
 */
const carLines = (rentals: ParsedRental[]): string[] =>
  rentals
    .map(rental => {
      const days = rentalDays(rental);
      if (days.length === 0) return '';
      // i18n-data: model prompt — sent to the model, never shown to the traveller.
      return `${days.join('、')} 這 ${days.length} 天有租車（${rental.company}），可以安排需要開車的行程。`;
    })
    .filter(Boolean);

/**
 * The brief as a paragraph, or '' when there is nothing worth saying.
 *
 * Empty rather than a polite filler: a sentence that says nothing still costs
 * the model attention, and 「沒有特別偏好」 reads like an answer when it is the
 * absence of one.
 */
export const travellerBriefText = ({ brief, rentals = [] }: TravellerBriefInput): string => {
  const parts: string[] = [];

  if (brief) {
    parts.push(peopleLine(brief));
    parts.push(rhythmLine(brief));

    const cars = carLines(rentals);
    if (cars.length > 0) {
      // The confirmation outranks the tick box: it knows which days.
      parts.push(...cars);
      const otherDays = brief.transport
        .filter(mode => mode !== 'drive')
        .map(mode => TRANSPORT_LABEL[mode]);
      if (otherDays.length > 0) {
        // i18n-data: model prompt — sent to the model, never shown to the traveller.
        parts.push(`其餘日子主要使用：${otherDays.join('、')}。`);
      }
    } else if (brief.transport.length > 0) {
      const driving = brief.transport.includes('drive');
      // i18n-data: model prompt — the Chinese mode names the model is told about.
      const named = brief.transport.map(mode => TRANSPORT_LABEL[mode]).join('、');
      parts.push(
        driving
          // i18n-data: model prompt — sent to the model, never shown to the traveller.
          ? `主要交通方式：${named}。使用者說可能會開車，但沒有上傳租車訂單，所以不確定哪幾天有車 —— 需要開車的方案請先問過他。`
          // i18n-data: model prompt — sent to the model, never shown to the traveller.
          : `主要交通方式：${named}。`,
      );
    }

    // i18n-data: model prompt — sent to the model, never shown to the traveller.
    if (brief.notes?.trim()) parts.push(`使用者補充：${brief.notes.trim()}`);
  } else {
    parts.push(...carLines(rentals));
  }

  return parts.join('');
};

/**
 * The brief as short chips, for showing the traveller what is being sent.
 *
 * 「需求表單填完要被帶入進去」 — said about a screen where it already was. The
 * sentence goes into the prompt and nowhere else, so from the outside it is
 * indistinguishable from not being carried at all, and a thing that cannot be
 * seen cannot be trusted.
 *
 * Chips rather than the sentence, because the sentence is prose and this is a
 * glance: 「還是很長」 was said twice tonight about a different screen for the
 * same reason.
 */
export const briefChips = ({ brief, rentals = [] }: TravellerBriefInput): string[] => {
  if (!brief) {
    const days = rentals.flatMap(rental => rentalDays(rental)).length;
    return days > 0 ? [i18n.t('plan.brief.chips.carDays', { count: days })] : [];
  }

  const chips = [
    brief.travellers > 1
      ? i18n.t('plan.brief.chips.travellers', { count: brief.travellers })
      : i18n.t('plan.brief.chips.solo'),
    i18n.t('plan.brief.chips.dayStart', { time: brief.dayStartTime }),
    i18n.t('plan.brief.chips.pace', { count: brief.pace }),
  ];

  const carDays = new Set(rentals.flatMap(rental => rentalDays(rental)));
  if (carDays.size > 0) {
    // The days, because that is what the confirmation knows and the tick box
    // does not — the distinction this whole feature turns on.
    chips.push(i18n.t('plan.brief.chips.carDays', { count: carDays.size }));
  }

  for (const mode of brief.transport) {
    // Driving is already said by the car days when there is a confirmation;
    // saying it twice makes the trip sound like it is all driven.
    if (mode === 'drive' && carDays.size > 0) continue;
    /*
      The existing `transport.modes.*` keys, not `TRANSPORT_LABEL`: that table
      is the Chinese the model is told about and has to stay Chinese for the
      prompt above, so a chip reading it would be untranslatable.
    */
    chips.push(i18n.t(`transport.modes.${mode.toUpperCase()}`));
  }

  return chips;
};

/**
 * The gaps, as questions with answers the traveller can tap.
 *
 * 「這些疑問應該是需要獲得答案的 目前只變成可以點擊勾選的按鈕 應該是要產出能回答
 *   的選項讓用戶來點選 協助AI 了解用戶的需求」.
 *
 * The previous version sent the question. Ticking 「開車是哪幾天？」 put those
 * five characters into the request, so the model received a question it
 * cannot answer either — it is the one asking. Nothing was learned and the
 * traveller had done something that looked like answering.
 *
 * So each gap carries its own answers, phrased as the traveller would say
 * them. Tapping 「前兩天開車」 sends 「前兩天開車」. The question is the heading;
 * only answers are selectable.
 *
 * Every question still traces to the form, as it did before: 「3 人」 says how
 * many and never who, 「一天 4 個行程」 asks for a packed day without saying
 * what survives it, 「開車」 never says which days.
 */

export interface BriefQuestion {
  /** Stable id, so a pick survives the list being rebuilt. */
  id: string;
  question: string;
  /**
   * Each one is already a sentence; what is tapped is what is sent.
   * i18n-data: the option text is the payload — tapping 「前兩天開車」 puts those
   * five characters into the model request, so it is prompt content and not a
   * label that may be translated independently of it.
   */
  options: string[];
}

const MAX_QUESTIONS = 3;

/**
 * For a trip with no form — the only case with nothing to continue from.
 *
 * A function rather than a constant: the heading is resolved when it is asked
 * for, because a module-level `t()` would freeze the language at import.
 */
const noBriefQuestion = (): BriefQuestion => ({
  id: 'interest',
  question: i18n.t('plan.brief.ask.interest'),
  // i18n-data: option text is the payload sent to the model when tapped.
  options: ['美食', '景點', '購物', '咖啡廳', '自然風景'],
});

export const promptQuestions = ({ brief, rentals = [] }: TravellerBriefInput): BriefQuestion[] => {
  if (!brief) return [noBriefQuestion()];

  const questions: BriefQuestion[] = [];
  const carDays = new Set(rentals.flatMap(rental => rentalDays(rental)));

  if (brief.transport.includes('drive') && carDays.size === 0) {
    /*
      Coarse on purpose. The exact dates are on the rental confirmation, and
      asking somebody to tap nine of them is worse than the upload they have
      not done. These four are enough for a plan to be shaped around.
    */
    questions.push({
      id: 'car-days',
      question: i18n.t('plan.brief.ask.carDays'),
      // i18n-data: option text is the payload sent to the model when tapped.
      options: ['前兩天開車', '中間幾天開車', '最後兩天開車', '整趟都有車'],
    });
  }

  if (!brief.notes?.trim()) {
    questions.push(noBriefQuestion());
  }

  if (brief.travellers >= 3) {
    questions.push({
      id: 'who',
      question: i18n.t('plan.brief.ask.who'),
      // 「都是大人」 is an answer, and the absence of one is not.
      // i18n-data: option text is the payload sent to the model when tapped.
      options: ['有長輩同行', '有小孩同行', '都是大人'],
    });
  }

  if (brief.pace === 4) {
    questions.push({
      id: 'must',
      question: i18n.t('plan.brief.ask.must'),
      // i18n-data: option text is the payload sent to the model when tapped.
      options: ['一定要吃到名店', '一定要去代表性景點', '一定要留購物時間', '都可以調整'],
    });
  }

  if (brief.pace === 2) {
    questions.push({
      id: 'slack',
      question: i18n.t('plan.brief.ask.slack'),
      // i18n-data: option text is the payload sent to the model when tapped.
      options: ['第一天慢慢來', '中間留一天放空', '最後一天放空', '不用特別留'],
    });
  }

  if (brief.transport.includes('transit')) {
    questions.push({
      id: 'pass',
      question: i18n.t('plan.brief.ask.pass'),
      // i18n-data: option text is the payload sent to the model when tapped.
      options: ['要買交通卡', '要買一日券', '還不確定，幫我評估'],
    });
  }

  return questions.slice(0, MAX_QUESTIONS);
};
