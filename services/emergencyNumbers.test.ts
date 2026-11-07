/**
 * The rule that decides what a traveller may dial.
 *
 * Board: TRAVEL-SOS-QB-SOURCES = C (automated sourcing eventually) with its
 * own condition — no traceable official source, no dialable number — and
 * TRAVEL-SOS-T1-STAGE = A (a verified country is required before T1 is
 * accepted; an empty screen is not acceptance).
 *
 * So the tests that matter here are the refusals.
 */
import { describe, expect, it } from 'vitest';
import {
  EMERGENCY_NUMBERS,
  EmergencyNumber,
  dialableNumbers,
  numbersForCountry,
  unavailableReason,
} from './emergencyNumbers';

const row = (overrides: Partial<EmergencyNumber> = {}): EmergencyNumber => ({
  country: '日本',
  countryCode: 'JP',
  purpose: 'police',
  number: '110',
  issuingBody: 'Example Authority',
  sourceUrl: 'https://example.go.jp/',
  sourceTitle: 'Example',
  checkedAt: '2026-11-08',
  status: 'published',
  ...overrides,
});

describe('what may be dialled', () => {
  it('ships with nothing published, because nothing has been sourced yet', () => {
    /*
      Asserted, not assumed. A row added to the bundled dataset renders as a
      number somebody may dial in an emergency, so 「it is still empty」 is
      worth a test rather than a comment.
    */
    expect(EMERGENCY_NUMBERS).toEqual([]);
  });

  it('offers a published row', () => {
    expect(dialableNumbers('日本', [row()]).map(entry => entry.number)).toEqual(['110']);
  });

  it('refuses an unverified row', () => {
    expect(dialableNumbers('日本', [row({ status: 'unverified' })])).toEqual([]);
  });

  it('refuses a conflicted row', () => {
    // Two official bodies stating different numbers is exactly when a product
    // is most tempted to pick one. It must not.
    expect(dialableNumbers('日本', [row({ status: 'conflicted' })])).toEqual([]);
  });

  it('refuses a stale row', () => {
    expect(dialableNumbers('日本', [row({ status: 'stale' })])).toEqual([]);
  });

  it('matches the country however it was written', () => {
    // 日本 / Japan / JP are one country; `countryKey` already knows that, and
    // this must not become a second answer to the same question.
    expect(dialableNumbers('Japan', [row()])).toHaveLength(1);
    expect(dialableNumbers('JP', [row()])).toHaveLength(1);
    expect(dialableNumbers('韓國', [row()])).toHaveLength(0);
  });
});

describe('why nothing is shown', () => {
  it('says the country is unknown when it is', () => {
    expect(unavailableReason(undefined, [row()])).toBe('no_country');
    expect(unavailableReason('   ', [row()])).toBe('no_country');
  });

  it('says there is no data when the country is simply absent', () => {
    expect(unavailableReason('韓國', [row()])).toBe('no_data');
  });

  it('tells an unverified country apart from an unknown one', () => {
    // Different sentences for the traveller: 「we hold nothing」 and 「we hold
    // something we will not vouch for」 are not the same admission.
    expect(unavailableReason('日本', [row({ status: 'unverified' })])).toBe('not_verified');
  });

  it('says nothing is wrong when something is publishable', () => {
    expect(unavailableReason('日本', [row()])).toBeNull();
  });
});

describe('the shape a row has to carry', () => {
  it('keeps the international form apart from the local one', () => {
    /*
      110 dialled from a foreign SIM may not route. The record holds both, so
      the screen can never present one as the other.
    */
    const entry = row({ internationalNumber: '+81-3-3501-0110' });
    expect(entry.number).not.toBe(entry.internationalNumber);
    expect(numbersForCountry('日本', [entry])[0].internationalNumber).toBe('+81-3-3501-0110');
  });
});
