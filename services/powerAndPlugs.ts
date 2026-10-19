/**
 * The voltage and the socket shape, for the country being travelled to.
 *
 * 「每個國家在行前 都要提醒電壓跟插座這件事 目前都沒有提醒到」.
 *
 * Hand-written, like the airport directory and the destination tips, and for
 * the same reason: this is durably true. A country's mains voltage and plug
 * standard do not change between the research call and the flight, so asking a
 * model about them every trip would pay a request and take a risk for a fact
 * that has been settled for fifty years. Anything that *is* time-sensitive —
 * entry rules, refunds — stays with the AI lookup above it.
 *
 * Two questions are answered here, and they are not the same question:
 *
 * - **轉接頭** — does the plug fit? Purely about shape. A Taiwanese charger is
 *   Type A; a Korean socket takes C and F; so it does not fit, and no amount of
 *   voltage agreement changes that.
 * - **變壓器** — will it survive the voltage? Almost every phone, laptop and
 *   camera charger made this century is marked 100–240V and needs nothing. What
 *   does not is anything that makes heat: a hairdryer, a straightener, a
 *   travel kettle.
 *
 * Conflating the two is how 「要帶變壓器」 ends up on a screen for somebody who
 * only owns a phone charger.
 */
import { countryKey } from './countryIdentity';

export interface PowerProfile {
  /** Mains voltage, volts. */
  voltage: number;
  /** Mains frequency, hertz. */
  frequency: number;
  /** IEC plug letters, e.g. `['C', 'F']`. */
  plugs: string[];
  /** Anything the two numbers above cannot say on their own. */
  note?: string;
}

interface Entry extends PowerProfile {
  /** Every spelling this country is stored under. */
  names: string[];
}

/*
  Where a country runs two voltages or a socket zoo, the note says so rather
  than the table picking a winner — 「巴西 127V」 is true in São Paulo and false
  in Brasília, and a confident wrong number is worse than a sentence.
*/
const COUNTRIES: Entry[] = [
  { names: ['台灣', 'taiwan'], voltage: 110, frequency: 60, plugs: ['A', 'B'] },
  { names: ['日本', 'japan'], voltage: 100, frequency: 50, plugs: ['A', 'B'], note: '東日本 50Hz、西日本 60Hz，一般家電不受影響。' },
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
  { names: ['瑞士', 'switzerland'], voltage: 230, frequency: 50, plugs: ['C', 'J'], note: '瑞士的 J 型孔位較窄，部分歐規轉接頭插不進去。' },
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
  { names: ['巴西', 'brazil'], voltage: 127, frequency: 60, plugs: ['C', 'N'], note: '巴西 127V 與 220V 並存，插座旁通常會標電壓，入住後先看一眼。' },
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

export interface PowerAdvice extends PowerProfile {
  /** The plugs at home, for saying what will and will not fit. */
  homePlugs: string[];
  homeVoltage: number;
  /** Nothing the traveller owns will physically go in without one. */
  needsAdapter: boolean;
  /** The voltage is different enough that heating appliances will not cope. */
  differentVoltage: boolean;
}

/** Taiwan, where this app is used, unless the traveller has said otherwise. */
const DEFAULT_HOME = '台灣';

/**
 * What to tell somebody flying from `home` to `destination`.
 *
 * Nothing is returned when either country is unknown to the table, or when the
 * two are the same place. A reminder that says 「台灣 110V，記得帶轉接頭」 to
 * somebody flying to Taipei is worse than no reminder: it teaches the reader
 * that this section is noise.
 */
export const powerAdviceFor = (
  destination?: string,
  home: string = DEFAULT_HOME,
): PowerAdvice | undefined => {
  const there = powerProfileFor(destination);
  const here = powerProfileFor(home) || powerProfileFor(DEFAULT_HOME);
  if (!there || !here) return undefined;
  if (countryKey(destination) === countryKey(home)) return undefined;

  return {
    ...there,
    homePlugs: here.plugs,
    homeVoltage: here.voltage,
    // Shape only. Any shared letter means at least one socket takes the plug.
    needsAdapter: !there.plugs.some(plug => here.plugs.includes(plug)),
    /*
      Ten per cent, which is the margin equipment is built to tolerate. 110 and
      120 are the same supply as far as anything plugged into them is
      concerned; 110 and 220 are not.
    */
    differentVoltage: Math.abs(there.voltage - here.voltage) / here.voltage > 0.1,
  };
};

/** 「220V · C/F 型插座」. */
export const powerHeadline = (advice: PowerProfile): string =>
  `${advice.voltage}V · ${advice.plugs.join('/')} 型插座`;

/**
 * The sentence underneath, in the order the traveller has to act on it.
 *
 * The converter line names what actually needs one. 「要帶變壓器」 on its own
 * sends somebody shopping for a brick to charge a phone that never needed it.
 */
export const powerAdviceLines = (advice: PowerAdvice): string[] => {
  const lines: string[] = [];

  if (advice.needsAdapter) {
    lines.push(`台規插頭插不進去，要帶轉接頭（${advice.homePlugs.join('/')} → ${advice.plugs.join('/')}）。`);
  } else {
    lines.push('插頭形狀和台灣一樣，不用轉接頭。');
  }

  if (advice.differentVoltage) {
    lines.push(
      `電壓 ${advice.homeVoltage}V → ${advice.voltage}V。手機、筆電、相機的充電器多半標示 100–240V，直接用沒問題；`
      + '吹風機、離子夾、快煮壺這類會發熱的才需要變壓器，或是在當地買、用飯店的。',
    );
  } else {
    lines.push(`電壓和台灣一樣是 ${advice.voltage}V，電器可以直接用。`);
  }

  if (advice.note) lines.push(advice.note);
  return lines;
};

/**
 * The one thing that has to be bought before departure, or nothing.
 *
 * Only the adapter, and only when nothing will fit without it. A converter is
 * deliberately not a chore: most travellers need none, and a preparation list
 * that fills itself with things nobody asked for is a list people stop
 * reading — and then the item that mattered is in it too.
 *
 * Shares `powerAdviceFor` with the screen rather than deciding again, so the
 * card and the checklist can never disagree about whether a plug fits.
 *
 * Not wired to anything yet. Trip creation knows the destination as free text
 * （「首爾」）, and this needs the country; seeding it from there would fire for
 * somebody who happened to type 「韓國」 and stay silent for everybody else,
 * which is a checklist that is wrong in a way nobody can see. It is wired the
 * day the country is resolved before the list is seeded.
 */
export const adapterPreparationFor = (
  destination?: string,
  home?: string,
): string | null => {
  const advice = powerAdviceFor(destination, home);
  if (!advice?.needsAdapter) return null;
  return `帶萬用轉接頭（${advice.plugs.join('/')} 型插座）`;
};
