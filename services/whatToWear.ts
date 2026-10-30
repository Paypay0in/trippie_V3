/**
 * What to wear tomorrow, from tomorrow's numbers.
 *
 * 「少一個明天衣著建議！」 — asked of a card that already shows a temperature,
 * a high, a low and a chance of rain. The advice is derived from those rather
 * than written by a model: a sentence about a jacket is only useful if it
 * agrees with the forecast printed directly above it, and two writers of one
 * fact is the defect this project is made of.
 *
 * It is also the reason this works while the grounded lookups do not. There
 * is nothing to search for — the forecast is already here.
 *
 * The rules are the ordinary ones a person uses, and deliberately plain. A
 * confident 「帶一件薄外套」 at 28° reads as expertise and is simply wrong.
 */
import i18n from '../i18n/config';

export interface TomorrowWeather {
  high: number;
  low: number;
  precipitationProbability: number;
  condition?: string;
}

/** Rain this likely is worth carrying an umbrella for. */
const UMBRELLA = 40;
/** A gap this wide between day and night is felt, whatever the high is. */
const SWING = 8;

export const whatToWear = (tomorrow: TomorrowWeather): string[] => {
  const lines: string[] = [];
  const { high, low, precipitationProbability: rain } = tomorrow;

  /*
    Dressed for the cold part of the day, because that is the part somebody
    is unprepared for. A morning at 12° is the thing a jacket is for, even if
    the afternoon reaches 24°.
  */
  if (low <= 5) lines.push(i18n.t('tripLive.wear.veryCold'));
  else if (low <= 12) lines.push(i18n.t('tripLive.wear.cold'));
  else if (low <= 18) lines.push(i18n.t('tripLive.wear.cool'));
  else if (high >= 30) lines.push(i18n.t('tripLive.wear.hot'));
  else lines.push(i18n.t('tripLive.wear.mild'));

  // The swing, when it is big enough to be the thing that catches somebody
  // out. Said as well as the temperature, not instead of it.
  if (high - low >= SWING && low > 12) lines.push(i18n.t('tripLive.wear.swing', { degrees: Math.round(high - low) }));

  if (rain >= 70) lines.push(i18n.t('tripLive.wear.rainLikely'));
  else if (rain >= UMBRELLA) lines.push(i18n.t('tripLive.wear.rainPossible'));

  return lines;
};

/** 「明天 29° / 19°・多雲」 — the forecast the advice was built on. */
export const tomorrowLabel = (tomorrow: TomorrowWeather): string => {
  const high = Math.round(tomorrow.high);
  const low = Math.round(tomorrow.low);
  /*
    `condition` arrives from the weather provider, in whatever language it
    answered in. It is not ours to translate here — only the frame around it
    is, which is why the condition is interpolated rather than rebuilt.
  */
  return tomorrow.condition
    ? i18n.t('tripLive.wear.tomorrowForecastCondition', { high, low, condition: tomorrow.condition })
    : i18n.t('tripLive.wear.tomorrowForecast', { high, low });
};
