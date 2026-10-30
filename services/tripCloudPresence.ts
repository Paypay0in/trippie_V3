/**
 * Which trips on this device the cloud has never heard of.
 *
 * A trip is published when it is opened while signed in — `ensureTripRow`
 * runs out of `useTripSync`, which only starts once a trip is the open one.
 * So a trip created and never reopened stays on the device that made it, and
 * nothing on any screen says so.
 *
 * 「釜山的旅冊怎麼都不見了」 cost most of a morning to that silence: the trip
 * was on one browser, absent from the account, and both screens looked
 * entirely normal. The numbers that settled it existed the whole time behind
 * `?sync=1` — which is a thing a developer types, not a thing a traveller
 * can be asked to do from Japan.
 *
 * So this says it on the shelf. 「未上傳」 against the card, and the two counts
 * side by side, because 「雲端有 5」 and 「這台有 10」 are different facts and
 * only seeing both tells you they disagree.
 */

import i18n from '../i18n/config';

/**
 * Whether the cloud's list is known yet.
 *
 * `undefined` is 「not asked or still asking」 and must never be drawn as
 * 「not uploaded」: on every cold start there is a moment before the fetch
 * returns when every trip would wear that badge, and a warning that cries
 * wolf on every launch is one nobody reads on the day it is true.
 */
export type CloudTripIds = ReadonlySet<string> | undefined;

export const isOnlyOnThisDevice = (
  tripId: string,
  cloudTripIds: CloudTripIds,
  signedIn: boolean,
): boolean => {
  // Signed out, nothing is uploaded and saying so on every card is noise.
  // The one line about signing in covers it, once.
  if (!signedIn || !cloudTripIds) return false;
  return !cloudTripIds.has(tripId);
};

export interface CloudPresenceSummary {
  /** The sentence for the shelf, or nothing when there is nothing to say. */
  text: string;
  /** True when some trip on this device is not on the server. */
  behind: boolean;
}

export const cloudPresenceSummary = (
  localIds: string[],
  cloudTripIds: CloudTripIds,
  signedIn: boolean,
): CloudPresenceSummary => {
  if (!signedIn) {
    return localIds.length > 0
      ? { text: i18n.t('cloudSync.signedOutLocalOnly'), behind: true }
      : { text: '', behind: false };
  }
  if (!cloudTripIds) return { text: '', behind: false };

  const missing = localIds.filter(id => !cloudTripIds.has(id)).length;
  if (missing === 0) return { text: '', behind: false };
  /*
    Both numbers, not just the gap. 「2 趟未上傳」 alone reads as a transient
    queue; 「本機 10・雲端 5」 is the shape of the problem, and it is what the
    traveller can compare against another device.
  */
  return {
    text: i18n.t('cloudSync.localVsCloud', {
      local: localIds.length,
      cloud: cloudTripIds.size,
      missing,
    }),
    behind: true,
  };
};
