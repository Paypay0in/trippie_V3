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

const peopleLine = (brief: TripPlanBrief): string =>
  brief.travellers > 1 ? `${brief.travellers} 人同行。` : '一個人旅行。';

const rhythmLine = (brief: TripPlanBrief): string =>
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
        parts.push(`其餘日子主要使用：${otherDays.join('、')}。`);
      }
    } else if (brief.transport.length > 0) {
      const driving = brief.transport.includes('drive');
      const named = brief.transport.map(mode => TRANSPORT_LABEL[mode]).join('、');
      parts.push(
        driving
          ? `主要交通方式：${named}。使用者說可能會開車，但沒有上傳租車訂單，所以不確定哪幾天有車 —— 需要開車的方案請先問過他。`
          : `主要交通方式：${named}。`,
      );
    }

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
    return days > 0 ? [`${days} 天有車`] : [];
  }

  const chips = [
    brief.travellers > 1 ? `${brief.travellers} 人` : '一個人',
    `${brief.dayStartTime} 出發`,
    `一天 ${brief.pace} 個行程`,
  ];

  const carDays = new Set(rentals.flatMap(rental => rentalDays(rental)));
  if (carDays.size > 0) {
    // The days, because that is what the confirmation knows and the tick box
    // does not — the distinction this whole feature turns on.
    chips.push(`${carDays.size} 天有車`);
  }

  for (const mode of brief.transport) {
    // Driving is already said by the car days when there is a confirmation;
    // saying it twice makes the trip sound like it is all driven.
    if (mode === 'drive' && carDays.size > 0) continue;
    chips.push(TRANSPORT_LABEL[mode]);
  }

  return chips;
};

/**
 * What to ask next, from what the brief already says.
 *
 * 「這些關鍵字的存在 在下方的輸入框就能有引導詞」. The chips above say what is
 * known; an empty box beside them asks the traveller to invent a question
 * when the app can already see which one matters.
 *
 * The gap goes first, and there is usually exactly one. 開車 ticked with no
 * confirmation uploaded is the clearest: the plan hinges on which days have a
 * car, nothing knows, and 「了解用戶目前想法」 was the instruction. Asking it
 * here is cheaper than a model guessing and a traveller correcting.
 *
 * The rest are openers, not questions the app needs answered — somebody who
 * has typed nothing is usually not short of opinions, only of a starting
 * point.
 */
export const promptSuggestions = ({ brief, rentals = [] }: TravellerBriefInput): string[] => {
  const suggestions: string[] = [];

  const carDays = new Set(rentals.flatMap(rental => rentalDays(rental)));
  if (brief?.transport.includes('drive') && carDays.size === 0) {
    // First and alone-worthy: everything about the shape of the days depends
    // on it, and it is the one thing only the traveller can answer.
    suggestions.push('開車是哪幾天？');
  }

  if (!brief?.notes?.trim()) {
    suggestions.push('想找咖啡廳', '想逛美術館', '想去當地市集');
  }

  return suggestions;
};
