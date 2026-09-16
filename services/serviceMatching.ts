import { MarketplaceService } from '../types';

/**
 * Matching a traveller's request to the people offering help.
 *
 * A to-do like 「預約橫濱 Snova 室內滑雪場」 is sometimes not something an app
 * can finish — the booking form is Japanese-only, or the shop answers the phone
 * and nothing else. The 需要真人協助 button carries that exact sentence into the
 * service tab so the traveller does not retype it and, more importantly, so the
 * list is ordered by what they actually asked for.
 *
 * Ranked by word overlap against real listings only. Nothing is invented here:
 * when no one offers anything close, the honest answer is an empty list, and
 * the screen says so rather than padding itself with plausible-looking
 * providers who do not exist.
 */

export interface HelpRequest {
  /** The traveller's own words — a to-do name or a typed question. */
  topic: string;
  /** Where the help is needed, when the trip knows. */
  destination?: string;
}

export interface ServiceMatch {
  service: MarketplaceService;
  /** Words shared with the request, so the screen can say why it matched. */
  matchedOn: string[];
}

/** Words that appear in nearly every request and every listing alike. */
const STOPWORDS = new Set([
  '預約', '查詢', '確認', '準備', '購買', '申請', '安排', '服務', '協助', '幫忙',
  '旅行', '旅遊', '行程', '可以', '需要', '推薦', '一下', '怎麼', '哪裡',
  'the', 'and', 'for', 'with', 'you', 'your',
]);

const tokens = (text: string): string[] => {
  const cleaned = (text || '').replace(/[\s,，。、()（）「」【】:：!！?？]/g, '');
  const found: string[] = [];
  for (const match of cleaned.matchAll(/[一-鿿]{2,}|[A-Za-z]{3,}/g)) {
    found.push(match[0].toLowerCase());
  }
  return found;
};

/** Every 2-character window of a Chinese run, so 「滑雪場」 meets 「滑雪」. */
const expand = (words: string[]): Set<string> => {
  const all = new Set<string>();
  words.forEach(word => {
    all.add(word);
    if (/^[一-鿿]+$/.test(word)) {
      for (let i = 0; i + 2 <= word.length; i += 1) all.add(word.slice(i, i + 2));
    }
  });
  return all;
};

export const matchServices = ({
  request,
  services,
  limit = 5,
}: {
  request: HelpRequest;
  services: MarketplaceService[];
  limit?: number;
}): ServiceMatch[] => {
  // The place name is dropped from the request: every Japan listing says 日本,
  // so scoring it would rank the whole tab as a hit.
  const placeWords = expand(tokens(request.destination || ''));
  const asked = expand(
    tokens(request.topic).filter(word => !STOPWORDS.has(word) && !placeWords.has(word)),
  );
  placeWords.forEach(word => asked.delete(word));
  if (asked.size === 0) return [];

  return services
    .map(service => {
      const offered = expand(tokens(`${service.title} ${service.description} ${service.providerName}`));
      const matchedOn = [...asked].filter(word => offered.has(word));
      return { service, matchedOn };
    })
    .filter(match => match.matchedOn.length > 0)
    .sort((a, b) =>
      b.matchedOn.length - a.matchedOn.length ||
      b.service.rating - a.service.rating,
    )
    .slice(0, limit);
};
