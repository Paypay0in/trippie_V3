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
