import { describe, expect, it } from 'vitest';
import { addressNumbers, chooseMerchantPlace, matchesPrintedAddress, merchantSearchQuery } from './merchantPlaceQuery';

/**
 * 「地址更能協助大數據分析」, then 「把地址解析成座標 + 商家 Place ID … 好啊」.
 *
 * His receipt: CJ올리브영(주) 서면역사점, 부산광역시 부산진구 중앙대로 737 2-02호
 * (부전동, 서면역구내). Google answers the same shop in Traditional Chinese.
 */
const PRINTED = '부산광역시 부산진구 중앙대로 737 2-02호(부전동, 서면역구내)';
const GOOGLE = '南韓釜山廣域市釜山鎮區中央大路737 서면역구내 2-02號';

describe('what to ask', () => {
  it('asks with the name and the printed address together', () => {
    expect(merchantSearchQuery({ merchant: 'CJ올리브영(주) 서면역사점', address: PRINTED }))
      .toBe(`CJ올리브영(주) 서면역사점 ${PRINTED}`);
  });

  it('asks nothing at all on a name with no address', () => {
    // 「OLIVE YOUNG」 matches two hundred shops and the lookup would return one
    // of them — the wrong branch, in the right chain, with nothing to reveal
    // the error. Which branch is the entire point of this field.
    expect(merchantSearchQuery({ merchant: 'OLIVE YOUNG' })).toBeUndefined();
  });

  it('will ask with an address alone', () => {
    expect(merchantSearchQuery({ address: PRINTED })).toBe(PRINTED);
  });
});

describe('proving it is the same address', () => {
  it('matches across scripts on the street number', () => {
    // No shared words: the receipt is Korean and the answer is Chinese. The
    // digits are what the two have in common.
    expect(matchesPrintedAddress(PRINTED, GOOGLE)).toBe(true);
  });

  it('rejects the right street at the wrong number', () => {
    expect(matchesPrintedAddress(PRINTED, '南韓釜山廣域市釜山鎮區中央大路 912')).toBe(false);
  });

  it('ignores single digits, which match everything', () => {
    expect(addressNumbers('서울 1가 2호')).toEqual([]);
  });

  it('refuses to match when the receipt printed no number', () => {
    expect(matchesPrintedAddress('서면역구내', GOOGLE)).toBe(false);
  });
});

describe('choosing a place', () => {
  const branch = {
    placeId: 'g-oliveyoung-seomyeon', latitude: 35.1578, longitude: 129.0594, formattedAddress: GOOGLE,
  };
  const elsewhere = {
    placeId: 'g-oliveyoung-haeundae', latitude: 35.1631, longitude: 129.1635,
    formattedAddress: '南韓釜山廣域市海雲台區九南路 25',
  };

  it('takes the branch whose address is the one on the receipt', () => {
    expect(chooseMerchantPlace(PRINTED, [elsewhere, branch])?.placeId).toBe('g-oliveyoung-seomyeon');
  });

  it('takes nothing rather than the first result', () => {
    // A lookup always returns something. A confidently wrong coordinate does
    // not look missing, so nobody checks it, and it lands in whatever gets
    // aggregated later.
    expect(chooseMerchantPlace(PRINTED, [elsewhere])).toBeUndefined();
  });

  it('skips a candidate with no coordinates', () => {
    expect(chooseMerchantPlace(PRINTED, [{ placeId: 'x', formattedAddress: GOOGLE }, branch])?.placeId)
      .toBe('g-oliveyoung-seomyeon');
  });

  it('takes nothing when there is nothing to compare against', () => {
    expect(chooseMerchantPlace(undefined, [branch])).toBeUndefined();
    expect(chooseMerchantPlace(PRINTED, [])).toBeUndefined();
  });
});
