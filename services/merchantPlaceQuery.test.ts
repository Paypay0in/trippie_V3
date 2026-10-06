import { describe, expect, it } from 'vitest';
import {
  addressNumbers,
  chooseMerchantPlace,
  merchantSearchQuery,
  placeLanguageFor,
  sharesLocality,
  sharesName,
} from './merchantPlaceQuery';

/**
 * 「地址更能協助大數據分析」, then 「把地址解析成座標 + 商家 Place ID … 好啊」.
 *
 * Every fixture here is what the live Places API actually returned for his
 * receipt: CJ올리브영(주) 서면역사점, 부산광역시 부산진구 중앙대로 737 2-02호
 * (부전동, 서면역구내).
 */
const MERCHANT = 'CJ올리브영(주) 서면역사점';
const PRINTED = '부산광역시 부산진구 중앙대로 737 2-02호( 부전동, 서면역구내)';

/** The branch he was in. Note 730, where the receipt says 737. */
const STATION_BRANCH = {
  placeId: 'ChIJM8jzRnDraDUR6cAZ9DRHuyw',
  latitude: 35.1576684,
  longitude: 129.0587783,
  formattedAddress: '대한민국 부산광역시 부산진구 중앙대로 730 지하 서면역 B1F',
  displayName: '올리브영 서면역사점',
};

/** A different Olive Young, on the same street in the same district. */
const TOWN_BRANCH = {
  placeId: 'ChIJlUqY6G_raDURI08sFYHhSy0',
  latitude: 35.1556585,
  longitude: 129.0594108,
  formattedAddress: '대한민국 부산광역시 부산진구 중앙대로 704-1 1F-2F',
  displayName: '올리브영 서면 타운',
};

describe('what to ask, and in what language', () => {
  it('asks with the name and the printed address together', () => {
    expect(merchantSearchQuery({ merchant: MERCHANT, address: PRINTED })).toBe(`${MERCHANT} ${PRINTED}`);
  });

  it('asks nothing at all on a name with no address', () => {
    // 「OLIVE YOUNG」 matches two hundred shops; which branch is the whole point.
    expect(merchantSearchQuery({ merchant: 'OLIVE YOUNG' })).toBeUndefined();
  });

  it('asks for the answer in the script the receipt is printed in', () => {
    // Asked in zh-TW the live API answered 「Busanjin District, Jungang-daero」 —
    // romanised, sharing no character with the receipt. A comparison between
    // two renderings of the same place in different languages is not one.
    expect(placeLanguageFor(PRINTED)).toBe('ko');
    expect(placeLanguageFor('台北市大安區忠孝東路四段 45 號')).toBe('zh-TW');
    expect(placeLanguageFor('12 Charing Cross Rd, London')).toBeUndefined();
  });

  it('believes the receipt country over the script', () => {
    // A Japanese address often carries no kana at all, and 「東京都渋谷区神南」
    // reads as Chinese to a script test.
    expect(placeLanguageFor('東京都渋谷区神南1-19-11', '日本')).toBe('ja');
    expect(placeLanguageFor('中央大路 737', '韓國')).toBe('ko');
  });
});

describe('proving it is the same shop', () => {
  it('sees the same city, district and street', () => {
    expect(sharesLocality(PRINTED, STATION_BRANCH.formattedAddress)).toBe(true);
  });

  it('does not see a different district as the same place', () => {
    expect(sharesLocality(PRINTED, '대한민국 서울특별시 중구 명동길 14')).toBe(false);
  });

  it('recognises the branch by name', () => {
    expect(sharesName(MERCHANT, STATION_BRANCH.displayName)).toBe(true);
    expect(sharesName(MERCHANT, TOWN_BRANCH.displayName)).toBe(false);
  });

  it('keeps street numbers as evidence, not as a requirement', () => {
    // The receipt prints where the business is registered, 737; the map prints
    // the door you walk into, 730. Same shop. Requiring the number rejected
    // every true match.
    expect(addressNumbers(PRINTED)).toContain('737');
    expect(addressNumbers(STATION_BRANCH.formattedAddress)).toContain('730');
  });
});

describe('choosing a place', () => {
  it('takes the branch the receipt names, not its neighbour on the same street', () => {
    // Both are Olive Youngs on 중앙대로 in 부산진구. Area alone would have
    // chosen between them by luck.
    expect(chooseMerchantPlace(PRINTED, [STATION_BRANCH, TOWN_BRANCH], MERCHANT)?.placeId)
      .toBe(STATION_BRANCH.placeId);
    expect(chooseMerchantPlace(PRINTED, [TOWN_BRANCH, STATION_BRANCH], MERCHANT)?.placeId)
      .toBe(STATION_BRANCH.placeId);
  });

  it('takes nothing rather than the first result', () => {
    // A lookup always returns something. A confidently wrong coordinate does
    // not look missing, so nobody checks it.
    expect(chooseMerchantPlace(PRINTED, [TOWN_BRANCH], MERCHANT)).toBeUndefined();
  });

  it('accepts an exact street number even when the name reads differently', () => {
    const exact = { ...TOWN_BRANCH, formattedAddress: '대한민국 부산광역시 부산진구 중앙대로 737' };

    expect(chooseMerchantPlace(PRINTED, [exact], MERCHANT)?.placeId).toBe(TOWN_BRANCH.placeId);
  });

  it('skips a candidate with no coordinates', () => {
    const broken = { ...STATION_BRANCH, latitude: undefined, placeId: 'broken' };

    expect(chooseMerchantPlace(PRINTED, [broken, STATION_BRANCH], MERCHANT)?.placeId)
      .toBe(STATION_BRANCH.placeId);
  });

  it('takes nothing when there is nothing to compare against', () => {
    expect(chooseMerchantPlace(undefined, [STATION_BRANCH], MERCHANT)).toBeUndefined();
    expect(chooseMerchantPlace(PRINTED, [], MERCHANT)).toBeUndefined();
  });
});
