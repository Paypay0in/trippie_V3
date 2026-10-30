/**
 * What a screenshot is, so it reaches the parser that was written for it.
 *
 * 「這格可以提示用戶目前若有什麼旅行靈感的截圖、租車或是訂了什麼旅遊票的截圖都可以
 *   上傳上來 協助安排行程 新增一個上傳截圖的入口」.
 *
 * One entry, several kinds of picture. The app already has five parsers, each
 * with a prompt tuned to one document, and the temptation is to merge them
 * into a single prompt that reads anything — which is how every one of them
 * quietly gets worse at the thing it was good at.
 *
 * So nothing is merged. A screenshot is classified first, cheaply, and then
 * handed whole to the parser that already exists. A hire read as 「交通」 on an
 * itinerary slice would lose its pickup and drop-off dates, and those dates
 * are the entire reason the planner asks about a car at all.
 */

export const SCREENSHOT_KINDS = ['rental', 'stay', 'flight', 'inspiration'] as const;

export type ScreenshotKind = (typeof SCREENSHOT_KINDS)[number];

export interface ScreenshotRoute {
  kind: ScreenshotKind;
  /** The endpoint the picture is sent to next, unchanged. */
  endpoint: string;
  /**
   * What the traveller is told while that parser runs.
   *
   * // i18n-data: nothing reads this. `screenshotIntake` takes `endpoint` and
   * // words its own waiting line, so these four strings reach no screen; and
   * // this module is imported by `server.ts`, which may not reach `i18n`.
   * Either delete the field or give it a reader — see the batch-AB report.
   */
  busyLabel: string;
}

const ROUTES: Record<ScreenshotKind, ScreenshotRoute> = {
  rental: {
    kind: 'rental',
    endpoint: '/api/rentals/parse-image',
    // i18n-data: nothing reads this field; see the note on ScreenshotRoute.busyLabel
    busyLabel: '讀取租車訂單…',
  },
  stay: {
    kind: 'stay',
    endpoint: '/api/stays/parse-image',
    // i18n-data: nothing reads this field; see the note on ScreenshotRoute.busyLabel
    busyLabel: '讀取住宿訂單…',
  },
  flight: {
    kind: 'flight',
    endpoint: '/api/flights/parse-image',
    // i18n-data: nothing reads this field; see the note on ScreenshotRoute.busyLabel
    busyLabel: '讀取機票…',
  },
  /*
    Everything that is not a booking. 「旅行靈感的截圖」 and 「訂了什麼旅遊票」
    both land here: a ticket for an attraction is a place with a time on it,
    which is what the itinerary parser already turns a screenshot into. A
    booking with its own card — a car, a room, a flight — is the exception,
    because its card knows things a slice has nowhere to put.
  */
  inspiration: {
    kind: 'inspiration',
    endpoint: '/api/itinerary/parse-image',
    // i18n-data: nothing reads this field; see the note on ScreenshotRoute.busyLabel
    busyLabel: '讀取截圖…',
  },
};

export const routeFor = (kind: ScreenshotKind): ScreenshotRoute => ROUTES[kind];

/**
 * Anything unrecognised is read as inspiration.
 *
 * Deliberately not an error. The itinerary parser is the only one that can
 * refuse gracefully — it returns 「這張截圖看不出可以排進行程的地點」 — while the
 * booking parsers will confidently produce a hire from a photo of a menu.
 * Guessing wrong towards the parser that knows how to say no is the cheap
 * mistake; guessing wrong towards a booking is a car on days nobody has one.
 */
export const normalizeScreenshotKind = (raw: unknown): ScreenshotKind => {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (SCREENSHOT_KINDS as readonly string[]).includes(value)
    ? (value as ScreenshotKind)
    : 'inspiration';
};

export const screenshotKindPrompt = () => `
      Look at this screenshot and say which one of these it is. Answer with
      the single word only.

      - "rental": a car hire booking or confirmation. Names a rental company,
        a pickup and a return.
      - "stay": where the traveller will sleep. A hotel, guesthouse or
        apartment booking — and also a message in which somebody gives the
        address of a home or flat the traveller is staying at. A shared
        address with no booking is still a stay; staying at a friend's place
        is not a booking and never will be.
      - "flight": a flight booking, e-ticket or boarding pass. Names flight
        numbers, airports, or a departure and arrival.
      - "inspiration": anything else a traveller saved — a social post, a
        blog, a map, a chat, a list of places, an attraction or event ticket,
        a restaurant page, a schedule.

      Rules:
      - A booking confirmation is only "rental" or "flight" when the
        screenshot actually shows the booking. A blog post recommending a
        rental company is "inspiration".
      - "stay" does not require a booking, only a place to sleep and enough
        of an address to find it. A chat message containing a home address
        is "stay"; a blog post about a neighbourhood is "inspiration".
      - An attraction, museum, show or transit-pass ticket is "inspiration".
        Those three kinds are only for a car, a room and a flight.
      - If it is not clearly one of the three bookings, answer
        "inspiration".
    `;
