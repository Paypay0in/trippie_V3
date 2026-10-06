/**
 * Turning a printed shop address into a place the app can aggregate on.
 *
 * 「下一步建議是把地址解析成座標 + 商家 Place ID … 要我排嗎？」「好啊」.
 *
 * A text address is enough to read and useless to count with: the same Olive
 * Young prints as 「부산광역시 부산진구 중앙대로 737 2-02호(부전동, 서면역구내)」 on
 * one receipt and shorter on the next, so a shared ledger could never say
 * 「four travellers went to this shop」. A place id can.
 *
 * The risk runs the other way, though. A lookup always returns *something*, and
 * a confidently wrong coordinate is worse than an empty column — it does not
 * look missing, so nobody checks it, and it lands in whatever is aggregated
 * later. So a candidate has to prove it is the same shop.
 */

/** What to ask the place service, or nothing when there is too little to ask. */
export const merchantSearchQuery = ({
  merchant,
  address,
}: { merchant?: string; address?: string }): string | undefined => {
  const name = (merchant || '').trim();
  const printed = (address || '').trim();
  /*
    An address alone is a fine query; a name alone is not.

    「OLIVE YOUNG」 matches two hundred shops, and the lookup would return one of
    them — the wrong branch, in the right chain, with nothing to reveal the
    error. The whole point of this field is which branch somebody went to.
  */
  if (!printed) return undefined;
  const query = `${name} ${printed}`.trim().replace(/\s+/g, ' ');
  return query.slice(0, 160);
};

/**
 * Which language to ask for the answer in.
 *
 * Measured against the live API, and the reason the first version of this
 * found nothing: asked in zh-TW, Google answered the Busan branch as 「南韓
 * Busan, Busanjin District, Jungang-daero, 730」 — romanised, with no character
 * in common with the Korean on the receipt. Asked in ko it answers 「대한민국
 * 부산광역시 부산진구 중앙대로 730」 and 「올리브영 서면역사점」, which the printed
 * text can actually be compared against.
 *
 * So: ask in the script the receipt is printed in. A comparison between two
 * renderings of the same place in different languages is not a comparison.
 */
export const placeLanguageFor = (printed?: string, country?: string): string | undefined => {
  /*
    The country first, where the receipt gave one.

    Script alone cannot tell 「東京都渋谷区神南」 from Chinese — a Japanese address
    often carries no kana at all — and asking for a Japanese shop in zh-TW is
    the same mistake this function exists to prevent.
  */
  const where = (country || '').trim();
  if (/韓國|韓国|南韓|korea/i.test(where)) return 'ko';
  if (/日本|japan/i.test(where)) return 'ja';
  if (/泰國|thailand/i.test(where)) return 'th';
  if (/台灣|臺灣|中國|香港|澳門|taiwan|china|hong ?kong/i.test(where)) return 'zh-TW';

  const text = printed || '';
  if (/[가-힯]/.test(text)) return 'ko';
  if (/[぀-ヿ]/.test(text)) return 'ja';
  if (/[฀-๿]/.test(text)) return 'th';
  if (/[一-鿿]/.test(text)) return 'zh-TW';
  return undefined;
};

/** Words worth comparing: the short connectives match everything. */
const distinctiveTokens = (text?: string): string[] =>
  Array.from(new Set((text || '')
    .replace(/[()（）,，.·\-/]/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2 && !/^\d+$/.test(token))));

/**
 * The street numbers in an address.
 *
 * Kept as evidence, not as a requirement. A receipt prints the address the
 * business is registered at and a map prints the one you walk into: the real
 * Olive Young is 737 on the paper and 730 in Google, and they are the same
 * shop. Requiring the number — which the first version did — rejected every
 * true match it was given.
 */
export const addressNumbers = (address?: string): string[] =>
  Array.from(new Set((address || '').match(/\d{2,}/g) || []));

/** Whether both texts name the same area and street. */
export const sharesLocality = (printed?: string, candidate?: string): boolean => {
  const wanted = distinctiveTokens(printed);
  if (wanted.length === 0) return false;
  const found = distinctiveTokens(candidate);
  return wanted.some(token => found.some(other => other.includes(token) || token.includes(other)));
};

/** Whether the candidate carries the branch name the receipt printed. */
export const sharesName = (merchant?: string, candidateName?: string): boolean => {
  const wanted = distinctiveTokens(merchant).filter(token => token.length >= 3);
  if (wanted.length === 0) return false;
  const name = (candidateName || '');
  return wanted.some(token => name.includes(token));
};

export interface ResolvedMerchantPlace {
  placeId: string;
  latitude: number;
  longitude: number;
  /** The address the place service holds, which is the one worth aggregating. */
  formattedAddress?: string;
}

export interface MerchantCandidate {
  placeId?: string;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  displayName?: string;
}

/**
 * Picks the candidate that is really this shop, or none.
 *
 * Two independent things have to agree: the area (same city, district, street)
 * and the shop itself (the branch name, or the exact street number). The area
 * alone is not enough — the two Olive Youngs in this very receipt's district
 * are both on 중앙대로, and picking by area would have chosen between them by
 * luck.
 *
 * No 「best effort」 fallback to the first result. The caller stores nothing
 * when this returns undefined, and an expense with no place id is an honest
 * record of a shop nobody could pin down.
 */
export const chooseMerchantPlace = (
  printedAddress: string | undefined,
  candidates: MerchantCandidate[],
  merchant?: string,
): ResolvedMerchantPlace | undefined => {
  const wantedNumbers = new Set(addressNumbers(printedAddress));

  for (const candidate of candidates) {
    if (!candidate.placeId
      || !Number.isFinite(candidate.latitude)
      || !Number.isFinite(candidate.longitude)) continue;
    if (!sharesLocality(printedAddress, candidate.formattedAddress)) continue;

    const sameNumber = addressNumbers(candidate.formattedAddress).some(number => wantedNumbers.has(number));
    if (!sameNumber && !sharesName(merchant, candidate.displayName)) continue;

    return {
      placeId: candidate.placeId,
      latitude: candidate.latitude as number,
      longitude: candidate.longitude as number,
      ...(candidate.formattedAddress ? { formattedAddress: candidate.formattedAddress } : {}),
    };
  }
  return undefined;
};
