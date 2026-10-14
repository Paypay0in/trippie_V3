/**
 * 「我也不理解為何這邊寫說我去我朋友家無法用大眾運輸」.
 *
 * Narita to Asakusa is the Keisei Skyliner. The app could not say so because
 * Google's Routes API carries no Japanese transit — and it could not even say
 * *that*, because knowing it requires knowing the trip is in Japan, and this
 * trip was created from a boarding pass and named 「沖繩」 by hand. Destination
 * detection never ran, so `travelCountry` was empty.
 *
 * The ticket knew the whole time.
 */
import { describe, expect, it } from 'vitest';
import { countryFromFlights, tripCountry } from './tripCountry';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { FlightAnchor } from '../types';

const leg = (over: Partial<FlightAnchor> = {}): FlightAnchor => ({
  id: 'leg', direction: 'OUTBOUND', departureDate: '2026-10-20', departureTime: '06:35',
  departureAirport: 'Taiwan Taoyuan International Airport', departureAirportIata: 'TPE',
  arrivalAirport: 'Narita International Airport', arrivalAirportIata: 'NRT',
  airportArrivalBufferMinutes: 120, source: 'MANUAL',
  ...over,
} as FlightAnchor);

describe('the country a ticket implies', () => {
  it('reads it off the arrival airport', () => {
    expect(countryFromFlights([leg()])).toBe('Japan');
  });

  /** Written down beats inferred, always. */
  it('prefers what somebody actually recorded', () => {
    expect(tripCountry('日本', [leg()])).toBe('日本');
    expect(tripCountry('   ', [leg()])).toBe('Japan');
  });

  /** Where the trip happens, not where it starts. */
  it('uses the outbound arrival, not the departure', () => {
    expect(countryFromFlights([leg()])).not.toBe('Taiwan');
  });

  it('ignores the return leg when both are present', () => {
    const back = leg({
      id: 'back', direction: 'RETURN',
      arrivalAirport: 'Taiwan Taoyuan International Airport', arrivalAirportIata: 'TPE',
    });

    expect(countryFromFlights([back, leg()])).toBe('Japan');
  });

  /** An anchor stored before the airports were located still has its code. */
  it('falls back to the directory when the anchor holds no country', () => {
    expect(countryFromFlights([leg({ arrivalAirportCountry: undefined })])).toBe('Japan');
  });

  it('trusts the anchor over the directory when it has one', () => {
    expect(countryFromFlights([leg({ arrivalAirportCountry: '日本' })])).toBe('日本');
  });

  /** Nothing to go on is answered with nothing, not with a guess. */
  it('says nothing when there are no flights', () => {
    expect(countryFromFlights([])).toBeUndefined();
    expect(tripCountry(undefined, [])).toBeUndefined();
  });

  it('says nothing for an airport the directory does not hold', () => {
    expect(countryFromFlights([leg({ arrivalAirportIata: 'ZZZ' })])).toBeUndefined();
  });
});

/**
 * A fallback nothing calls is a fallback that does not exist. This project has
 * shipped one of those, so the call site is asserted rather than assumed.
 */
describe('the itinerary is given the resolved country', () => {
  it('is wired into the calendar', () => {
    const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    const start = app.indexOf('<ItineraryCalendar');
    expect(start).toBeGreaterThan(-1);

    expect(app.slice(start, start + 2000)).toContain('destinationCountry={tripCountry(');
    expect(app).toContain('flightAnchors,\n          )}');
  });
});

/**
 * 「沒有的話 app 要問用戶是哪個國家」 — the gate for that question.
 *
 * Asserted at the call site, because the decision is App's: it is the only
 * thing that can see the flight anchors, and a planner that guessed again
 * would disagree with it.
 */
describe('when the app has to ask', () => {
  it('does not ask when the ticket already answers', () => {
    expect(tripCountry(undefined, [leg()])).toBe('Japan');
  });

  it('does not ask when somebody recorded it', () => {
    expect(tripCountry('日本', [])).toBe('日本');
  });

  /** Nothing at all: a trip typed by hand, named 沖繩, with no ticket yet. */
  it('has nothing to go on, which is the case that asks', () => {
    expect(tripCountry('', [])).toBeUndefined();
  });

  it('is gated on exactly that in App', () => {
    const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    const start = app.indexOf('onPickCountry={');
    expect(start).toBeGreaterThan(-1);

    const gate = app.slice(start, start + 400);
    expect(gate).toContain('tripCountry(');
    expect(gate).toContain('flightAnchors');
    expect(gate).toContain('setIsCountryModalOpen(true)');
  });
});
