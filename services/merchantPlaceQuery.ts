/**
 * Turning a printed shop address into a place the app can aggregate on.
 *
 * 「下一步建議是把地址解析成座標 + 商家 Place ID … 要我排嗎？」「好啊」.
 *
 * A text address is enough to read and useless to count with: the same Olive
 * Young prints as 「부산광역시 부산진구 중앙대로 737 2-02호(부전동, 서면역구내)」 on
 * one receipt and as something shorter on the next, so a shared ledger could
 * never say 「four travellers went to this shop」. A place id can.
 *
 * The risk runs the other way, though. A lookup always returns *something*, and
 * a confidently wrong coordinate is worse than an empty column — it does not
 * look missing, so nobody checks it, and it quietly lands in whatever is
 * aggregated later. So a candidate has to prove it is the same address.
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
 * The street numbers in an address, which is the part that survives translation.
 *
 * A Korean receipt prints 중앙대로 737 and Google answers in Traditional Chinese
 * with 中央大路737 — no shared words at all, and the same digits. Two or more
 * digits, because a lone 「2」 matches everything.
 */
export const addressNumbers = (address?: string): string[] =>
  Array.from(new Set((address || '').match(/\d{2,}/g) || []));

/**
 * Whether a candidate is the address that was printed.
 *
 * Deliberately strict in one direction only: it rejects a candidate that shares
 * no street number with the receipt. Numbers are what the two scripts have in
 * common, and 「the shop at number 737」 is the claim actually being made.
 */
export const matchesPrintedAddress = (printed?: string, candidate?: string): boolean => {
  const wanted = addressNumbers(printed);
  if (wanted.length === 0) return false;
  const found = new Set(addressNumbers(candidate));
  return wanted.some(number => found.has(number));
};

export interface ResolvedMerchantPlace {
  placeId: string;
  latitude: number;
  longitude: number;
  /** The address the place service holds, which is the one worth aggregating. */
  formattedAddress?: string;
}

/**
 * Picks the candidate that is really the printed address, or none.
 *
 * No 「best effort」 fallback to the first result. The caller stores nothing
 * when this returns undefined, and an expense with no place id is an honest
 * record of a shop nobody could pin down.
 */
export const chooseMerchantPlace = (
  printedAddress: string | undefined,
  candidates: Array<{ placeId?: string; latitude?: number; longitude?: number; formattedAddress?: string }>,
): ResolvedMerchantPlace | undefined => {
  for (const candidate of candidates) {
    if (!candidate.placeId
      || !Number.isFinite(candidate.latitude)
      || !Number.isFinite(candidate.longitude)) continue;
    if (!matchesPrintedAddress(printedAddress, candidate.formattedAddress)) continue;
    return {
      placeId: candidate.placeId,
      latitude: candidate.latitude as number,
      longitude: candidate.longitude as number,
      ...(candidate.formattedAddress ? { formattedAddress: candidate.formattedAddress } : {}),
    };
  }
  return undefined;
};
