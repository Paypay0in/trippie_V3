import { describe, expect, it } from 'vitest';
import { clusterOfPlace, clusterSavedPlaces, districtOf, labelForCluster } from './placeClusters';

/**
 * 「能不能夠讓收藏的景點被分區顯示 … 將地址相近的直接分配到同一個顏色區塊」.
 *
 * His own twenty saved places, with the addresses Google actually returned for
 * them: four within walking distance on 廣安里, two out at 海雲台, two on 影島,
 * one in 中區 and one in 機張 forty minutes away. A day built by reading down
 * the alphabetical list crosses the city three times.
 */

const place = (id: string, latitude: number, longitude: number, formattedAddress?: string) =>
  ({ id, placeName: id, latitude, longitude, formattedAddress });

/** The real coordinates and addresses, as stored. */
const gwangalli = [
  place('Dongmyeonsik', 35.1532, 129.1183, '南韓 Busan, Suyeong-gu, Gwanganhaebyeon-ro, 251 1층'),
  place('Guanganmok', 35.1540, 129.1187, '南韓 Busan, Suyeong-gu, Gwangnam-ro, 156 1 층'),
  place('Nasari', 35.1535, 129.1190, '南韓 Busan, Suyeong-gu, Gwangan-ro 61beon-gil, 60 3층'),
  place('WorkingHoliday', 35.1529, 129.1181, '南韓 Busan, Suyeong-gu, Gwanganhaebyeon-ro, 235 3층'),
];
const haeundae = [
  place('DIART', 35.1588, 129.1983, '12 Cheongsapo-ro 128beon-gil, Haeundae, Busan, 南韓'),
  place('Photowave', 35.1590, 129.1985, '2 Cheongsapo-ro 128beon-gil, Haeundae, 부산시 南韓'),
];
const gijang = [place('PeakSquare', 35.2443, 129.2229, '864 Gijanghaean-ro, Gijang-eup, Gijang, Busan, 南韓')];

describe('clusterSavedPlaces', () => {
  it('puts the four 廣安里 places in one area', () => {
    const { clusters } = clusterSavedPlaces([...gwangalli, ...haeundae, ...gijang]);

    const area = clusters.find(cluster => cluster.places.some(entry => entry.id === 'Nasari'));
    expect(area?.places.map(entry => entry.id).sort()).toEqual(
      ['Dongmyeonsik', 'Guanganmok', 'Nasari', 'WorkingHoliday'],
    );
  });

  it('keeps 海雲台 apart from 廣安里', () => {
    // About 6km: a different day, not a different stop.
    const { clusters } = clusterSavedPlaces([...gwangalli, ...haeundae]);

    expect(clusters).toHaveLength(2);
  });

  it('names each area the way the traveller says it', () => {
    const { clusters } = clusterSavedPlaces([...gwangalli, ...haeundae, ...gijang]);

    expect(clusters.map(cluster => cluster.label)).toEqual(
      expect.arrayContaining(['Suyeong-gu', 'Haeundae', 'Gijang-eup']),
    );
  });

  it('gives the biggest area the first colour, and keeps it there', () => {
    // A palette handed out in discovery order recolours the list on every save,
    // and a colour that moves is a colour nobody learns.
    const first = clusterSavedPlaces([...gwangalli, ...haeundae, ...gijang]);
    const shuffled = clusterSavedPlaces([...gijang, ...haeundae, ...gwangalli]);

    expect(first.clusters[0].label).toBe('Suyeong-gu');
    expect(first.clusters.map(cluster => `${cluster.label}:${cluster.colorIndex}`))
      .toEqual(shuffled.clusters.map(cluster => `${cluster.label}:${cluster.colorIndex}`));
  });

  it('joins a chain of places along one beach', () => {
    // Single link: the two ends are 4km apart, and somebody walking it calls
    // the whole strip one place.
    const strip = [
      place('a', 35.1500, 129.1000),
      place('b', 35.1500, 129.1220),
      place('c', 35.1500, 129.1440),
    ];

    expect(clusterSavedPlaces(strip).clusters).toHaveLength(1);
  });

  it('sets a place with no coordinates aside rather than guessing', () => {
    const { clusters, unlocated } = clusterSavedPlaces([
      ...gwangalli,
      { id: 'dagok', placeName: '다곡소님' },
    ]);

    expect(unlocated.map(entry => entry.id)).toEqual(['dagok']);
    expect(clusters.flatMap(cluster => cluster.places.map(entry => entry.id))).not.toContain('dagok');
  });

  it('is empty for an empty collection', () => {
    expect(clusterSavedPlaces([])).toEqual({ clusters: [], unlocated: [] });
  });
});

describe('districtOf', () => {
  it('reads a romanised Korean district', () => {
    expect(districtOf('南韓 Busan, Suyeong-gu, Gwangnam-ro, 156')).toBe('Suyeong-gu');
    // 「Gijang-eup」 rather than 「Gijang」: the suffix is part of the name, and a
    // label reading 「Suyeong」 or 「Gijang」 alone is not what anyone writes.
    expect(districtOf('864 Gijanghaean-ro, Gijang-eup, Gijang, Busan')).toBe('Gijang-eup');
  });

  it('prefers the area people actually name', () => {
    // 「Haeundae」 is how the day gets described, even where the address also
    // carries an administrative district.
    expect(districtOf('12 Cheongsapo-ro 128beon-gil, Haeundae, Busan, 南韓')).toBe('Haeundae');
  });

  it('reads a Chinese or Korean district too', () => {
    expect(districtOf('釜山廣域市海雲台區中洞')).toBe('海雲台區');
    expect(districtOf('南韓 Busan, 영도구 해양힐링로 55')).toBe('영도구');
  });

  it('is undefined when the address says no such thing', () => {
    expect(districtOf('')).toBeUndefined();
    expect(districtOf(undefined)).toBeUndefined();
  });
});

describe('labelForCluster', () => {
  it('falls back to the place that anchors the area', () => {
    expect(labelForCluster([{ id: 'x', placeName: 'Peak square' }])).toBe('Peak square 一帶');
  });
});

describe('clusterOfPlace', () => {
  it('finds the area a card belongs to', () => {
    const { clusters } = clusterSavedPlaces([...gwangalli, ...haeundae]);

    expect(clusterOfPlace(clusters, 'DIART')?.label).toBe('Haeundae');
    expect(clusterOfPlace(clusters, 'nope')).toBeUndefined();
  });
});

/**
 * 「海雲台好像有兩個」.
 *
 * 清沙浦 and the market by 海雲台站 are 2.8km apart — far enough to be two
 * different afternoons, and both addressed 「Haeundae」. Two headings reading
 * the same word is worse than one covering both: the reader assumes a bug.
 */
describe('two areas the addresses call the same thing', () => {
  const cheongsapo = [
    place('DIART', 35.1607, 129.1919, '12 Cheongsapo-ro 128beon-gil, Haeundae, Busan, 南韓'),
    place('Photowave', 35.1607, 129.1924, '2 Cheongsapo-ro 128beon-gil, Haeundae, 부산시 南韓'),
  ];
  const market = [
    place('WeiZan', 35.1610, 129.1590, '46 Haeun-daero 608beon-gil, Haeundae, Busan, 南韓'),
    place('Market', 35.1615, 129.1622, '22-1 Gunam-ro 41beon-gil, Haeundae, Busan, 南韓'),
    place('Ant', 35.1611, 129.1607, '34 Gunam-ro, Haeundae, Busan, 南韓'),
  ];

  it('keeps them as two areas, because they are', () => {
    expect(clusterSavedPlaces([...cheongsapo, ...market]).clusters).toHaveLength(2);
  });

  it('tells them apart by the street, which is what tells them apart on the ground', () => {
    const { clusters } = clusterSavedPlaces([...cheongsapo, ...market]);

    expect(clusters.map(cluster => cluster.label).sort())
      .toEqual(['Haeundae · Cheongsapo', 'Haeundae · Gunam']);
  });

  it('leaves an area that collides with nothing alone', () => {
    const { clusters } = clusterSavedPlaces([...cheongsapo, ...gwangalli]);

    expect(clusters.map(cluster => cluster.label).sort()).toEqual(['Haeundae', 'Suyeong-gu']);
  });

  it('numbers them when no street separates them either', () => {
    // 「Haeundae ②」 at least says it is a different place; a bare repeat does not.
    const { clusters } = clusterSavedPlaces([
      place('a', 35.1607, 129.1919, 'Haeundae, Busan'),
      place('b', 35.1900, 129.2300, 'Haeundae, Busan'),
    ]);

    expect(clusters.map(cluster => cluster.label)).toEqual(['Haeundae ①', 'Haeundae ②']);
  });
});

/**
 * 「我覺得這個分區好不合理喔」.
 *
 * The headings read 「110042東京都台東区寿4丁目 6-2 ハーモニーレジデンス浅草#002
 * 503号室 一帶」, 「Alchemy 一帶」 and 「らぁ麺や 嶋 一帶」 — three groups in one
 * ward, each named after one of its own members.
 *
 * 区 and 區 are different characters, U+533A and U+5340, and only the
 * traditional one was in the pattern list. Every Japanese address matched
 * nothing, so every group fell through to naming itself after a member.
 */
describe('Japanese addresses', () => {
  it('reads the ward written the Japanese way', () => {
    expect(districtOf('110042東京都台東区寿4丁目 6-2')).toBe('台東区');
  });

  it('reads the ward Google writes in English', () => {
    expect(districtOf('2-chōme-3-1 Asakusa, Taito City, Tokyo 111-0032日本')).toBe('Taito City');
  });

  it('reads a romanised ward', () => {
    expect(districtOf('1-1 Jinnan, Shibuya-ku, Tokyo')).toBe('Shibuya-ku');
  });

  /** The ward decides the day; the prefecture is the whole trip. */
  it('prefers the ward over the city', () => {
    expect(districtOf('東京都渋谷区神南1-1')).toBe('渋谷区');
  });

  /** Korea still works, which is what this was written for. */
  it('leaves Korean addresses alone', () => {
    expect(districtOf('부산광역시 해운대구 중동')).toBe('해운대구');
    expect(districtOf('Suyeong-gu, Busan')).toBe('Suyeong-gu');
  });
});

describe('a group with no district anywhere', () => {
  const place = (id: string, placeName: string) => ({ id, placeName });

  /** A heading is a heading, not a postal address. */
  it('does not use a sixty-character address as a heading', () => {
    const label = labelForCluster([
      place('a', '110042東京都台東区寿4丁目 6-2 ハーモニーレジデンス浅草#002 503号室'),
      place('b', 'Alchemy'),
    ]);

    expect(label).toBe('Alchemy 一帶');
  });

  it('truncates when every name is long', () => {
    const label = labelForCluster([place('a', '110042東京都台東区寿4丁目 6-2 ハーモニーレジデンス浅草')]);

    expect(label.length).toBeLessThan(20);
    expect(label.endsWith(' 一帶')).toBe(true);
  });

  it('still says something for a group of nameless places', () => {
    expect(labelForCluster([])).toBe('這一區');
  });
});

/**
 * 「你在做分區的時候你要去抓取這個旅冊的國家地點 不然會有誤」.
 *
 * Run every country's conventions against every address and the first pattern
 * to match wins, whether or not it belongs to the country the trip is in.
 * 「-shi」 is Japanese and 「-si」 Korean; 區 is Taiwanese and Korean, 区 Japanese;
 * 「○○ City」 is how Google writes a Japanese ward in English and also how it
 * writes an ordinary city everywhere else.
 */
describe('the trip s country decides how an address is read', () => {
  it('reads a Japanese address the Japanese way', () => {
    expect(districtOf('110042東京都台東区寿4丁目 6-2', '日本')).toBe('台東区');
    expect(districtOf('2-chōme-3-1 Asakusa, Taito City, Tokyo', 'Japan')).toBe('Taito City');
  });

  it('reads a Korean address the Korean way', () => {
    expect(districtOf('釜山廣域市海雲台區中洞', '韓國')).toBe('海雲台區');
    expect(districtOf('남韓 Busan, 영도구 해양힐링로 55', '대한민국')).toBe('영도구');
  });

  it('reads a Taiwanese address with traditional characters', () => {
    expect(districtOf('台北市大安區忠孝東路', '台灣')).toBe('大安區');
  });

  /*
    The failure this scoping exists to prevent, kept as a test: Japan's 市 rule
    matches 釜山廣域市, so with the lists merged it beat Korea's 區 rule and the
    label came out as the whole city.
  */
  it('does not let one country s city rule beat another s district rule', () => {
    expect(districtOf('釜山廣域市海雲台區中洞')).toBe('海雲台區');
    expect(districtOf('釜山廣域市海雲台區中洞', '韓國')).toBe('海雲台區');
  });

  /** Busan's own area names are Busan's. */
  it('does not apply Korean area names to a Japanese trip', () => {
    expect(districtOf('Centum Building, 東京都渋谷区神南1-1', '日本')).toBe('渋谷区');
    expect(districtOf('Centum City, Busan', '韓國')).toBe('Centum');
  });

  /** An unrecorded country still tries everything; a label beats no label. */
  it('still reads an address when the country is unknown', () => {
    expect(districtOf('110042東京都台東区寿4丁目')).toBe('台東区');
    expect(districtOf('台北市大安區忠孝東路')).toBe('大安區');
  });
});

/**
 * 「成功載入 shibuya 那就要變成是 shibuya 區吧？」
 *
 * The heading is guessed out of the address, and Google writes Japanese wards
 * two ways — only one of them matchable. A place that has been looked up
 * already knows its ward, so the heading asks it before falling back to a
 * member's name.
 */
describe('a heading for a group whose address says no district', () => {
  const place = (id: string, placeName: string, over: Record<string, unknown> = {}) =>
    ({ id, placeName, ...over });

  it('uses the ward the lookup established', () => {
    const label = labelForCluster([
      place('a', 'らぁ麺や 嶋', {
        formattedAddress: '3-chōme-41-11 Honmachi, Shibuya, Tokyo 151-0071日本',
        district: 'Shibuya',
      }),
    ], '日本');

    expect(label).toBe('Shibuya');
  });

  /** The address still wins when it names one — it is the more specific text. */
  it('prefers a district readable from the address', () => {
    const label = labelForCluster([
      place('a', 'X', { formattedAddress: '110042東京都台東区寿4丁目', district: 'Shibuya' }),
    ], '日本');

    expect(label).toBe('台東区');
  });

  /** And the member's name remains the last resort. */
  it('falls back to a name when neither is known', () => {
    expect(labelForCluster([place('a', '朋友家')], '日本')).toBe('朋友家 一帶');
  });
});

/**
 * 「收藏的景點分區不正確」.
 *
 * This was single-linkage clustering, and single linkage chains. Measured on a
 * realistic central-Tokyo spread: 渋谷 ↔ 原宿 is 1.4 km, 原宿 ↔ 代代木 1.4 km,
 * 代代木 ↔ 新宿 0.8 km — thirteen places from 渋谷 to 四谷 came out as one group
 * spanning 5.8 km, which is exactly the 「最遠兩點約 5.9 公里」 his day reported
 * while its route zigzagged across the city. Every hop is close enough; the
 * chain is not.
 */
describe('一區不能靠接力串出來', () => {
  /* Real coordinates and the wards Google states for them. */
  const tokyo = [
    { id: 'a', placeName: '渋谷', latitude: 35.6580, longitude: 139.7016, district: 'Shibuya' },
    { id: 'b', placeName: '原宿', latitude: 35.6702, longitude: 139.7027, district: 'Shibuya' },
    { id: 'c', placeName: '代代木', latitude: 35.6830, longitude: 139.7020, district: 'Shibuya' },
    { id: 'd', placeName: '新宿御苑', latitude: 35.6852, longitude: 139.7101, district: 'Shinjuku City' },
    { id: 'e', placeName: '四谷', latitude: 35.6860, longitude: 139.7300, district: 'Shinjuku City' },
    { id: 'f', placeName: '中目黑', latitude: 35.6387, longitude: 139.7026, district: 'Meguro City' },
  ];

  it('不同區的地點不會因為很近就被併在一起', () => {
    const { clusters } = clusterSavedPlaces(tokyo, 2.5, '日本');

    const labels = clusters
      .map(cluster => cluster.places.map(place => place.placeName).sort().join('·'))
      .sort();

    // Three wards, three groups — not one chain of six.
    expect(labels).toEqual(['中目黑', '代代木·原宿·渋谷', '四谷·新宿御苑']);
  });

  /* 渋谷 and 新宿御苑 are 2.0 km apart — close enough to have been joined. */
  it('靠得夠近但分屬兩區的，仍然分開', () => {
    const { clusters } = clusterSavedPlaces(
      [tokyo[2], tokyo[3]],
      2.5,
      '日本',
    );

    expect(clusters).toHaveLength(2);
  });

  /* Distance still does the job it is good at: splitting one large ward. */
  it('同一區內仍然用距離拆成不同趟', () => {
    const { clusters } = clusterSavedPlaces([
      { id: 'x', placeName: '北端', latitude: 35.7200, longitude: 139.7700, district: 'Taito City' },
      { id: 'y', placeName: '南端', latitude: 35.6900, longitude: 139.7700, district: 'Taito City' },
    ], 2.5, '日本');

    expect(clusters).toHaveLength(2);
  });

  /* Records with no ward keep the old behaviour among themselves. */
  it('沒有區的紀錄之間照舊用距離', () => {
    const { clusters } = clusterSavedPlaces([
      { id: 'p', placeName: 'A', latitude: 35.6580, longitude: 139.7016 },
      { id: 'q', placeName: 'B', latitude: 35.6600, longitude: 139.7020 },
    ], 2.5, '日本');

    expect(clusters).toHaveLength(1);
  });
});
