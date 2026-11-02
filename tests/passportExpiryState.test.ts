import { describe, expect, it } from 'vitest';

import { passportExpiryState } from '../services/passportExpiryState';

/**
 * The four answers the passport card is allowed to give.
 *
 * Founder V-9-SCOPE A struck the 「valid」 badge this module was first designed
 * to feed, and the reason is the whole point of the file: how much validity a
 * destination demands beyond the stay is that destination's rule, not a
 * constant. Some ask six months past entry, some past departure, some only
 * through the stay, some waive it by treaty. So nothing here returns 「fine」 —
 * `ok` means 「no reason to raise it」, and `tight` means 「go and read the
 * destination's own rule」.
 *
 * `today` is a parameter, never read from the clock inside. A module that
 * knows what day it is cannot be tested on the day the arithmetic matters.
 */
describe('passportExpiryState', () => {
  it('is absent when nobody has entered a date', () => {
    expect(passportExpiryState({ tripEndDate: '2027-03-10', today: '2026-10-31' })).toBe('absent');
    expect(passportExpiryState({ expiresOn: '', tripEndDate: '2027-03-10', today: '2026-10-31' })).toBe('absent');
  });

  it('treats an unparseable or out-of-range stored value as absent, never as a date', () => {
    for (const broken of ['soon', '2027-13-01', '2027-02-30', '27-03-10', '2027/03/10', '1700-01-01', '2999-01-01']) {
      expect(passportExpiryState({ expiresOn: broken, tripEndDate: '2027-03-10', today: '2026-10-31' })).toBe('absent');
    }
  });

  it('is expired when the date has already passed', () => {
    expect(passportExpiryState({ expiresOn: '2026-10-30', tripEndDate: '2027-03-10', today: '2026-10-31' })).toBe('expired');
  });

  it('is expired on the day it expires, because that is how a counter reads it', () => {
    expect(passportExpiryState({ expiresOn: '2026-10-31', tripEndDate: '2027-03-10', today: '2026-10-31' })).toBe('expired');
  });

  it('is tight when the passport expires before the trip ends', () => {
    expect(passportExpiryState({ expiresOn: '2027-03-01', tripEndDate: '2027-03-10', today: '2026-10-31' })).toBe('tight');
  });

  it('is tight when it clears the trip by less than six months', () => {
    expect(passportExpiryState({ expiresOn: '2027-06-01', tripEndDate: '2027-03-10', today: '2026-10-31' })).toBe('tight');
  });

  it('is ok when it clears the trip by more than six months', () => {
    expect(passportExpiryState({ expiresOn: '2029-01-01', tripEndDate: '2027-03-10', today: '2026-10-31' })).toBe('ok');
  });

  it('falls back to today when the trip has no end date, so a dateless trip still warns', () => {
    expect(passportExpiryState({ expiresOn: '2026-12-01', today: '2026-10-31' })).toBe('tight');
    expect(passportExpiryState({ expiresOn: '2029-01-01', today: '2026-10-31' })).toBe('ok');
  });

  it('reads an expired passport as expired even on a trip with no dates', () => {
    expect(passportExpiryState({ expiresOn: '2020-01-01', today: '2026-10-31' })).toBe('expired');
  });
});
