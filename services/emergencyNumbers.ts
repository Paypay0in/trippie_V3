/**
 * 旅途安心 / Travel SOS — the emergency numbers, and the rule about showing them.
 *
 * Every other wrong value in this product costs a traveller inconvenience. A
 * wrong emergency number costs them the call. So this module's job is not
 * 「hold numbers」 — it is to decide what may become a tappable button, and to
 * say 尚未提供 for everything else.
 *
 * The published dataset is EMPTY on purpose. Founder decision
 * TRAVEL-SOS-QB-SOURCES = C sets the eventual pipeline (automated collection,
 * automated cross-checking) and its own text forbids publishing a number with
 * no traceable official source. No source has been collected yet — fetching is
 * behind its own grant — so nothing is published, and the screen says so.
 *
 * Seeding is therefore a DATA change, not a code change: add rows, and the
 * same rule below decides what they are allowed to do.
 *
 * Independence is judged on the ISSUING BODY, not the domain. Two sites can
 * both be reprinting one ministry's page — one source wearing two hats — and a
 * domain comparison would pass it. For Japan the bodies are naturally distinct
 * (police, fire/ambulance, coast guard), so each number has an owner.
 */
import { countryKey } from './countryIdentity';

/**
 * What the number is for.
 *
 * Not a police/ambulance pair: Japan's 118 is the coast guard, and 112 in much
 * of Europe is one number for everything. A two-slot model is wrong before the
 * first row is written.
 */
export type EmergencyPurpose =
  | 'police'
  | 'ambulance'
  | 'fire'
  | 'coastguard'
  | 'unified'
  | 'other';

/**
 * Why a row may or may not be dialled.
 *
 * `unverified` and `conflicted` are not errors — they are the honest states of
 * a dataset that refuses to guess, and they render as 尚未提供.
 */
export type EmergencyStatus = 'published' | 'unverified' | 'conflicted' | 'stale';

export interface EmergencyNumber {
  /** The country as the source wrote it; matched through `countryKey`. */
  country: string;
  /**
   * ISO code, recorded from the source rather than computed at runtime.
   *
   * Deliberately not derived from a display name here: the app already has one
   * answer to 「which country is this」 (`countryKey`) and a second derivation
   * is the defect shape this codebase keeps paying for.
   */
  countryCode?: string;
  purpose: EmergencyPurpose;
  /** As dialled inside the country. */
  number: string;
  /**
   * The form an official source states for dialling from abroad, if it states
   * one. A local short code may not route from a foreign SIM, and presenting
   * one as the other is a failure that only shows up in an emergency.
   */
  internationalNumber?: string;
  /** The authority that published the page. Independence is judged on this. */
  issuingBody: string;
  sourceUrl: string;
  sourceTitle: string;
  /** ISO date the page was actually read. */
  checkedAt: string;
  /** The other issuing bodies that stated the same number. */
  agreedBy?: string[];
  status: EmergencyStatus;
}

/**
 * Empty until a human has compared two independent official sources.
 *
 * Not a placeholder to be filled in casually: a row added here renders as a
 * number somebody may dial in an emergency.
 */
export const EMERGENCY_NUMBERS: EmergencyNumber[] = [];

/** Every row held for a country, whatever its status. */
export const numbersForCountry = (
  country: string | undefined,
  dataset: EmergencyNumber[] = EMERGENCY_NUMBERS,
): EmergencyNumber[] => {
  const key = countryKey(country);
  if (!key) return [];
  return dataset.filter(entry => countryKey(entry.country) === key);
};

/**
 * The rows that may be rendered as something to dial.
 *
 * One home for this rule. The screen must never filter by status itself — a
 * second copy of this decision is a second answer, and the day they disagree
 * somebody dials a number nobody verified.
 */
export const dialableNumbers = (
  country: string | undefined,
  dataset: EmergencyNumber[] = EMERGENCY_NUMBERS,
): EmergencyNumber[] =>
  numbersForCountry(country, dataset).filter(entry => entry.status === 'published');

/** Why nothing is shown, so the screen can say it rather than render a blank. */
export type UnavailableReason = 'no_country' | 'no_data' | 'not_verified';

export const unavailableReason = (
  country: string | undefined,
  dataset: EmergencyNumber[] = EMERGENCY_NUMBERS,
): UnavailableReason | null => {
  if (!countryKey(country)) return 'no_country';
  if (dialableNumbers(country, dataset).length > 0) return null;
  return numbersForCountry(country, dataset).length === 0 ? 'no_data' : 'not_verified';
};
