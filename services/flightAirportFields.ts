/**
 * Writing an airport onto a flight anchor — the half of anchor setup that has
 * no words in it.
 *
 * It lived in `flightAnchorSetup.ts` until that module started translating its
 * leg labels and validation messages, which gave it a module-level
 * `i18n/config` import. `server.ts` reaches it through
 * `flightIntake → applyAirport`, so the browser's react-i18next and language
 * detector were being dragged into the server's process to copy six fields
 * around. `tests/serverNeverImportsBrowserI18n.test.ts` names this exact fix:
 * move the wordless half out, the way `enumerateTripDates` went to
 * `services/tripDates.ts`, so the words can live where only the browser looks.
 */
import { FlightAirport, FlightAnchor } from '../types';

/** Write a canonical airport onto one side of an anchor. Clears it when undefined. */
export const applyAirport = (
  anchor: FlightAnchor,
  side: 'departure' | 'arrival',
  airport: FlightAirport | undefined,
): FlightAnchor => {
  if (side === 'departure') {
    return {
      ...anchor,
      departureAirport: airport ? airport.name : '',
      departureAirportIata: airport?.iataCode,
      departureAirportCity: airport?.city,
      departureAirportCountry: airport?.country,
      departureAirportLatitude: airport?.latitude,
      departureAirportLongitude: airport?.longitude,
    };
  }
  return {
    ...anchor,
    arrivalAirport: airport ? airport.name : undefined,
    arrivalAirportIata: airport?.iataCode,
    arrivalAirportCity: airport?.city,
    arrivalAirportCountry: airport?.country,
    arrivalAirportLatitude: airport?.latitude,
    arrivalAirportLongitude: airport?.longitude,
  };
};
