import { describe, expect, it } from "vitest";

import { buildArchivedTrip, readStoredTravelBook } from "./archiveTrip";
import type { TripDraft } from "./tripPersistence";
import type {
  FlightAnchor,
  SavedInspiration,
  SettlementBatch,
  TravelBook,
} from "../types";

/**
 * 封存 = 旅程已完成（FDR-20261028-001），and a finished trip keeps 行程、
 * 行程照片、日記、景點、餐廳. The draft autosave already stores all of it; the
 * archive path used to write a shorter list and then delete the draft, so
 * whatever it omitted was gone for good.
 *
 * These tests pin the archived record against that promise, field by field.
 */

const inspiration: SavedInspiration = {
  id: "insp-1",
  title: "一蘭拉麵",
  placeName: "一蘭拉麵 新宿店",
  sourceType: "PLACE",
};

const anchor = {
  id: "fa-1",
  direction: "RETURN",
  departureDate: "2026-10-24",
  departureTime: "18:30",
  departureAirport: "NRT",
} as FlightAnchor;

const batch = {
  id: "batch-1",
  tripId: "trip-1",
  title: "第一批",
  expenseIds: ["e1"],
  memberIds: ["m1"],
  status: "open",
  createdAt: "2026-10-21T00:00:00.000Z",
} as SettlementBatch;

const sourceDraft: TripDraft = {
  id: "trip-1",
  name: "東京",
  destination: "東京",
  destinationCountry: "日本",
  destinationAddress: "Tokyo, Japan",
  destinationLatitude: 35.68,
  destinationLongitude: 139.76,
  destinationPlaceId: "place-tokyo",
  startDate: "2026-10-20",
  endDate: "2026-10-24",
  expenses: [],
  companions: [],
  shoppingList: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-24T00:00:00.000Z",
};

const liveState = {
  savedInspirations: [inspiration],
  flightAnchors: [anchor],
  flightMode: "ROUND_TRIP" as const,
  settlementBatches: [batch],
  planBrief: { destination: "東京" } as TripDraft["planBrief"],
  carRentals: [{ id: "car-1" } as never],
  selectedPassportId: "pp-1",
  comparisonCountryCode: "TW",
  currency: "JPY",
  budget: 120000,
};

const baseInput = {
  id: "trip-1",
  ownerId: "user-1",
  name: "東京五日",
  totalCost: 48000,
  startDate: "2026-10-20",
  endDate: "2026-10-24",
  archivedAt: "2026-10-28T00:00:00.000Z",
  destination: "東京",
  travelCountry: "日本",
  expenses: [],
  companions: [],
  shoppingList: [],
  itinerary: [],
  travelBook: null,
  taxRule: null,
  visaInfo: null,
  travelRules: undefined,
  sourceDraft,
  ...liveState,
};

describe("buildArchivedTrip", () => {
  it("keeps the saved places and restaurants the traveller collected", () => {
    const trip = buildArchivedTrip(baseInput);

    expect(trip.savedInspirations).toEqual([inspiration]);
  });

  it("keeps the diary even when it was generated before the trip had an id", () => {
    // handleGenerateTravelBook falls back to the literal "draft" when neither
    // activeDraftId nor currentLoadedTripId is set. The archive path used to
    // require travelBook.tripId === archivedTripId, so this book was dropped
    // and the draft deleted in the same breath.
    const travelBook: TravelBook = {
      tripId: "draft",
      summary: "五天的東京",
      trajectory: ["新宿", "淺草"],
      aiNarrative: "...",
    };

    const trip = buildArchivedTrip({ ...baseInput, travelBook });

    expect(trip.travelBook).toEqual(travelBook);
  });

  it("keeps the flights, the settlement batches and the car hire", () => {
    const trip = buildArchivedTrip(baseInput);

    expect(trip.flightAnchors).toEqual([anchor]);
    expect(trip.flightMode).toBe("ROUND_TRIP");
    expect(trip.settlementBatches).toEqual([batch]);
    expect(trip.carRentals).toHaveLength(1);
    expect(trip.planBrief).toEqual({ destination: "東京" });
  });

  it("keeps the passport, the comparison country, the currency and the budget", () => {
    const trip = buildArchivedTrip(baseInput);

    expect(trip.selectedPassportId).toBe("pp-1");
    expect(trip.comparisonCountryCode).toBe("TW");
    expect(trip.currency).toBe("JPY");
    expect(trip.budget).toBe(120000);
  });

  it("keeps the resolved destination the draft looked up", () => {
    const trip = buildArchivedTrip(baseInput);

    expect(trip.destinationCountry).toBe("日本");
    expect(trip.destinationAddress).toBe("Tokyo, Japan");
    expect(trip.destinationLatitude).toBe(35.68);
    expect(trip.destinationLongitude).toBe(139.76);
    expect(trip.destinationPlaceId).toBe("place-tokyo");
  });

  it("carries the draft's creation time and stamps the archive time", () => {
    const trip = buildArchivedTrip(baseInput);

    expect(trip.createdAt).toBe("2026-10-01T00:00:00.000Z");
    expect(trip.archivedAt).toBe("2026-10-28T00:00:00.000Z");
    expect(trip.updatedAt).toBe("2026-10-28T00:00:00.000Z");
  });

  it("stores nothing rather than empty collections", () => {
    const trip = buildArchivedTrip({
      ...baseInput,
      savedInspirations: [],
      flightAnchors: [],
      settlementBatches: [],
      carRentals: [],
      itinerary: [],
      sourceDraft: undefined,
    });

    expect(trip.savedInspirations).toBeUndefined();
    expect(trip.flightAnchors).toBeUndefined();
    expect(trip.settlementBatches).toBeUndefined();
    expect(trip.carRentals).toBeUndefined();
    expect(trip.itinerary).toBeUndefined();
  });

  it("round-trips the diary through storage", () => {
    // Writing it is half the promise. The load path repeated the same id check
    // and threw the diary away again, so a 日記 kept by archiving disappeared
    // the next time the app opened.
    const travelBook: TravelBook = {
      tripId: "draft",
      summary: "五天的東京",
      trajectory: ["新宿"],
      aiNarrative: "...",
    };
    const archived = buildArchivedTrip({ ...baseInput, travelBook });
    const reloaded = JSON.parse(JSON.stringify(archived));

    expect(readStoredTravelBook(reloaded)).toEqual(travelBook);
  });

  it("reports no diary when a stored trip has none", () => {
    expect(readStoredTravelBook({})).toBeUndefined();
    expect(readStoredTravelBook({ travelBook: null })).toBeUndefined();
  });

  it("copies collections rather than aliasing the live arrays", () => {
    const inspirations = [inspiration];
    const trip = buildArchivedTrip({
      ...baseInput,
      savedInspirations: inspirations,
    });

    expect(trip.savedInspirations).not.toBe(inspirations);
  });
});
