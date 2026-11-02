/**
 * What the passport card is allowed to say about an expiry date.
 *
 * One home for one rule. The card renders in three places — the trip setup
 * screen and both entries into the preparation page — and a date comparison
 * written three times is a date comparison with three answers.
 *
 * It does NOT decide whether the traveller may enter anywhere. Founder
 * V-9-SCOPE A struck the 「valid」 badge for the right reason: how much validity
 * a destination demands beyond the stay is that destination's rule. Six months
 * past entry is common and far from universal — some count from departure,
 * some only through the stay, some waive it by treaty. A green tick computed
 * from one constant would be wrong at a real counter, so the strongest thing
 * returned here is `ok`, meaning 「no reason to raise it」, and `tight` means
 * 「go and read the destination's own rule」.
 *
 * `today` is a parameter. A module that reads the clock itself cannot be
 * tested on the day its arithmetic matters.
 */

export type PassportExpiryState = 'absent' | 'expired' | 'tight' | 'ok';

/** Months of headroom past the trip's end before the card stays quiet. */
const QUIET_MONTHS = 6;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A calendar date, or null for anything that is not one.
 *
 * Round-tripping through `toISOString` is what rejects 2027-02-30 and
 * 2027-13-01: `Date` would roll both forward into a real day and hand back a
 * date nobody typed. A stored value we cannot read is treated as absent, never
 * repaired into a guess — the traveller typed it, and inventing a different
 * date is worse than admitting we have none.
 */
const parseDate = (value?: string): Date | null => {
  const match = ISO_DATE.exec((value ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 1900 || year > 2100) return null;
  const date = new Date(`${match[0]}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === match[0] ? date : null;
};

const addMonths = (date: Date, months: number): Date => {
  const shifted = new Date(date.getTime());
  const day = shifted.getUTCDate();
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + months);
  /*
    Clamp into the shifted month rather than letting it overflow: six months
    after 31 August is the end of February, not 2 or 3 March. The overflow
    version would quietly move the threshold by two days for a handful of
    dates, which is the kind of difference nobody can reproduce later.
  */
  const lastOfMonth = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(day, lastOfMonth));
  return shifted;
};

export const passportExpiryState = ({
  expiresOn,
  tripEndDate,
  today,
}: {
  /** The date the traveller typed, if they typed one. */
  expiresOn?: string;
  /** The trip's last day. Absent on trips that have no dates yet. */
  tripEndDate?: string;
  /** Today, passed in by the caller. */
  today: string;
}): PassportExpiryState => {
  const expiry = parseDate(expiresOn);
  const now = parseDate(today);
  if (!expiry || !now) return 'absent';

  /*
    Expiring today counts as expired. Nobody at a desk reads 「valid until the
    31st」 as 「good on the 31st」, and the safe direction for a wrong guess here
    is to tell somebody to check.
  */
  if (expiry.getTime() <= now.getTime()) return 'expired';

  /*
    No trip end date falls back to today — not to silence. A trip whose dates
    are not set yet is exactly the one being planned, and a passport expiring
    in five weeks is worth raising before the flights are booked.
  */
  const reference = parseDate(tripEndDate) ?? now;
  if (expiry.getTime() <= reference.getTime()) return 'tight';
  return expiry.getTime() <= addMonths(reference, QUIET_MONTHS).getTime() ? 'tight' : 'ok';
};
