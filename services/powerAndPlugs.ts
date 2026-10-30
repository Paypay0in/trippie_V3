/**
 * The voltage and the socket shape, for the country being travelled to.
 *
 * 「每個國家在行前 都要提醒電壓跟插座這件事 目前都沒有提醒到」, and then
 * 「我目前設定是持有中國護照 因此這邊寫台灣很奇怪！…只顯示旅遊目的地的！」.
 *
 * Hand-written, like the airport directory and the destination tips, and for
 * the same reason: this is durably true. A country's mains voltage and plug
 * standard do not change between the research call and the flight, so asking a
 * model about them every trip would pay a request and take a risk for a fact
 * that has been settled for fifty years. Anything that *is* time-sensitive —
 * entry rules, refunds — stays with the AI lookup above it.
 *
 * It describes the destination and nothing else. The first version compared
 * the destination against home and hardcoded home as 台灣, which is a guess
 * about the reader — and the reader who found it was travelling on a Chinese
 * passport, reading a line about Taiwanese plugs on a Mexican trip. The app
 * does not know where somebody's sockets are: a passport is not a residence,
 * and a residence is not where they are flying from.
 *
 * So no comparison, and no 「要不要帶轉接頭」 verdict, because that verdict needs
 * the half this app does not have. What it does have is exactly true: this is
 * the voltage, these are the socket shapes, and here is what that means for
 * the two kinds of thing people pack.
 */
import { countryKey } from './countryIdentity';

export interface PowerProfile {
  /** Mains voltage, volts. */
  voltage: number;
  /** Mains frequency, hertz. */
  frequency: number;
  /** IEC plug letters, e.g. `['C', 'F']`. */
  plugs: string[];
  /**
   * i18n key for anything the two numbers above cannot say on their own.
   * Resolved by the caller: this module never holds display text.
   */
  noteKey?: string;
}

interface Entry extends PowerProfile {
  /** Every spelling this country is stored under. i18n-data: matching keys. */
  names: string[];
}

/*
  Where a country runs two voltages or a socket zoo, the note says so rather
  than the table picking a winner — 「巴西 127V」 is true in São Paulo and false
  in Brasília, and a confident wrong number is worse than a sentence.
*/
const COUNTRIES: Entry[] = [
  { names: ['台灣', 'taiwan'], voltage: 110, frequency: 60, plugs: ['A', 'B'] },
  { names: ['日本', 'japan'], voltage: 100, frequency: 50, plugs: ['A', 'B'], noteKey: 'plan.power.noteJp' },
  { names: ['韓國', 'korea', 'south korea'], voltage: 220, frequency: 60, plugs: ['C', 'F'] },
  { names: ['中國', 'china'], voltage: 220, frequency: 50, plugs: ['A', 'C', 'I'] },
  { names: ['香港', 'hong kong'], voltage: 220, frequency: 50, plugs: ['G'] },
  { names: ['澳門', 'macau', 'macao'], voltage: 220, frequency: 50, plugs: ['G'] },
  { names: ['泰國', 'thailand'], voltage: 220, frequency: 50, plugs: ['A', 'B', 'C', 'O'] },
  { names: ['越南', 'vietnam'], voltage: 220, frequency: 50, plugs: ['A', 'C', 'F'] },
  { names: ['新加坡', 'singapore'], voltage: 230, frequency: 50, plugs: ['G'] },
  { names: ['馬來西亞', 'malaysia'], voltage: 240, frequency: 50, plugs: ['G'] },
  { names: ['菲律賓', 'philippines'], voltage: 220, frequency: 60, plugs: ['A', 'B', 'C'] },
  { names: ['印尼', 'indonesia'], voltage: 230, frequency: 50, plugs: ['C', 'F'] },
  { names: ['柬埔寨', 'cambodia'], voltage: 230, frequency: 50, plugs: ['A', 'C', 'G'] },
  { names: ['印度', 'india'], voltage: 230, frequency: 50, plugs: ['C', 'D', 'M'] },
  { names: ['美國', 'usa', 'united states'], voltage: 120, frequency: 60, plugs: ['A', 'B'] },
  { names: ['加拿大', 'canada'], voltage: 120, frequency: 60, plugs: ['A', 'B'] },
  { names: ['墨西哥', 'mexico'], voltage: 127, frequency: 60, plugs: ['A', 'B'] },
  { names: ['英國', 'uk', 'united kingdom'], voltage: 230, frequency: 50, plugs: ['G'] },
  { names: ['愛爾蘭', 'ireland'], voltage: 230, frequency: 50, plugs: ['G'] },
  { names: ['法國', 'france'], voltage: 230, frequency: 50, plugs: ['C', 'E'] },
  { names: ['德國', 'germany'], voltage: 230, frequency: 50, plugs: ['C', 'F'] },
  { names: ['義大利', 'italy'], voltage: 230, frequency: 50, plugs: ['C', 'F', 'L'] },
  { names: ['西班牙', 'spain'], voltage: 230, frequency: 50, plugs: ['C', 'F'] },
  { names: ['葡萄牙', 'portugal'], voltage: 230, frequency: 50, plugs: ['C', 'F'] },
  { names: ['荷蘭', 'netherlands'], voltage: 230, frequency: 50, plugs: ['C', 'F'] },
  { names: ['比利時', 'belgium'], voltage: 230, frequency: 50, plugs: ['C', 'E'] },
  { names: ['瑞士', 'switzerland'], voltage: 230, frequency: 50, plugs: ['C', 'J'], noteKey: 'plan.power.noteCh' },
  { names: ['奧地利', 'austria'], voltage: 230, frequency: 50, plugs: ['C', 'F'] },
  { names: ['捷克', 'czechia', 'czech republic'], voltage: 230, frequency: 50, plugs: ['C', 'E'] },
  { names: ['匈牙利', 'hungary'], voltage: 230, frequency: 50, plugs: ['C', 'F'] },
  { names: ['波蘭', 'poland'], voltage: 230, frequency: 50, plugs: ['C', 'E'] },
  { names: ['希臘', 'greece'], voltage: 230, frequency: 50, plugs: ['C', 'F'] },
  { names: ['土耳其', 'turkey', 'türkiye'], voltage: 230, frequency: 50, plugs: ['C', 'F'] },
  { names: ['俄羅斯', 'russia'], voltage: 230, frequency: 50, plugs: ['C', 'F'] },
  { names: ['瑞典', 'sweden'], voltage: 230, frequency: 50, plugs: ['C', 'F'] },
  { names: ['挪威', 'norway'], voltage: 230, frequency: 50, plugs: ['C', 'F'] },
  { names: ['芬蘭', 'finland'], voltage: 230, frequency: 50, plugs: ['C', 'F'] },
  { names: ['丹麥', 'denmark'], voltage: 230, frequency: 50, plugs: ['C', 'E', 'F', 'K'] },
  { names: ['冰島', 'iceland'], voltage: 230, frequency: 50, plugs: ['C', 'F'] },
  { names: ['澳洲', 'australia'], voltage: 230, frequency: 50, plugs: ['I'] },
  { names: ['紐西蘭', 'new zealand'], voltage: 230, frequency: 50, plugs: ['I'] },
  { names: ['阿聯', '阿拉伯聯合大公國', 'uae', 'united arab emirates'], voltage: 230, frequency: 50, plugs: ['G'] },
  { names: ['埃及', 'egypt'], voltage: 220, frequency: 50, plugs: ['C', 'F'] },
  { names: ['南非', 'south africa'], voltage: 230, frequency: 50, plugs: ['D', 'M', 'N'] },
  { names: ['巴西', 'brazil'], voltage: 127, frequency: 60, plugs: ['C', 'N'], noteKey: 'plan.power.noteBr' },
  { names: ['阿根廷', 'argentina'], voltage: 220, frequency: 50, plugs: ['C', 'I'] },
  { names: ['智利', 'chile'], voltage: 220, frequency: 50, plugs: ['C', 'L'] },
  { names: ['秘魯', 'peru'], voltage: 220, frequency: 60, plugs: ['A', 'B', 'C'] },
];

const BY_KEY = new Map<string, PowerProfile>();
COUNTRIES.forEach(({ names, ...profile }) => {
  names.forEach(name => {
    const key = countryKey(name);
    if (key && !BY_KEY.has(key)) BY_KEY.set(key, profile);
  });
});

/** The country's mains, or nothing when this table has never heard of it. */
export const powerProfileFor = (country?: string): PowerProfile | undefined => {
  const key = countryKey(country);
  return key ? BY_KEY.get(key) : undefined;
};

/** 「127V · 60Hz」. */
export const powerHeadline = (profile: PowerProfile): string =>
  `${profile.voltage}V · ${profile.frequency}Hz`;

/**
 * What the numbers mean for what is in the bag.
 *
 * The split is the useful part and survives the loss of the home country,
 * because it is a fact about the appliance rather than about the traveller:
 * almost everything with a charging brick is marked 100–240V and does not care
 * what the wall is; anything that makes heat does.
 */
export interface PowerAdviceLine {
  /** i18n key. */
  key: string;
  /**
   * Interpolation values. A `string[]` is a list the caller joins with the
   * locale's own separator — 「C、F」 in Chinese is "C, F" in English, and the
   * separator is copy, so this module must not pick one.
   */
  params?: Record<string, string | number | string[]>;
}

export const powerAdviceLines = (profile: PowerProfile): PowerAdviceLine[] => {
  const lines: PowerAdviceLine[] = [
    { key: 'plan.power.plugLine', params: { plugs: profile.plugs } },
    { key: 'plan.power.voltageLine', params: { voltage: profile.voltage } },
  ];
  if (profile.noteKey) lines.push({ key: profile.noteKey });
  return lines;
};
