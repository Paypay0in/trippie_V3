
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer, loadEnv } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import { markDepartureTiming, withRequiredPreparation } from "./services/planPreparationCoverage";
import { stripPriceClaims } from "./services/priceClaims";
import { registerPlaceCommerceRoute } from "./services/placeCommerceLookup";
import {
  exchangeRatePrompt,
  extractExchangeRate,
  imageExpensePrompt,
  isCurrencyCode,
  isSupportedImageMime,
  normalizeParsedExpense,
  INTAKE_MODELS,
  rateFromFxResponse,
  resolveImageMime,
  textExpensePrompt,
} from "./services/expenseIntake";
import { normalizeParsedStay, stayPrompt } from "./services/stayIntake";
import { assignFlightsToLegs, flightPrompt } from "./services/flightIntake";
import { checkProposedChanges } from "./services/adjustmentChanges";
import { enumerateTripDates } from "./services/itineraryPlanningService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const mode = process.env.NODE_ENV || "development";
  Object.assign(process.env, loadEnv(mode, __dirname, ""));

  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  // Hosts assign the port and expect the process to bind the one they give.
  // Hardcoding it means the platform's health check never answers and the
  // deploy is marked failed, with the app running perfectly on a port nobody
  // is listening to.
  const PORT = Number(process.env.PORT) || 3000;

  // In-memory store for shared trips
  // In a real app, this would be a database
  const sharedTrips: Record<string, any> = {};
  const placePhotoCache = new Map<string, { expiresAt: number; value: unknown }>();


  const normalizeNumericRule = (value: any, _sourceBacked: boolean) => {
    if (!value || typeof value !== 'object' || typeof value.currency !== 'string' || !value.currency.trim()) return undefined;
    if (typeof value.minSpend !== 'number' || !Number.isFinite(value.minSpend) || value.minSpend < 0) return undefined;
    if (value.thresholdScope !== 'per_transaction') return undefined;
    const method = value.refundMethod;
    if (!method || method.type !== 'rate' || typeof method.rate !== 'number' || !Number.isFinite(method.rate) || method.rate <= 0 || method.rate >= 1) return undefined;
    const rule: any = { currency: value.currency.trim().toUpperCase(), minSpend: value.minSpend, thresholdScope: 'per_transaction', refundMethod: { type: 'rate', rate: method.rate } };
    for (const field of ['eligibleCategories', 'excludedCategories']) {
      if (value[field] !== undefined) {
        if (!Array.isArray(value[field]) || !value[field].every((item: unknown) => typeof item === 'string')) return undefined;
        rule[field] = value[field].map((item: string) => item.trim()).filter(Boolean);
      }
    }
    return rule;
  };

  /**
   * Returns the HTTP status when a provider error is a quota/rate-limit failure,
   * otherwise undefined. The Gemini SDK surfaces this inconsistently — sometimes
   * as `status`, sometimes only in the message — so check both.
   */
  const quotaStatusOf = (error: unknown): number | undefined => {
    if (!error || typeof error !== 'object') return undefined;
    const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
    // The SDK reports this as a number, a numeric string, or a status enum
    // depending on the failure, so check each shape rather than just one.
    for (const value of [candidate.status, candidate.code]) {
      if (value === 429 || value === '429') return 429;
      if (typeof value === 'string' && /RESOURCE_EXHAUSTED/i.test(value)) return 429;
    }
    const message = typeof candidate.message === 'string' ? candidate.message : '';
    return /\b429\b|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(message) ? 429 : undefined;
  };

  /** Models wrap JSON in a markdown fence often enough to be worth stripping. */
  const cleanModelJson = (raw: string) => raw.replace(/```json|```/g, "").trim() || "null";

  /**
   * Whether another attempt could plausibly succeed.
   *
   * Deliberately broad: a rate limit reaches us as 429, as RESOURCE_EXHAUSTED,
   * as a 5xx, and sometimes only as prose in the message. Retrying a permanent
   * error costs two seconds; refusing to retry a transient one costs the
   * feature.
   */
  const isRetryable = (error: unknown): boolean => {
    if (quotaStatusOf(error) === 429) return true;
    if (!error || typeof error !== "object") return false;
    const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
    for (const value of [candidate.status, candidate.code]) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric >= 500 && numeric < 600) return true;
      if (typeof value === "string" && /UNAVAILABLE|INTERNAL|DEADLINE_EXCEEDED/i.test(value)) return true;
    }
    const message = typeof candidate.message === "string" ? candidate.message : "";
    return /\b(500|502|503|504)\b|unavailable|internal error|overloaded|timed? ?out|try again/i.test(message);
  };

  /**
   * Retries a provider call through the transient failures the free tier
   * produces constantly.
   *
   * Measured against the live deployment: the same screenshot posted five times
   * gave 200, 200, 502, 429, 429. Without a retry the traveller sees 「請手動
   * 輸入」 on the third attempt and stops trusting the feature — which is worse
   * than a slow answer, because the point of the upload is not retyping a
   * boarding pass.
   *
   * The browser version this replaced already retried; that was lost in the
   * move to the server, which is the same "second path drops the first path's
   * guards" shape that keeps costing this project.
   */
  const withRetry = async <T>(call: () => Promise<T>, attempts = 3): Promise<T> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await call();
      } catch (error) {
        lastError = error;
        // A malformed request fails identically however many times it is sent.
        if (!isRetryable(error) || attempt === attempts - 1) throw error;
        // 1s, then 2s. Long enough for a per-minute bucket to refill a little,
        // short enough that someone holding a phone has not given up.
        await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    }
    throw lastError;
  };

  /**
   * Runs a call against each model in turn until one is not out of quota.
   *
   * The free tier meters per model per day, twenty requests on the default
   * model — exhausted in one afternoon. Falling through to the next model is
   * not a trick; the quota is genuinely separate, so four models is four
   * allowances. All four were checked against the same boarding pass and read
   * it identically.
   *
   * A daily exhaustion does not recover within a request, so that case moves
   * straight to the next model instead of sleeping. Other transient failures
   * still get the backoff, per model.
   */
  const withModelFallback = async <T>(call: (model: string) => Promise<T>): Promise<T> => {
    let lastError: unknown;
    for (const model of INTAKE_MODELS) {
      try {
        return await withRetry(() => call(model));
      } catch (error) {
        lastError = error;
        if (quotaStatusOf(error) !== 429) throw error;
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[intake] ${model} out of quota, trying the next model`);
        }
      }
    }
    throw lastError;
  };

  // A receipt photo is base64, so it arrives far larger than any other body
  // this server accepts. Its parser is mounted *before* the global 16kb one
  // because the global parser would reject the request first — express.json
  // skips a body it has already parsed, so the order is what makes this work.
  app.post("/api/expenses/parse-image", express.json({ limit: "12mb" }), async (req, res) => {
    const { base64Data, mimeType } = req.body ?? {};
    const imageMime = typeof base64Data === "string" && base64Data ? resolveImageMime(mimeType, base64Data) : null;
    if (!imageMime) { res.status(400).json({ error: "需要一張收據照片。" }); return; }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { res.status(503).json({ error: "現在無法辨識收據，請手動輸入。" }); return; }
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await withModelFallback(model => ai.models.generateContent({
        model,
        contents: { parts: [{ inlineData: { mimeType: imageMime, data: base64Data } }, { text: imageExpensePrompt() }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
              amount: { type: Type.NUMBER },
              currency: { type: Type.STRING },
              category: { type: Type.STRING },
              date: { type: Type.STRING, description: "Transaction/Invoice Date" },
              travelStartDate: { type: Type.STRING, description: "Actual Travel Start Date (Flights/Hotels)" },
              travelEndDate: { type: Type.STRING, description: "Actual Travel End Date (Flights/Hotels)" },
              paymentMethod: { type: Type.STRING },
              country: { type: Type.STRING, description: "Inferred country in Traditional Chinese" },
              isUncertain: { type: Type.BOOLEAN, description: "True if low confidence" },
            },
            required: ["amount", "currency"],
          },
        },
      }));
      const parsed = normalizeParsedExpense(JSON.parse(cleanModelJson(response.text ?? "")));
      if (!parsed) { res.status(422).json({ error: "這張照片看不出金額，請手動輸入。" }); return; }
      res.json(parsed);
    } catch (error) {
      const status = quotaStatusOf(error) ?? 502;
      res.status(status).json({ error: status === 429 ? "辨識服務忙碌中，請稍後再試。" : "現在無法辨識收據，請手動輸入。" });
    }
  });

  // Same reasoning as the receipt route above: a booking screenshot is a photo,
  // so it needs its own parser ahead of the global limit.
  app.post("/api/stays/parse-image", express.json({ limit: "12mb" }), async (req, res) => {
    const { base64Data, mimeType } = req.body ?? {};
    const imageMime = typeof base64Data === "string" && base64Data ? resolveImageMime(mimeType, base64Data) : null;
    if (!imageMime) { res.status(400).json({ error: "需要一張訂房截圖。" }); return; }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { res.status(503).json({ error: "現在無法辨識訂房截圖，請手動輸入。" }); return; }
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await withModelFallback(model => ai.models.generateContent({
        model,
        contents: { parts: [{ inlineData: { mimeType: imageMime, data: base64Data } }, { text: stayPrompt() }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hotelName: { type: Type.STRING },
              checkInDate: { type: Type.STRING, description: "YYYY-MM-DD" },
              checkOutDate: { type: Type.STRING, description: "YYYY-MM-DD" },
              checkInTime: { type: Type.STRING, description: "HH:mm, only if stated" },
              checkOutTime: { type: Type.STRING, description: "HH:mm, only if stated" },
              address: { type: Type.STRING },
              confirmationNumber: { type: Type.STRING },
              guestName: { type: Type.STRING },
              totalAmount: { type: Type.NUMBER },
              currency: { type: Type.STRING },
              isUncertain: { type: Type.BOOLEAN },
            },
            required: ["hotelName"],
          },
        },
      }));
      const stay = normalizeParsedStay(JSON.parse(cleanModelJson(response.text ?? "")));
      if (!stay) { res.status(422).json({ error: "這張截圖看不出住宿名稱，請手動輸入。" }); return; }
      res.json(stay);
    } catch (error) {
      const status = quotaStatusOf(error) ?? 502;
      res.status(status).json({ error: status === 429 ? "辨識服務忙碌中，請稍後再試。" : "現在無法辨識訂房截圖，請手動輸入。" });
    }
  });

  // A boarding pass is a photo too; same parser placement as the two above.
  app.post("/api/flights/parse-image", express.json({ limit: "12mb" }), async (req, res) => {
    const { base64Data, mimeType, tripStartDate, tripEndDate } = req.body ?? {};
    const imageMime = typeof base64Data === "string" && base64Data ? resolveImageMime(mimeType, base64Data) : null;
    if (!imageMime) { res.status(400).json({ error: "需要一張機票或登機證截圖。" }); return; }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { res.status(503).json({ error: "現在無法辨識機票，請手動輸入。" }); return; }
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await withModelFallback(model => ai.models.generateContent({
        model,
        contents: {
          parts: [
            { inlineData: { mimeType: imageMime, data: base64Data } },
            { text: flightPrompt(typeof tripStartDate === "string" ? tripStartDate : undefined, typeof tripEndDate === "string" ? tripEndDate : undefined) },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              // An array because a round-trip confirmation shows both legs on
              // one screen. Reading only the first filled the outbound and left
              // the return blank, which reads as a half-broken upload.
              flights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    direction: { type: Type.STRING, enum: ["OUTBOUND", "RETURN"] },
                    flightNumber: { type: Type.STRING },
                    departureAirport: { type: Type.STRING },
                    departureAirportIata: { type: Type.STRING },
                    departureDate: { type: Type.STRING, description: "YYYY-MM-DD" },
                    departureTime: { type: Type.STRING, description: "HH:mm local" },
                    arrivalAirport: { type: Type.STRING },
                    arrivalAirportIata: { type: Type.STRING },
                    arrivalDate: { type: Type.STRING, description: "YYYY-MM-DD" },
                    arrivalTime: { type: Type.STRING, description: "HH:mm local" },
                    isUncertain: { type: Type.BOOLEAN },
                  },
                  required: ["departureDate", "departureTime"],
                },
              },
            },
            required: ["flights"],
          },
        },
      }));
      const legs = assignFlightsToLegs(JSON.parse(cleanModelJson(response.text ?? "")));
      if (!legs.OUTBOUND && !legs.RETURN) {
        res.status(422).json({ error: "這張截圖看不出起飛日期與時間，請手動輸入。" });
        return;
      }
      res.json(legs);
    } catch (error) {
      const status = quotaStatusOf(error) ?? 502;
      res.status(status).json({ error: status === 429 ? "辨識服務忙碌中，請稍後再試。" : "現在無法辨識機票，請手動輸入。" });
    }
  });

  app.use(express.json({ limit: "16kb" }));

  app.post("/api/expenses/parse-text", async (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > 500) { res.status(400).json({ error: "請描述這筆花費。" }); return; }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { res.status(503).json({ error: "現在無法自動辨識，請手動輸入。" }); return; }
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await withModelFallback(model => ai.models.generateContent({
        model,
        contents: textExpensePrompt(text),
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
              amount: { type: Type.NUMBER },
              currency: { type: Type.STRING },
              category: { type: Type.STRING },
              paymentMethod: { type: Type.STRING },
            },
            required: ["amount"],
          },
        },
      }));
      const parsed = normalizeParsedExpense(JSON.parse(cleanModelJson(response.text ?? "")));
      if (!parsed) { res.status(422).json({ error: "這句話看不出金額，請手動輸入。" }); return; }
      res.json(parsed);
    } catch (error) {
      const status = quotaStatusOf(error) ?? 502;
      res.status(status).json({ error: status === 429 ? "辨識服務忙碌中，請稍後再試。" : "現在無法自動辨識，請手動輸入。" });
    }
  });

  // The form has a stored fallback rate for every currency it offers, so a
  // failure here is a downgrade rather than a dead end — which is why this
  // answers with a plain status and no retry prompt.
  app.post("/api/exchange-rate", async (req, res) => {
    const { from, to } = req.body ?? {};
    const target = isCurrencyCode(to) ? to.trim().toUpperCase() : "TWD";
    if (!isCurrencyCode(from)) { res.status(400).json({ error: "需要幣別代碼。" }); return; }
    const source = from.trim().toUpperCase();
    if (source === target) { res.json({ rate: 1 }); return; }

    // A published rates feed first: no key, no quota, and authoritative in a
    // way a language model reading search results is not.
    try {
      const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(source)}`, { signal: AbortSignal.timeout(6_000) });
      if (response.ok) {
        const rate = rateFromFxResponse(await response.json(), target);
        if (rate !== null) { res.json({ rate }); return; }
      }
    } catch { /* fall through to the model */ }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { res.status(503).json({ error: "查不到即時匯率。" }); return; }
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await withModelFallback(model => ai.models.generateContent({
        model,
        contents: exchangeRatePrompt(source, target),
        config: { tools: [{ googleSearch: {} }] },
      }));
      const rate = extractExchangeRate(response.text);
      if (rate === null) { res.status(422).json({ error: "查不到即時匯率。" }); return; }
      res.json({ rate });
    } catch (error) {
      res.status(quotaStatusOf(error) ?? 502).json({ error: "查不到即時匯率。" });
    }
  });

  // Mounted from the shared module so the identical handler can be exercised by a
  // real HTTP test. Registered after express.json() — a body-reading route before
  // the parser silently sees an undefined body, which is exactly how this route
  // shipped 404-equivalent twice.
  registerPlaceCommerceRoute(app);

  app.post("/api/routes/estimate", async (req, res) => {
    const values = [req.body?.currentLatitude, req.body?.currentLongitude, req.body?.destinationLatitude, req.body?.destinationLongitude].map(Number);
    const [currentLatitude, currentLongitude, destinationLatitude, destinationLongitude] = values;
    const valid = Number.isFinite(currentLatitude) && currentLatitude >= -90 && currentLatitude <= 90 && Number.isFinite(currentLongitude) && currentLongitude >= -180 && currentLongitude <= 180 && Number.isFinite(destinationLatitude) && destinationLatitude >= -90 && destinationLatitude <= 90 && Number.isFinite(destinationLongitude) && destinationLongitude >= -180 && destinationLongitude <= 180;
    if (!valid) { res.status(400).json({ error: "Valid route coordinates are required." }); return; }
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) { res.status(503).json({ error: "Routing service unavailable." }); return; }
    try {
      const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration" },
        body: JSON.stringify({ origin: { location: { latLng: { latitude: currentLatitude, longitude: currentLongitude } } }, destination: { location: { latLng: { latitude: destinationLatitude, longitude: destinationLongitude } } }, travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", departureTime: new Date().toISOString() }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) { res.status(502).json({ error: "Routing provider unavailable." }); return; }
      const data = await response.json() as { routes?: Array<{ distanceMeters?: number; duration?: string }> };
      const route = data.routes?.[0];
      const durationSeconds = route?.duration ? Number(route.duration.replace(/s$/, "")) : NaN;
      if (!route || typeof route.distanceMeters !== "number" || !Number.isFinite(durationSeconds) || durationSeconds < 0) { res.status(502).json({ error: "Routing provider returned no route." }); return; }
      res.json({ distanceMeters: route.distanceMeters, durationSeconds });
    } catch { res.status(502).json({ error: "Routing provider unavailable." }); }
  });

  /**
   * How long from the arrival airport to the hotel.
   *
   * One call rather than three from the browser: the client holds a hotel name
   * and an airport, not coordinates, and making it resolve both and then route
   * between them would be three round trips on a phone that has just landed.
   *
   * Everything is best effort. A hotel Google cannot place, or a pair with no
   * driving route, answers 200 with no duration — the itinerary still gets its
   * transfer card, just without a number on it. An error here would block a
   * booking from being saved at all, which is a far worse trade.
   */
  app.post("/api/stays/arrival-plan", async (req, res) => {
    const hotel = typeof req.body?.hotel === "string" ? req.body.hotel.trim() : "";
    const airport = typeof req.body?.airport === "string" ? req.body.airport.trim() : "";
    if (!hotel || hotel.length > 200) { res.status(400).json({ error: "需要住宿名稱。" }); return; }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) { res.json({}); return; }

    const place = async (query: string): Promise<{ latitude: number; longitude: number } | null> => {
      try {
        const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.location" },
          body: JSON.stringify({ textQuery: query, languageCode: "zh-TW", maxResultCount: 1 }),
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) return null;
        const data = await response.json() as { places?: Array<{ location?: { latitude?: number; longitude?: number } }> };
        const found = data.places?.[0]?.location;
        return typeof found?.latitude === "number" && typeof found.longitude === "number"
          ? { latitude: found.latitude, longitude: found.longitude }
          : null;
      } catch { return null; }
    };

    try {
      // Coordinates the caller already holds are used as given; the airport is
      // only looked up when they were not supplied.
      const airportPoint = Number.isFinite(Number(req.body?.airportLatitude)) && Number.isFinite(Number(req.body?.airportLongitude))
        ? { latitude: Number(req.body.airportLatitude), longitude: Number(req.body.airportLongitude) }
        : airport ? await place(airport) : null;
      const hotelPoint = await place(hotel);

      if (!hotelPoint) { res.json({}); return; }
      const base = { hotelLatitude: hotelPoint.latitude, hotelLongitude: hotelPoint.longitude };
      if (!airportPoint) { res.json(base); return; }

      // Both modes, because driving alone is not enough.
      //
      // South Korea restricts the export of mapping data, so Google returns no
      // driving or walking route anywhere in the country — Gimhae to a Haeundae
      // hotel answers 200 with an empty body. Transit does work there, and is
      // how most people leave an airport anyway. Asking for both in parallel
      // costs one round trip and makes the answer exist in Busan at all.
      const ask = async (travelMode: "DRIVE" | "TRANSIT") => {
        try {
          const routed = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration" },
            body: JSON.stringify({
              origin: { location: { latLng: airportPoint } },
              destination: { location: { latLng: hotelPoint } },
              travelMode,
            }),
            signal: AbortSignal.timeout(8_000),
          });
          if (!routed.ok) return null;
          const data = await routed.json() as { routes?: Array<{ distanceMeters?: number; duration?: string }> };
          const route = data.routes?.[0];
          const seconds = route?.duration ? Number(route.duration.replace(/s$/, "")) : NaN;
          if (!Number.isFinite(seconds) || seconds <= 0) return null;
          return { travelSeconds: Math.round(seconds), distanceMeters: route?.distanceMeters, mode: travelMode };
        } catch { return null; }
      };

      const [driving, transit] = await Promise.all([ask("DRIVE"), ask("TRANSIT")]);
      // Driving when it exists: it is the simpler journey to describe and the
      // one a taxi from the terminal actually takes. Transit is the answer in
      // the places driving has none.
      const best = driving ?? transit;
      if (!best) { res.json(base); return; }

      res.json({ ...base, ...best });
    } catch {
      res.json({});
    }
  });

  app.post("/api/places/autocomplete", async (req, res) => {
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    if (query.length < 2 || query.length > 160) { res.json({ suggestions: [] }); return; }
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) { res.json({ suggestions: [] }); return; }
    try {
      const body: Record<string, unknown> = { input: query, languageCode: "zh-TW" };
      if (Number.isFinite(req.body?.latitude) && Number.isFinite(req.body?.longitude)) body.locationBias = { circle: { center: { latitude: Number(req.body.latitude), longitude: Number(req.body.longitude) }, radius: 50000 } };
      const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(5_000) });
      if (!response.ok) { res.json({ suggestions: [] }); return; }
      const data = await response.json() as { suggestions?: Array<{ placePrediction?: { placeId?: string; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }; text?: { text?: string } } }> };
      res.json({ suggestions: (data.suggestions || []).flatMap(item => { const p = item.placePrediction; return p?.placeId && p.structuredFormat?.mainText?.text ? [{ placeId: p.placeId, primaryText: p.structuredFormat.mainText.text, secondaryText: p.structuredFormat.secondaryText?.text || p.text?.text }] : []; }) });
    } catch { res.json({ suggestions: [] }); }
  });

  app.post("/api/places/details", async (req, res) => {
    const placeId = typeof req.body?.placeId === "string" ? req.body.placeId.trim() : "";
    if (!placeId || !process.env.GOOGLE_MAPS_API_KEY) { res.status(404).json({ error: "Place details unavailable." }); return; }
    try {
      const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY, "X-Goog-FieldMask": "id,displayName,formattedAddress,addressComponents,location,nationalPhoneNumber,internationalPhoneNumber,websiteUri,googleMapsUri" }, signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error("Place details failed");
      const data = await response.json() as { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number }; addressComponents?: Array<{ longText?: string; types?: string[] }>; nationalPhoneNumber?: string; internationalPhoneNumber?: string; websiteUri?: string; googleMapsUri?: string };
      if (!data.displayName?.text || typeof data.location?.latitude !== "number" || typeof data.location.longitude !== "number") throw new Error("Incomplete place details");
      res.json({
        placeId: data.id || placeId,
        location: data.displayName.text,
        address: data.formattedAddress,
        latitude: data.location.latitude,
        longitude: data.location.longitude,
        country: data.addressComponents?.find(c => c.types?.includes("country"))?.longText,
        // Contact details, for a stay the traveller may need to phone from the
        // street. Absent for places Google has none for, which is why the UI
        // renders each button only when its value arrived.
        phone: data.internationalPhoneNumber || data.nationalPhoneNumber,
        website: data.websiteUri,
        mapsUri: data.googleMapsUri,
      });
    } catch { res.status(502).json({ error: "Place details unavailable." }); }
  });

  app.post("/api/places/photo", async (req, res) => {
    const placeId = typeof req.body?.placeId === "string" ? req.body.placeId.trim() : "";
    if (!placeId || !process.env.GOOGLE_MAPS_API_KEY) { res.json({ photo: null }); return; }
    const cached = placePhotoCache.get(placeId);
    if (cached && cached.expiresAt > Date.now()) { res.json({ photo: cached.value }); return; }
    try {
      const detailsResponse = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY, "X-Goog-FieldMask": "id,photos" }, signal: AbortSignal.timeout(5_000) });
      if (!detailsResponse.ok) { res.json({ photo: null }); return; }
      const details = await detailsResponse.json() as { photos?: Array<{ name?: string; authorAttributions?: Array<{ displayName?: string; uri?: string }> }> };
      const selected = details.photos?.find(photo => typeof photo.name === "string" && photo.name);
      if (!selected?.name) { placePhotoCache.set(placeId, { expiresAt: Date.now() + 60_000, value: null }); res.json({ photo: null }); return; }
      const mediaResponse = await fetch(`https://places.googleapis.com/v1/${selected.name}/media?maxWidthPx=720&maxHeightPx=720&skipHttpRedirect=true`, { headers: { "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY }, signal: AbortSignal.timeout(5_000) });
      if (!mediaResponse.ok) { res.json({ photo: null }); return; }
      const media = await mediaResponse.json() as { photoUri?: string };
      if (!media.photoUri) { res.json({ photo: null }); return; }
      const value = { imageUrl: media.photoUri, attribution: selected.authorAttributions?.[0] ? { displayName: selected.authorAttributions[0].displayName, uri: selected.authorAttributions[0].uri } : undefined };
      placePhotoCache.set(placeId, { expiresAt: Date.now() + 5 * 60_000, value });
      res.json({ photo: value });
    } catch { placePhotoCache.set(placeId, { expiresAt: Date.now() + 60_000, value: null }); res.json({ photo: null }); }
  });

  app.post("/api/places/resolve", async (req, res) => {
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    const country = typeof req.body?.country === "string" ? req.body.country.trim() : "";
    if (!query || query.length > 160) { res.status(400).json({ error: "A valid place is required." }); return; }
    try {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (apiKey) {
        const googleResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents,places.photos",
          },
          body: JSON.stringify({ textQuery: query, languageCode: "zh-TW", maxResultCount: 5 }),
          signal: AbortSignal.timeout(5_000),
        });
        if (googleResponse.ok) {
          const googleData = await googleResponse.json() as {
            places?: Array<{
              id?: string;
              displayName?: { text?: string };
              formattedAddress?: string;
              location?: { latitude?: number; longitude?: number };
              addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
              photos?: Array<{ name?: string }>;
            }>;
          };
          const countryNeedles = country ? [country, /korea|韓國|韩国/i.test(country) ? "대한민국" : "", /japan|日本/i.test(country) ? "日本" : ""].filter(Boolean) : [];
          const candidates = (googleData.places || []).filter(place => typeof place.id === "string" && typeof place.displayName?.text === "string" && typeof place.location?.latitude === "number" && typeof place.location?.longitude === "number");
          const ranked = candidates
            .map(place => {
              const text = `${place.displayName?.text || ""} ${place.formattedAddress || ""} ${(place.addressComponents || []).map(component => `${component.longText || ""} ${component.shortText || ""}`).join(" ")}`.toLowerCase();
              const name = (place.displayName?.text || "").toLowerCase();
              const queryParts = query.split(/\s+/).filter(Boolean).map(part => part.toLowerCase());
              const nameScore = queryParts.reduce((score, part) => score + (name.includes(part) ? 4 : 0), 0);
              const countryScore = countryNeedles.some(needle => text.includes(needle.toLowerCase())) ? 6 : 0;
              return { place, score: nameScore + countryScore };
            })
            .sort((a, b) => b.score - a.score);
          const selected = ranked[0]?.place;
          if (selected) {
            const countryComponent = selected.addressComponents?.find(component => component.types?.includes("country"));
            res.json({
              placeId: selected.id,
              resolvedPlaceName: selected.displayName?.text,
              address: selected.formattedAddress,
              latitude: selected.location?.latitude,
              longitude: selected.location?.longitude,
              country: countryComponent?.longText || country,
              photoAvailable: Array.isArray(selected.photos) && selected.photos.length > 0,
            });
            return;
          }
        }
      }
      const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
      url.searchParams.set("name", query); url.searchParams.set("count", "1"); url.searchParams.set("language", "zh"); url.searchParams.set("format", "json");
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error("Place geocoding failed");
      const data = await response.json() as { results?: Array<{ id?: number; name?: string; latitude?: number; longitude?: number; country?: string; country_code?: string; admin1?: string }> };
      let place = data.results?.[0];
      if (place && country && /korea|韓國|韩国/i.test(country) && place.country_code !== 'KR') place = undefined;
      if (!place && country && /korea|韓國|韩国/i.test(country)) {
        const fallback = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'Trippie/1.0' }, signal: AbortSignal.timeout(5_000) });
        const results = await fallback.json() as Array<{ lat?: string; lon?: string; display_name?: string }>;
        const match = results[0];
        if (match && Number.isFinite(Number(match.lat)) && Number.isFinite(Number(match.lon))) { res.json({ address: match.display_name, latitude: Number(match.lat), longitude: Number(match.lon), country: country }); return; }
      }
      if (!place || typeof place.latitude !== "number" || typeof place.longitude !== "number") { res.status(404).json({ error: "Place could not be resolved." }); return; }
      res.json({ placeId: place.id ? String(place.id) : undefined, address: [place.name, place.admin1, place.country].filter(Boolean).join(", "), latitude: place.latitude, longitude: place.longitude });
    } catch (error) { console.error("Place resolve failed:", error); res.status(502).json({ error: "Place service unavailable." }); }
  });

  app.post("/api/travel-rules/research", async (req, res) => {
    const destination = typeof req.body?.destination === "string" ? req.body.destination.trim() : "";
    const tripId = typeof req.body?.tripId === "string" ? req.body.tripId.trim() : undefined;
    const passportCountryCode = typeof req.body?.passportCountryCode === "string" ? req.body.passportCountryCode.trim().toUpperCase() : undefined;
    const startDate = typeof req.body?.startDate === "string" ? req.body.startDate.trim() : "";
    const endDate = typeof req.body?.endDate === "string" ? req.body.endDate.trim() : "";
    const residenceCountryCode = typeof req.body?.residenceCountryCode === "string" ? req.body.residenceCountryCode.trim().toUpperCase() : undefined;
    if (!destination) { res.status(400).json({ error: "A destination is required." }); return; }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { res.status(503).json({ error: "Travel rules research is unavailable." }); return; }
    const fetchedAt = new Date().toISOString();
    try {
      const ai = new GoogleGenAI({ apiKey });
      let researchMode: "grounded" | "model_knowledge" = "grounded";
      let response;
      const generateResearch = (grounded: boolean) => ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `研究目前旅遊規定：目的地 ${destination}；旅程日期 ${startDate || "未知"} 至 ${endDate || "未知"}；使用護照國籍 countryCode ${passportCountryCode || "未知"}；居住地 ${residenceCountryCode || "未知"}。請只依可追溯的官方移民、海關、稅務、官方旅遊或機場來源整理入境/簽證與購物退稅。護照國籍不等於居住地。每個入境 actionable item 必須有且只有一個 actionType：visa_or_eta、passport_validity、health_declaration、customs_declaration、arrival_form、required_documents、onward_travel 或 other。相同 actionType 只產生一個 canonical action。若退稅規則有官方且可計算的數值，除 user-facing guidance 外回傳 taxRefund.numericRule，且只使用 thresholdScope per_transaction；提供 currency、minSpend 與 refundMethod { type: rate, rate }，無法安全計算時使用 refundMethod { type: not_calculable }。不要自行決定 numericCalculationAvailable。model_knowledge fallback 可提供 guidance，但不得提供可信 numericRule。每個 grounded source URL 必須來自 Google Search grounding 結果，不可捏造。**所有給使用者看的文字一律使用繁體中文**（title、description、timingText、summary、guidance 等），來源是英文或日文官網時要翻譯，不要照抄原文。唯一例外是官方系統、表單與服務的專有名稱（例如 Visit Japan Web、ESTA、K-ETA），這些保留原名，因為旅客到現場要認得出來。`,
        config: {
          ...(grounded ? { tools: [{ googleSearch: {} }] } : {}),
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              entry: { type: Type.OBJECT, properties: { summary: { type: Type.STRING }, actionableItems: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { actionType: { type: Type.STRING, enum: ['visa_or_eta', 'passport_validity', 'health_declaration', 'customs_declaration', 'arrival_form', 'required_documents', 'onward_travel', 'other'] }, title: { type: Type.STRING }, description: { type: Type.STRING }, timingText: { type: Type.STRING }, source: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, url: { type: Type.STRING }, publisher: { type: Type.STRING } } } }, required: ['actionType', 'title'] } }, sources: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, url: { type: Type.STRING }, publisher: { type: Type.STRING } } } } } },
              taxRefund: { type: Type.OBJECT, properties: { summary: { type: Type.STRING }, merchantRequirements: { type: Type.ARRAY, items: { type: Type.STRING } }, documentRequirements: { type: Type.ARRAY, items: { type: Type.STRING } }, processNotes: { type: Type.ARRAY, items: { type: Type.STRING } }, numericRule: { type: Type.OBJECT, properties: { currency: { type: Type.STRING }, minSpend: { type: Type.NUMBER }, thresholdScope: { type: Type.STRING, enum: ['per_transaction', 'per_receipt', 'same_day_same_merchant', 'same_merchant', 'unknown'] }, refundMethod: { type: Type.OBJECT, properties: { type: { type: Type.STRING, enum: ['rate', 'not_calculable'] }, rate: { type: Type.NUMBER } }, required: ['type'] }, eligibleCategories: { type: Type.ARRAY, items: { type: Type.STRING } }, excludedCategories: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['currency', 'minSpend', 'thresholdScope', 'refundMethod'] }, disclaimer: { type: Type.STRING }, sources: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, url: { type: Type.STRING }, publisher: { type: Type.STRING } } } } } },
            },
            required: ["entry", "taxRefund"],
          },
        },
      });
      try {
        response = await generateResearch(true);
      } catch (error: any) {
        const status = error?.status ?? error?.response?.status;
        const resourceExhausted = error?.code === "RESOURCE_EXHAUSTED" || error?.message?.includes("RESOURCE_EXHAUSTED");
        if (status !== 429 && !resourceExhausted) throw error;
        researchMode = "model_knowledge";
        try {
          response = await generateResearch(false);
        } catch (fallbackError: any) {
          throw fallbackError;
        }
      }
      const raw = response.text?.trim();
      if (!raw) { res.status(502).json({ error: "Travel rules research returned no result." }); return; }
      const parsed = JSON.parse(raw) as Record<string, any>;
      const groundedUrls = new Set<string>(((response as any).candidates?.[0]?.groundingMetadata?.groundingChunks || []).map((chunk: any) => chunk.web?.uri).filter((url: unknown): url is string => typeof url === "string"));
      const safeSource = (source: any) => source && typeof source.title === "string" && typeof source.url === "string" && /^https?:\/\//i.test(source.url) && groundedUrls.has(source.url) ? { title: source.title.trim(), url: source.url, publisher: typeof source.publisher === "string" ? source.publisher.trim() || undefined : undefined } : undefined;
      const sources = (items: any) => Array.isArray(items) ? items.map(safeSource).filter(Boolean) : [];
      const actionTypes = new Set(["visa_or_eta", "passport_validity", "health_declaration", "customs_declaration", "arrival_form", "required_documents", "onward_travel", "other"]);
      const seenActionTypes = new Set<string>();
      const actions = Array.isArray(parsed.entry?.actionableItems) ? parsed.entry.actionableItems.map((action: any) => ({ actionType: actionTypes.has(action?.actionType) ? action.actionType : "other", title: typeof action?.title === "string" ? action.title.trim() : "", description: typeof action?.description === "string" ? action.description.trim() || undefined : undefined, timingText: typeof action?.timingText === "string" ? action.timingText.trim() || undefined : undefined, source: safeSource(action?.source) })).filter((action: any) => {
        if (!action.title) return false;
        if (action.actionType === "other") return true;
        if (seenActionTypes.has(action.actionType)) return false;
        seenActionTypes.add(action.actionType);
        return true;
      }) : [];
      const groundedSources = sources(parsed.taxRefund?.sources);
      const numericRule = normalizeNumericRule(parsed.taxRefund?.numericRule, researchMode === "grounded" && groundedSources.length > 0);
      const numericRuleSource = numericRule ? researchMode : undefined;
      const numericCalculationAvailable = Boolean(numericRule);
      res.json({ travelRules: { context: { tripId, destination, passportCountryCode, residenceCountryCode, residenceStatus: residenceCountryCode ? "known" : "unknown", startDate, endDate }, destination, passportCountryCode, residenceStatus: residenceCountryCode ? "known" : "unknown", entry: { guidance: typeof parsed.entry?.summary === "string" ? parsed.entry.summary : "", summary: typeof parsed.entry?.summary === "string" ? parsed.entry.summary : "", actionableItems: actions, sources: researchMode === "grounded" ? sources(parsed.entry?.sources) : [], fetchedAt }, taxRefund: { guidance: typeof parsed.taxRefund?.summary === "string" ? parsed.taxRefund.summary : "", summary: typeof parsed.taxRefund?.summary === "string" ? parsed.taxRefund.summary : "", merchantRequirements: Array.isArray(parsed.taxRefund?.merchantRequirements) ? parsed.taxRefund.merchantRequirements : [], documentRequirements: Array.isArray(parsed.taxRefund?.documentRequirements) ? parsed.taxRefund.documentRequirements : [], processNotes: Array.isArray(parsed.taxRefund?.processNotes) ? parsed.taxRefund.processNotes : [], numericRule, numericRuleSource, sources: researchMode === "grounded" ? groundedSources : [], fetchedAt, numericCalculationAvailable, disclaimer: typeof parsed.taxRefund?.disclaimer === "string" ? parsed.taxRefund.disclaimer : "退稅資訊僅供行前參考，資格仍取決於居住地與官方規定。" }, generatedAt: fetchedAt, source: "AI_PREPARATION", researchMode, disclaimer: researchMode === "grounded" ? "資料來自搜尋研究結果，請於出發前向官方來源確認。" : "此為 AI 行前整理，未經即時官方來源驗證，請於出發前再次確認最新規定。" } });
    } catch { res.status(502).json({ error: "Travel rules research is unavailable." }); }
  });

  app.post("/api/community/post-slices", async (req, res) => {
    const postId = typeof req.body?.postId === "string" ? req.body.postId.trim() : "";
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    const country = typeof req.body?.country === "string" ? req.body.country.trim() : "";
    const city = typeof req.body?.city === "string" ? req.body.city.trim() : "";
    if (!postId || !title || content.length < 10 || !country || !city) { res.status(400).json({ error: "貼文內容不足，無法分析。" }); return; }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { res.status(503).json({ error: "AI 分析目前無法使用。" }); return; }
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({ model: "gemini-3-flash-preview", contents: `從這篇旅行貼文找出可重複使用的旅行實體，並在每個實體底下整理具體、可執行的作者經驗或建議。不要一個句子切成一個 slice；把同一個地點的經驗放在同一個 slice。只保留 place、food、hotel、activity、transport、tip；排除「很好玩」等無法行動的一般 filler。不要捏造 placeId、address、座標。貼文標題：${title}\n貼文內容：${content}\n地點：${country}・${city}\n只回傳 JSON。`, config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { slices: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { type: { type: Type.STRING, enum: ['place', 'food', 'hotel', 'activity', 'transport', 'tip'] }, title: { type: Type.STRING }, summary: { type: Type.STRING }, placeName: { type: Type.STRING }, sourceText: { type: Type.STRING }, notes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { type: { type: Type.STRING, enum: ['recommendation', 'warning', 'timing', 'queue', 'packing', 'facility', 'price', 'order', 'transport', 'practical', 'other'] }, text: { type: Type.STRING }, sourceText: { type: Type.STRING } }, required: ['type', 'text'] } } }, required: ['type', 'title', 'notes'] } } }, required: ['slices'] } } });
      const parsed = JSON.parse(response.text?.trim() || '{"slices":[]}');
      const slices = Array.isArray(parsed.slices) ? parsed.slices.map((slice: any) => ({ type: slice.type, title: typeof slice.title === 'string' ? slice.title.trim() : '', summary: typeof slice.summary === 'string' ? slice.summary.trim() || undefined : undefined, placeName: typeof slice.placeName === 'string' ? slice.placeName.trim() || undefined : undefined, sourceText: typeof slice.sourceText === 'string' ? slice.sourceText.trim() || undefined : undefined, notes: Array.isArray(slice.notes) ? slice.notes.map((note: any) => ({ type: note.type, text: typeof note.text === 'string' ? note.text.trim() : '', sourceText: typeof note.sourceText === 'string' ? note.sourceText.trim() || undefined : undefined })).filter((note: any) => note.text && ['recommendation', 'warning', 'timing', 'queue', 'packing', 'facility', 'price', 'order', 'transport', 'practical', 'other'].includes(note.type)) : [] })).filter((slice: any) => slice.title && ['place', 'food', 'hotel', 'activity', 'transport', 'tip'].includes(slice.type) && slice.notes.length > 0) : [];
      console.info('Community post slicing result', { postId, success: true, sliceCount: slices.length });
      res.json({ slices });
    } catch { console.warn('Community post slicing failed', { postId }); res.status(502).json({ error: "AI 分析目前無法使用。" }); }
  });

  /**
   * Real shops for a search phrase.
   *
   * The model proposes what kind of place to look for; the names, addresses
   * and links come from Google Places. A language model asked for shop names
   * produces plausible ones, and a traveller who walks to an address that was
   * never there has been failed worse than by no recommendation at all.
   */
  /**
   * Which eligible to-dos are one job for one person.
   *
   * The model groups, titles and explains — nothing else. It is never asked
   * whether a task needs a human, because misreading a free lookup as paid
   * errand work is invisible to the reader. The client checks every id against
   * the real checklist and falls back to its own arithmetic when this route is
   * unavailable, which on a spent quota it routinely is.
   */
  app.post("/api/service-bundles", async (req, res) => {
    const tasks: Array<{ id: string; name: string }> = Array.isArray(req.body?.tasks)
      ? req.body.tasks
          .filter((task: any) => typeof task?.id === "string" && typeof task?.name === "string" && task.name.trim())
          .slice(0, 20)
      : [];
    const destination = typeof req.body?.destination === "string" ? req.body.destination.trim() : "";
    if (tasks.length < 2) {
      res.json({ bundles: [] });
      return;
    }
    const apiKey = process.env.GEMINI_API_KEY;
    // The client groups the tasks itself, so no key simply means no nicer title.
    if (!apiKey) {
      res.json({ bundles: [] });
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await withModelFallback(model => ai.models.generateContent({
        model,
        contents: `以下是一位旅人的待辦事項，他想把可以交給同一個人處理的項目合併成一份協助需求。請判斷哪些項目屬於同一件事（同一個場所、同一個活動主題、同一種需要的能力、或有先後關係），並給每一組一個簡短標題與一句理由。\n只因為屬於同一趟旅行就合併是錯的（例如「東京餐廳預約」和「大阪遺失行李處理」不該合併）。合不起來就不要輸出那一組。\n只能使用下列 id，不可以發明新的 id、不可以修改項目文字、不可以回傳網址、價格、預約狀態或完成狀態。\n目的地：${destination || "未指定"}\n待辦：${JSON.stringify(tasks)}\n只回傳 JSON。`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              bundles: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    suggestedTitle: { type: Type.STRING },
                    taskIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                    reason: { type: Type.STRING },
                  },
                  required: ["suggestedTitle", "taskIds"],
                },
              },
            },
            required: ["bundles"],
          },
        },
      }));
      const parsed = JSON.parse(response.text?.trim() || '{"bundles":[]}');
      const known = new Set(tasks.map((task) => task.id));
      const bundles = (Array.isArray(parsed.bundles) ? parsed.bundles : [])
        .map((bundle: any, index: number) => ({
          id: `ai-${index + 1}`,
          suggestedTitle: typeof bundle?.suggestedTitle === "string" ? bundle.suggestedTitle.trim() : "",
          // Checked here as well as on the client: an invented id would become
          // a blank line in a request a person is meant to act on.
          taskIds: Array.isArray(bundle?.taskIds)
            ? bundle.taskIds.filter((id: unknown) => typeof id === "string" && known.has(id))
            : [],
          reason: typeof bundle?.reason === "string" ? bundle.reason.trim() || undefined : undefined,
        }))
        .filter((bundle: any) => bundle.suggestedTitle && bundle.taskIds.length > 1);
      res.json({ bundles });
    } catch (error: any) {
      const status = error?.status ?? error?.response?.status;
      const exhausted = error?.code === "RESOURCE_EXHAUSTED" || error?.message?.includes("RESOURCE_EXHAUSTED");
      console.warn("Service bundle suggestion failed", { exhausted: Boolean(exhausted || status === 429) });
      // The client groups the tasks itself when this fails, so an error here
      // costs a nicer title, not the feature.
      res.status(502).json({ error: "Bundle suggestion is unavailable." });
    }
  });

  app.post("/api/places/suggest", async (req, res) => {
    const queries: string[] = Array.isArray(req.body?.queries)
      ? req.body.queries.filter((query: unknown) => typeof query === "string" && query.trim()).slice(0, 6)
      : [];
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "Place lookup is not configured." });
      return;
    }
    if (!queries.length) {
      res.status(400).json({ error: "At least one query is required." });
      return;
    }

    try {
      const groups = await Promise.all(queries.map(async (query) => {
        const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            // websiteUri is what turns "預約橫濱 Snova" into a booking page rather than
            // a pin: the venue's own site, as the map service holds it, never a URL
            // a model wrote.
            "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.rating,places.googleMapsUri,places.websiteUri",
          },
          body: JSON.stringify({ textQuery: query.trim(), languageCode: "zh-TW", maxResultCount: 3 }),
        });
        if (!response.ok) return { query: query.trim(), places: [] };
        const payload = await response.json() as { places?: Array<Record<string, any>> };
        return {
          query: query.trim(),
          places: (payload.places ?? []).map((place) => ({
            name: place.displayName?.text ?? "",
            address: place.formattedAddress ?? "",
            rating: typeof place.rating === "number" ? place.rating : undefined,
            mapsUrl: place.googleMapsUri ?? "",
            websiteUrl: place.websiteUri ?? undefined,
          })).filter((place) => place.name && place.mapsUrl),
        };
      }));
      res.json({ groups: groups.filter((group) => group.places.length) });
    } catch (error) {
      console.error("Place suggestion request failed:", error);
      res.status(502).json({ error: "Place lookup is unavailable." });
    }
  });

  /**
   * Plans, not places.
   *
   * 「想滑雪」 asked from inside a Busan trip is a decision problem: which
   * option fits this trip, is it realistic from here, one day or two, what will
   * it cost. The older suggestion route answers with things to pack, which is
   * why this is a separate endpoint rather than another field on that one.
   *
   * Each layer owns what it can prove:
   *   - the map service owns the venue's identity, address and coordinates
   *   - the routing service owns travel time, so 交通負擔 is measured
   *   - grounded search owns opening periods, prices and booking requirements
   *   - the model owns synthesis alone: why this suits, what it costs the
   *     traveller, how the day is shaped, how the options differ
   *
   * A price the model merely remembers is not a price. Without a grounded
   * search the budget is dropped and the client shows 價格需確認, because a
   * remembered figure and a looked-up one look identical on screen.
   */
  app.post("/api/activity-plans", async (req, res) => {
    const intent = typeof req.body?.intent === "string" ? req.body.intent.trim() : "";
    const destination = typeof req.body?.destination === "string" ? req.body.destination.trim() : "";
    const daysBrief = typeof req.body?.daysBrief === "string" ? req.body.daysBrief.trim().slice(0, 800) : "";
    const budgetBrief = typeof req.body?.budgetBrief === "string" ? req.body.budgetBrief.trim().slice(0, 300) : "";
    const originLatitude = Number(req.body?.originLatitude);
    const originLongitude = Number(req.body?.originLongitude);
    const hasOrigin =
      Number.isFinite(originLatitude) && Number.isFinite(originLongitude) &&
      Math.abs(originLatitude) <= 90 && Math.abs(originLongitude) <= 180;

    // A revision of one plan the traveller is already looking at, in their own
    // words. Same endpoint on purpose: a second route would carry its own
    // parsing, and every guard below — the derived duration, the preparation
    // cross-check, the price hierarchy — would be missing from it.
    const revisingPlan = req.body?.revising?.plan;
    const revisionNote = typeof req.body?.revising?.feedback === "string"
      ? req.body.revising.feedback.trim().slice(0, 500)
      : "";
    const isRevision = Boolean(revisingPlan && revisionNote);

    const apiKey = process.env.GEMINI_API_KEY;
    const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) { res.status(503).json({ error: "行程規劃服務尚未設定。" }); return; }
    if (!intent || intent.length > 500) { res.status(400).json({ error: "請描述你想做的事。" }); return; }

    // Stable from this first response onward, so every later event about this
    // set of options points at something that still exists.
    const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // Revise what is on screen rather than start again: regenerating would
    // also discard the parts they did not complain about, which is most of it.
    const revisionBlock = isRevision
      ? `這位旅人已經看過下面這個方案，並且說了他想改的地方。\n\n【目前的方案】\n${JSON.stringify(revisingPlan).slice(0, 4000)}\n\n【他想改的地方】\n「${revisionNote}」\n\n請**只改他提到的部分**，其他保持原樣——他沒有抱怨的地方就是他接受的地方。改完只回傳這一個修訂後的方案（options 只放一個）。如果他的要求做不到（例如時間或距離不允許），照樣回傳方案，並在 tradeoff 裡誠實說明哪裡做不到、為什麼。\n\n`
      : "";

    try {
      const ai = new GoogleGenAI({ apiKey });
      const generationConfig = {
        contents: `${revisionBlock}一位旅人正在規劃${destination ? `${destination}的` : ""}旅程，他說：「${intent}」。\n${daysBrief}\n${budgetBrief}\n\n請先查資料，判斷從${destination || "他的目的地"}出發做這件事實際上是什麼樣子，然後提出 **2 到 3 個彼此明顯不同的方案**，幫他做決定。\n\n方案之間要有意義的差異（最省事／最適合這趟／完整體驗／較省錢／舒適便利／過夜），不要三張幾乎一樣的卡。**資料只支持一到兩個好方案時，就只給一到兩個**，不要湊數。\n\n每個方案：\n- title：看得出差異的名稱\n- whyItFits：為什麼這個方案適合「這一趟」，兩句話\n- tradeoff：這個方案的代價是什麼（時間、金錢、體力、彈性），一句話\n- durationDays：**這個方案本身**需要幾天（不是整趟旅程的天數）\n- characteristics：從 easiest / best_fit / fuller / lower_budget / premium / overnight 選 1 到 2 個\n- mainPlaceName：這個方案最主要的場所名稱，要真實存在、你在搜尋結果中看到的\n- budget：**只有查到實際價格時才填** min / max / currency，查不到就整個省略。不要用印象中的數字。\n- preparation：這個方案需要先準備的事，2 到 4 項，每項有 name 與 canBeHumanAssisted（是否適合請當地人代勞，例如打電話預約、現場陪同）。**行程裡出現的每一項需要事先安排的東西都必須在這裡**——行程寫了租車就要有預約租車，寫了渡輪就要有訂船票。行程做得到、但準備清單沒寫的事，使用者到現場才會發現。\n- items：逐時段行程，每項 time（HH:MM）、title、placeName、type（ACTIVITY/FOOD/TRANSPORT/HOTEL）、dayOffset（從 0 開始）、durationMinutes、notes\n\n另外給 intro：一句話說明你怎麼看這個需求，例如「從釜山安排滑雪，建議至少留 1 天」。\n\n嚴格規則：\n- 地點必須真實存在。不要編場館名稱。\n- **不要輸出任何網址**，連結由地圖服務提供。\n- **不要自己估交通時間**，交通由路線服務計算。\n- 不要宣稱有空位、可預約、已開放，除非查到的資料明確寫了。\n- 不確定的事寫進 notes 說需再確認，不要寫成事實。
- **沒有查到價格時，任何文字裡都不准出現金額**——intro、whyItFits、tradeoff 都一樣。不要寫「建議預算提高到 X 元」「門票約 X」。使用者不會分辨數字在欄位裡還是在句子裡，他會照著編預算。\n- **不要評論或形容這位旅人本身**（他的消費習慣、個性、經濟狀況）。預算數字只用來挑選合適的方案，不要寫成對他的描述。\n- 使用繁體中文。\n\n只回傳 JSON。`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intro: { type: Type.STRING },
              options: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    whyItFits: { type: Type.STRING },
                    tradeoff: { type: Type.STRING },
                    durationDays: { type: Type.NUMBER },
                    characteristics: { type: Type.ARRAY, items: { type: Type.STRING, enum: ["easiest", "best_fit", "fuller", "lower_budget", "premium", "overnight"] } },
                    mainPlaceName: { type: Type.STRING },
                    budget: {
                      type: Type.OBJECT,
                      properties: { min: { type: Type.NUMBER }, max: { type: Type.NUMBER }, currency: { type: Type.STRING } },
                    },
                    preparation: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: { name: { type: Type.STRING }, canBeHumanAssisted: { type: Type.BOOLEAN } },
                        required: ["name"],
                      },
                    },
                    items: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          time: { type: Type.STRING },
                          title: { type: Type.STRING },
                          placeName: { type: Type.STRING },
                          type: { type: Type.STRING, enum: ["ACTIVITY", "FOOD", "TRANSPORT", "HOTEL"] },
                          dayOffset: { type: Type.NUMBER },
                          durationMinutes: { type: Type.NUMBER },
                          notes: { type: Type.STRING },
                        },
                        required: ["time", "title", "type"],
                      },
                    },
                  },
                  required: ["title", "whyItFits", "durationDays", "items"],
                },
              },
            },
            required: ["options"],
          },
        },
      } as const;

      // The model comes from the chain rather than a hard-coded name: the free
      // tier meters per model per day, so one exhausted model says nothing
      // about the next.
      const generate = (useSearch: boolean) =>
        withModelFallback(model => ai.models.generateContent({
          model,
          ...generationConfig,
          config: { ...generationConfig.config, ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}) },
        }));

      let response;
      let grounded = true;
      try {
        response = await generate(true);
      } catch (groundedError: any) {
        const exhausted = groundedError?.status === 429 || groundedError?.message?.includes("RESOURCE_EXHAUSTED");
        console.warn("Grounded activity-plan lookup failed; retrying without search.", { exhausted: Boolean(exhausted) });
        grounded = false;
        response = await generate(false);
      }

      const parsed = JSON.parse(response.text?.trim() || '{"options":[]}');
      const rawOptions = (Array.isArray(parsed.options) ? parsed.options : []).slice(0, 3);

      /** The venue as the map service knows it, never as the model spelled it. */
      const resolvePlace = async (name: string) => {
        if (!mapsKey || !name) return null;
        try {
          const lookup = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": mapsKey,
              "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.websiteUri,places.priceLevel,places.priceRange",
            },
            body: JSON.stringify({ textQuery: `${name} ${destination}`.trim(), languageCode: "zh-TW", maxResultCount: 1 }),
            signal: AbortSignal.timeout(10_000),
          });
          if (!lookup.ok) return null;
          const payload = await lookup.json() as { places?: Array<Record<string, any>> };
          const place = payload.places?.[0];
          if (!place?.location) return null;
          return {
            placeId: place.id as string | undefined,
            name: (place.displayName?.text as string | undefined) || name,
            address: place.formattedAddress as string | undefined,
            latitude: place.location.latitude as number,
            longitude: place.location.longitude as number,
            mapsUrl: place.googleMapsUri as string | undefined,
            websiteUrl: place.websiteUri as string | undefined,
            // The venue's own price band, as the map service holds it. Not the
            // plan's total — but it is a real figure from a real source, which
            // beats showing nothing every time the search quota is spent.
            priceLevel: place.priceLevel as string | undefined,
            priceRange: place.priceRange
              ? {
                  currency: place.priceRange.startPrice?.currencyCode || place.priceRange.endPrice?.currencyCode,
                  start: place.priceRange.startPrice?.units ? Number(place.priceRange.startPrice.units) : undefined,
                  end: place.priceRange.endPrice?.units ? Number(place.priceRange.endPrice.units) : undefined,
                }
              : undefined,
          };
        } catch { return null; }
      };

      /** Measured, never estimated. Absent when routing cannot answer. */
      const travelMinutes = async (lat: number, lng: number): Promise<number | undefined> => {
        if (!mapsKey || !hasOrigin) return undefined;
        try {
          const route = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Goog-Api-Key": mapsKey, "X-Goog-FieldMask": "routes.duration" },
            body: JSON.stringify({
              origin: { location: { latLng: { latitude: originLatitude, longitude: originLongitude } } },
              destination: { location: { latLng: { latitude: lat, longitude: lng } } },
              travelMode: "DRIVE",
            }),
            signal: AbortSignal.timeout(10_000),
          });
          if (!route.ok) return undefined;
          const data = await route.json() as { routes?: Array<{ duration?: string }> };
          const seconds = data.routes?.[0]?.duration ? Number(data.routes[0].duration.replace(/s$/, "")) : NaN;
          return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds / 60) : undefined;
        } catch { return undefined; }
      };

      const options = await Promise.all(rawOptions.map(async (option: any, index: number) => {
        const resolved = await resolvePlace(typeof option?.mainPlaceName === "string" ? option.mainPlaceName.trim() : "");
        const minutes = resolved ? await travelMinutes(resolved.latitude, resolved.longitude) : undefined;
        const resolvedName = resolved?.name || "";

        const items = (Array.isArray(option?.items) ? option.items : [])
          .map((item: any) => {
            const named = typeof item?.placeName === "string" ? item.placeName.trim() : "";
            // Identity attaches only where the map service confirmed this exact
            // venue. A name that merely looks similar earns no placeId.
            const isMainVenue = Boolean(
              resolved && named && (named === resolvedName || named.includes(resolvedName) || resolvedName.includes(named)),
            );
            return {
              time: typeof item?.time === "string" ? item.time.trim() : "",
              title: typeof item?.title === "string" ? item.title.trim() : "",
              placeName: isMainVenue ? resolvedName : named || undefined,
              type: ["ACTIVITY", "FOOD", "TRANSPORT", "HOTEL"].includes(item?.type) ? item.type : "ACTIVITY",
              dayOffset: Number.isFinite(item?.dayOffset) ? Math.max(0, Math.round(item.dayOffset)) : 0,
              durationMinutes: Number.isFinite(item?.durationMinutes) ? Math.round(item.durationMinutes) : undefined,
              notes: typeof item?.notes === "string" ? item.notes.trim() || undefined : undefined,
              ...(isMainVenue
                ? {
                    placeId: resolved!.placeId,
                    address: resolved!.address,
                    latitude: resolved!.latitude,
                    longitude: resolved!.longitude,
                  }
                : {}),
            };
          })
          .filter((item: any) => item.title && /^\d{1,2}:\d{2}$/.test(item.time));

        // Derived from the schedule, not taken from the model. Asked inside a
        // ten-day trip it answered "10 天" for a plan whose items all sat on one
        // day — which is the trip's length, not the plan's, and it turned the
        // one column that distinguishes the options into noise. The items are
        // what actually gets inserted, so they decide.
        const durationDays = items.length > 0
          ? Math.max(...items.map((item: any) => item.dayOffset)) + 1
          : 1;

        const budget = option?.budget;
        const hasBudget = Boolean(
          grounded && budget && Number.isFinite(budget.min) && Number.isFinite(budget.max) && typeof budget.currency === "string",
        );

        return {
          id: `${requestId}-opt-${index + 1}`,
          title: typeof option?.title === "string" ? option.title.trim() : "",
          // Prose is held to the same rule as the budget field. A card that
          // says 價格需確認 and a sentence beside it quoting 4,500 台幣 are
          // the same screen, and the traveller budgets against the sentence.
          whyItFits: (hasBudget
            ? (typeof option?.whyItFits === "string" ? option.whyItFits.trim() : "")
            : stripPriceClaims(typeof option?.whyItFits === "string" ? option.whyItFits.trim() : "")) || "",
          tradeoff: hasBudget
            ? (typeof option?.tradeoff === "string" ? option.tradeoff.trim() || undefined : undefined)
            : stripPriceClaims(typeof option?.tradeoff === "string" ? option.tradeoff.trim() || undefined : undefined),
          durationDays,
          characteristics: Array.isArray(option?.characteristics)
            ? option.characteristics.filter((value: unknown) =>
                ["easiest", "best_fit", "fuller", "lower_budget", "premium", "overnight"].includes(value as string))
            : [],
          logistics: {
            originLabel: destination || undefined,
            travelMinutesEachWay: minutes,
            burden: minutes === undefined ? undefined : minutes <= 60 ? "low" : minutes <= 150 ? "medium" : "high",
          },
          budget: hasBudget ? { min: Math.round(budget.min), max: Math.round(budget.max), currency: budget.currency.trim() } : undefined,
          budgetConfidence: hasBudget ? "verified" : "unverified",
          // Cross-checked against the schedule rather than trusted as written.
          // The model fills these two fields separately, so a plan could open
          // by collecting a rental car and never mention booking one — the
          // same failure as durationDays, in a field a traveller acts on.
          preparation: markDepartureTiming(withRequiredPreparation(
            items,
            (Array.isArray(option?.preparation) ? option.preparation : [])
              .map((task: any) => ({
                name: typeof task?.name === "string" ? task.name.trim() : "",
                canBeHumanAssisted: task?.canBeHumanAssisted === true,
              }))
              .filter((task: any) => task.name),
          )),
          items,
          mapsUrl: resolved?.mapsUrl,
          websiteUrl: resolved?.websiteUrl,
          venuePrice:
            resolved?.priceRange?.currency && (resolved.priceRange.start || resolved.priceRange.end)
              ? {
                  venueName: resolved.name,
                  currency: resolved.priceRange.currency,
                  start: resolved.priceRange.start,
                  end: resolved.priceRange.end,
                }
              : undefined,
        };
      }));

      // Only pages the search step actually returned.
      const sources = (((response as any).candidates?.[0]?.groundingMetadata?.groundingChunks || []) as any[])
        .map((chunk) => ({ title: chunk.web?.title as string | undefined, url: chunk.web?.uri as string | undefined }))
        .filter((source) => source.url)
        .slice(0, 5);

      // The intro frames the whole set, so it may keep a figure only if some
      // plan in that set actually has a verified one behind it.
      const anyVerified = options.some((option: any) => option.budgetConfidence === "verified");
      const introText = typeof parsed.intro === "string" ? parsed.intro.trim() : undefined;

      res.json({
        requestId,
        intro: anyVerified ? introText : stripPriceClaims(introText),
        options: options.filter((option: any) => option.title && option.items.length > 0),
        grounded,
        sources,
      });
    } catch (error: any) {
      const status = error?.status ?? error?.response?.status;
      const exhausted = error?.code === "RESOURCE_EXHAUSTED" || error?.message?.includes("RESOURCE_EXHAUSTED");
      console.warn("Activity plan generation failed", { exhausted: Boolean(exhausted || status === 429) });
      // Nobody can name a beginner-friendly resort without looking it up, so
      // there is no honest offline fallback to fall back to here.
      res.status(502).json({ error: "現在查不到資料，稍後再試一次。" });
    }
  });

  app.post("/api/preparation-suggestions", async (req, res) => {
    const context = typeof req.body?.context === "string" ? req.body.context.trim() : "";
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "Preparation suggestion service is not configured." });
      return;
    }
    if (!context) {
      res.status(400).json({ error: "A valid trip context is required." });
      return;
    }
    if (context.length > 8000) {
      res.status(400).json({ error: "Preparation context is too long." });
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const generationConfig = {
          // The user's own question is the brief, not a hint. Sweeping every
          // category returned the same nine-item starter list whatever was
          // asked — someone who says 「非常怕冷」 got told to buy travel
          // insurance and apply for a visa, and stopped trusting the feature.
          contents: `以下是一趟旅程的資料，最後一行是使用者實際提出的問題或情況：\n\n${context}\n\n請**只針對使用者提出的問題或情況**，給 3 到 6 個具體的出發前準備待辦。\n\n規則：\n- 每一則都必須是為了回應使用者那句話而存在；跟它無關的一律不要給。\n- 不要為了湊類別而補上機票、住宿、保險、簽證、eSIM 等通用項目，除非使用者的問題確實牽涉到它。\n- 能具體就具體：與目的地當季條件、使用者描述的狀況直接相關。\n- reason 要說明「為什麼這件事能解決使用者說的問題」。\n- 不要假設使用者已經預訂或完成任何事。\n- 使用繁體中文，每則是可加入 checklist 的簡短待辦。\n- 若旅人分享區塊有內容，可以引用其中與問題相關的經驗，並把用到的貼文編號放進 postRefs。旅人的經驗是個人見聞，不等於官方規定；與官方資訊衝突時以官方為準，也不要把單一貼文的說法寫成通則。\n- 如果使用者的問題需要在當地買或租東西，另外給 placeQueries：0 到 3 句地圖搜尋用的字串，格式是「城市 店家類型」，例如「釜山 滑雪用品店」。不要在 placeQueries 裡寫店名——實際店家由地圖服務提供，不要自己想。\n\n只回傳 JSON。`,
          config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    item: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                  required: ["item", "reason"],
                },
              },
              placeQueries: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              postRefs: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ["suggestions"],
          },
        },
      } as const;
      // Search-grounded first, like the travel-rules lookup: advice about a
      // place changes, and a model answering from memory cannot know that a
      // shop closed or a pass was withdrawn. Ungrounded is the fallback, not
      // the default, and the answer says which one it was.
      const generatePreparation = (grounded: boolean, model: string) =>
        ai.models.generateContent({
          model,
          ...generationConfig,
          config: {
            ...generationConfig.config,
            ...(grounded ? { tools: [{ googleSearch: {} }] } : {}),
          },
        });

      let response;
      let grounded = true;
      try {
        response = await withModelFallback(model => generatePreparation(true, model));
      } catch (groundedError) {
        console.warn("Grounded preparation lookup failed; retrying without search.", groundedError);
        grounded = false;
        // No third attempt on a named model: the chain has already tried every
        // one of them, so this was a repeat of the last thing that failed.
        response = await withModelFallback(model => generatePreparation(false, model));
      }

      // Only URLs the search step actually returned. A model-written link is
      // a plausible-looking guess, and a citation that 404s is worse than none.
      const sources = (((response as any).candidates?.[0]?.groundingMetadata?.groundingChunks || []) as any[])
        .map((chunk) => ({
          title: chunk.web?.title as string | undefined,
          url: chunk.web?.uri as string | undefined,
        }))
        .filter((source) => typeof source.url === "string")
        .slice(0, 5);

      const raw = response.text?.trim();
      if (!raw) {
        res.json({ suggestions: [], placeQueries: [], postRefs: [], sources, grounded });
        return;
      }
      const data = JSON.parse(raw.replace(/```json|```/g, "").trim());
      res.json({
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
        placeQueries: Array.isArray(data.placeQueries)
          ? data.placeQueries.filter((query: unknown) => typeof query === "string" && query.trim()).slice(0, 3)
          : [],
        postRefs: Array.isArray(data.postRefs)
          ? data.postRefs.filter((id: unknown) => typeof id === "string" && id.trim()).slice(0, 5)
          : [],
        sources,
        grounded,
      });
    } catch (error) {
      console.error("Preparation suggestion request failed:", error);
      res.status(502).json({ error: "Preparation suggestion service is unavailable." });
    }
  });

  app.post("/api/itinerary-proposals", async (req, res) => {
    const input = req.body;
    if (!input || typeof input.startDate !== "string" || typeof input.endDate !== "string") { res.status(400).json({ error: "Trip dates are required." }); return; }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { res.status(503).json({ error: "Itinerary planning service is not configured." }); return; }

    // Adjustment of an itinerary that already has items. Branches ahead of the
    // creation path because it is the one mode where an empty `selections` list is
    // legitimate: the user may just want their current plan reordered.
    if (input.adjustmentMode === "add" || input.adjustmentMode === "fill" || input.adjustmentMode === "reorder" || input.adjustmentMode === "replan") {
      const mode = input.adjustmentMode as "add" | "fill" | "reorder" | "replan";
      const existingItinerary = Array.isArray(input.existingItinerary) ? input.existingItinerary : [];
      if (existingItinerary.length === 0) { res.status(400).json({ error: "目前沒有可調整的正式行程。" }); return; }
      const selections = Array.isArray(input.selections) ? input.selections : [];
      const model = "gemini-3-flash-preview";
      const planningPreferences = typeof input.planningPreferences === "string"
        ? input.planningPreferences.trim().slice(0, 1200)
        : "";

      // What each mode is allowed to emit. This is guidance only: the client
      // re-enforces it in normalizeItineraryAdjustment and again on apply, so a
      // model that ignores this text still cannot delete anything it may not.
      const MODE_RULES = {
        add: `模式：補充行程。
你「只能」回傳 type 為 "add" 的變更。
嚴禁回傳 move、update 或 remove：既有行程的日期、時間與內容一律保持原樣。
找出目前行程中合理的空檔再加入，不要把任何一天塞得太滿，新增的地點要和前後既有項目在地理上相近。
無論哪一種模式，isPinned 為 true 的項目都不可以被移動、刪除、改時間或改地點。`,
        fill: `模式：把空白的日子排滿。
你「只能」回傳 type 為 "add" 的變更。
嚴禁回傳 move、update 或 remove：既有行程一個都不會被動到，航班、住宿與使用者固定的項目全部原封不動。

這個模式的任務是「安排」，不是「補充」。
你「必須」自己提出適合這個目的地的知名景點、市場、海灘、觀景點與餐廳，不要等使用者給你地點。
【3b】的收藏清單是空的時候，那代表使用者還沒挑，不代表你沒有東西可以排——請直接用你對這個城市的既有知識規劃。
絕對不要因為「沒有可引用的收藏地點」就不排，也不要回傳空的一天並叫使用者自己加。
只提出真實存在、觀光客找得到的地點，並用它慣用的正式名稱；不確定是否存在的就不要放。

【3】的 unplannedDates 是目前整天只有航班與住宿、等於還沒安排的日子。
請把 unplannedDates 裡的「每一天」都排成一個完整可執行的一天，每天 3 到 5 個地點，不要只加一兩個就交差。
每一天都要有自己的主題與地理範圍：同一天的地點集中在同一區，不同天去不同區域，不要讓使用者每天橫跨整個城市。

排每一天的時候：
- 從【2】裡那一天的航班與住宿讀出這一天實際可用的時間。抵達當天只排下午與晚上，離開當天只排退房前，不要安排在飛機起飛之後。
- 住宿的位置就是每天的起點和終點，動線要從那裡出發、回得去。
- 用餐時段要排到食物，不要整天只有景點。
- 沒有被指派的空白日子要在 warnings 說明原因，不要無聲略過。

無論哪一種模式，isPinned 為 true 的項目都不可以被移動、刪除、改時間或改地點。`,
        reorder: `模式：重新安排路線。
你可以回傳 type 為 "move"、"update"、"add" 的變更。
嚴禁回傳 remove：使用者目前想去的每一個地點都必須留下來，只能改日期、改時間、改順序。
把地理上相近的地點安排在同一天、相鄰的時段，減少來回移動。
無論哪一種模式，isPinned 為 true 的項目都不可以被移動、刪除、改時間或改地點。`,
        replan: `模式：重新規劃。
你可以回傳 type 為 "add"、"move"、"update"、"remove" 的變更。
刪除必須非常克制，而且每一個 remove 都要在 reason 寫清楚為什麼建議拿掉；使用者會先看到再決定。
無論哪一種模式，isPinned 為 true 的項目都不可以被移動、刪除、改時間或改地點。`,
      } as const;

      const preferenceBlock = planningPreferences
        ? `\n\n【4. 使用者這次想怎麼調整（自由文字）】\n"""\n${planningPreferences}\n"""\n這是高優先度的調整指示。請照著調整出發時間、每天的密度、交通方式與活動類型。\n它仍必須服從旅程日期、地理位置、既有地點識別與模式規則；做不到就盡力接近並在 warnings 說明，不要假裝已經滿足。\n這段文字「不會」賦予任何地點收藏靈感的身分：因為這段話而加入的地點，sourceInspirationIds 一律是空陣列。`
        : "";

      /**
       * The day this request is planning, when there is exactly one.
       *
       * Filling a week is split into one request per day. The first two models
       * in the chain spend their daily allowance early, so the model that
       * actually answers is usually a `-lite` one — and asked to plan six days
       * from a prompt this long it returned a single change with no place name
       * on it. One day is a task that size of model can finish.
       *
       * It also fails better: a day that comes back empty costs that day, not
       * the whole week.
       */
      const configFor = (focusDate: string | null, plannedElsewhere: string[] = []) => {
      // Each day is planned in its own request, so no day can see what the
      // others were given. Left to themselves both days opened at 海雲臺海水浴場
      // and closed at The Bay 101 — a correct answer to "plan one day in
      // Busan", produced twice. This is how the request carries the trip.
      const alreadyBlock = plannedElsewhere.length > 0
        ? `\n\n【0b. 這趟旅程其他日子已經排了這些地點，絕對不要重複】\n${plannedElsewhere.join("、")}\n請安排不同區域、不同類型的地點。`
        : "";
      const focusBlock = focusDate
        ? `\n\n【0. 這次只規劃這一天：${focusDate}】\n只回傳 toDate 等於 ${focusDate} 的 add，其他日子這次完全不要碰。把這一天排成完整的一天：3 到 5 個地點，含用餐。${alreadyBlock}`
        : "";
      return {
        contents: `使用者這趟旅程「已經有正式行程」了。請先讀懂目前的安排，再提出調整建議。不要當成空白行程重排。${focusBlock}

【1. 旅程事實】
只能使用 ${input.startDate} 到 ${input.endDate} 之間的日期。目的地：${input.destination || ""}${input.destinationCountry ? `（${input.destinationCountry}）` : ""}。共 ${input.durationDays || "未知"} 天。

【2. 目前的正式行程（這是事實，不是建議）】
${JSON.stringify(existingItinerary)}
每個項目的 id 是穩定識別碼。要更動既有項目時，existingItemId 必須原封不動使用這裡的 id。
locked 為 true 的項目（航班錨點、已連結支出、固定行程）完全不能被 move、update 或 remove。
fixedEvent 為 true 的項目是硬性時間限制（航班、火車、訂位、已購票活動）：其他行程必須繞開它，絕對不要在它的時段安排觀光，也不要提議更改它的時間。
accommodation 為 true 的項目是入住／退房：它是每天動線的起點與終點，讀它來決定當天的活動範圍，但它本身不是當天的行程內容。
isPinned 為 true 的項目是使用者親手固定的錨點，在所有模式（補充行程、重新安排路線、重新規劃）都是硬性限制：不可以移動它、不可以刪除它、不可以更改它的時間、不可以更改它的地點。請把它當成固定錨點，安排周邊的其他行程來配合它。

【3. 系統對目前行程的分析】
${JSON.stringify(input.analysis || {})}
emptyDates 是完全沒有安排的日子；unplannedDates 是整天只有航班與住宿、實際上還沒安排任何行程的日子（包含 emptyDates）；crowdedDates 是已經太滿的日子；untimedItemIds 是沒有時間的項目；tightTransitions 是前後太趕的銜接；longHops 是同一天相隔太遠的移動；unusedInspirationIds 是使用者收藏了但還沒排進行程的地點。

【3b. 使用者已收藏並挑選、可供參考的地點】
${JSON.stringify(selections)}${preferenceBlock}

【5. 模式規則（最重要）】
${MODE_RULES[mode]}

回傳規則：
1. 只回傳「變更」，不要回傳整份重排後的行程。沒有要動的項目就不要出現在 changes 裡。
2. move / update / remove 必須帶 existingItemId，而且只能用【2】裡出現過的 id。絕對不要用地點名稱指認項目。
3. 不要重複建議目前行程已經有的地點。
4. 每一筆 add 都「必須」帶 toDate，而且只能是 ${enumerateTripDates(input.startDate, input.endDate).join("、") || "旅程範圍內的日期"} 其中之一，並帶 toTime。沒有日期的建議使用者無法採用，會被系統丟棄。
5. add 的項目若來自【3b】的收藏地點，sourceInspirationIds 必須原封不動使用該地點的 inspirationIds；否則一律是空陣列。
6. 不要捏造 placeId 或座標；地點識別由系統自行帶入。
7. 每一筆變更都要在 reason 用繁體中文寫一句簡短理由。
8. summary 用繁體中文寫一兩句話，說明這次調整的整體想法。
只回傳 JSON。`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              changes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    existingItemId: { type: Type.STRING },
                    toDate: { type: Type.STRING },
                    toTime: { type: Type.STRING },
                    durationMinutes: { type: Type.NUMBER },
                    note: { type: Type.STRING },
                    reason: { type: Type.STRING },
                    proposedItem: {
                      type: Type.OBJECT,
                      properties: {
                        placeName: { type: Type.STRING },
                        suggestedStartTime: { type: Type.STRING },
                        durationMinutes: { type: Type.NUMBER },
                        note: { type: Type.STRING },
                        sourceInspirationIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                      },
                      required: ["placeName", "suggestedStartTime", "sourceInspirationIds"],
                    },
                  },
                  // In the two add-only modes every change must carry a place
                  // and a day, so the schema says so. With only `type`
                  // required, a `-lite` model legally returned
                  // `{type:'add', toTime:'22:45 N/A (Late Night Snack)'}` —
                  // no proposedItem at all, the place name stuffed into the
                  // time. Prompt wording did not move it; this did.
                  required: mode === "add" || mode === "fill"
                    ? ["type", "toDate", "proposedItem"]
                    : ["type"],
                },
              },
              warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["changes"],
          },
        },
      } as const;
      };

      const tripDates = enumerateTripDates(input.startDate, input.endDate);
      /**
       * The days this run has to plan, one request each.
       *
       * Only `fill` fans out. The other modes reason across the whole trip —
       * 重新安排路線 moves an item from Thursday to Tuesday, which a per-day
       * request cannot see — so splitting them would break what they are for.
       */
      const focusDates: Array<string | null> = mode === "fill"
        ? (Array.isArray(input.analysis?.unplannedDates) ? input.analysis.unplannedDates : [])
            .filter((date: unknown): date is string => typeof date === "string" && tripDates.includes(date))
            .slice(0, 10)
        : [null];
      if (focusDates.length === 0) focusDates.push(null);

      let attemptedModel = model;
      try {
        const ai = new GoogleGenAI({ apiKey });
        // The shared chain rather than a second model of its own.
        //
        // Two models is one transient failure away from nothing: the primary
        // was out of quota, the fallback answered 502, and the whole request
        // was lost. The chain carries four, each with its own daily allowance
        // and its own retry, and records which one answered so the error
        // message can still name it.
        const runOne = async (focusDate: string | null, plannedElsewhere: string[]) => {
          const response = await withModelFallback(candidate => {
            attemptedModel = candidate;
            return ai.models.generateContent({ model: candidate, ...configFor(focusDate, plannedElsewhere) });
          });
          const raw = response.text?.trim();
          if (!raw) throw new Error("empty");
          return JSON.parse(raw.replace(/```json|```/g, "").trim());
        };

        // Sequential, not parallel. Six simultaneous calls to one free-tier
        // key is how a per-minute limit gets hit, and a 429 partway through
        // would cost the days that had not started yet.
        const results: Array<{ focusDate: string | null; data: any } | { focusDate: string | null; failed: true }> = [];
        const plannedElsewhere: string[] = [];
        for (const focusDate of focusDates) {
          try {
            const data = await runOne(focusDate, plannedElsewhere);
            (Array.isArray(data.changes) ? data.changes : []).forEach((change: any) => {
              const name = change?.proposedItem?.placeName;
              if (typeof name === "string" && name.trim()) plannedElsewhere.push(name.trim());
            });
            results.push({ focusDate, data });
          } catch (error) {
            // One bad day is not a failed request — unless every day failed,
            // which falls through to the error handler below.
            if (focusDates.length === 1) throw error;
            console.error(`Itinerary fill failed for ${focusDate}:`, error);
            results.push({ focusDate, failed: true });
          }
        }
        const succeeded = results.filter((entry): entry is { focusDate: string | null; data: any } => !("failed" in entry));
        if (succeeded.length === 0) { res.json({ changes: [], warnings: ["AI 沒有回傳可檢視的調整建議。"] }); return; }

        // Checked rather than passed straight through. An add with no day is a
        // suggestion the traveller asked to have scheduled, handed back
        // unscheduled — and it reached the screen because nothing here looked.
        const checked = checkProposedChanges(
          succeeded.flatMap(entry => (Array.isArray(entry.data.changes) ? entry.data.changes : [])),
          tripDates,
        );
        const failedDates = results
          .filter(entry => "failed" in entry)
          .map(entry => entry.focusDate)
          .filter((date): date is string => Boolean(date));
        res.json({
          summary: succeeded.map(entry => (typeof entry.data.summary === "string" ? entry.data.summary : "")).filter(Boolean).join(" "),
          changes: checked.changes,
          warnings: [
            ...succeeded.flatMap(entry => (Array.isArray(entry.data.warnings) ? entry.data.warnings : [])),
            ...checked.warnings,
            ...(failedDates.length > 0 ? [`${failedDates.join("、")} 這幾天這次沒有排出來，可以再按一次試試。`] : []),
          ],
        });
      } catch (error) {
        const quotaStatus = quotaStatusOf(error);
        if (quotaStatus) {
          console.error("Itinerary adjustment quota/rate limit hit:", error);
          res.status(quotaStatus).json({ error: "AI 行程調整已達用量上限（HTTP 429），請稍後再試。你目前的行程沒有被更動。", provider: "google", model: attemptedModel, status: quotaStatus });
          return;
        }
        console.error("Itinerary adjustment request failed:", error);
        res.status(502).json({ error: "AI 行程調整服務暫時無法使用。你目前的行程沒有被更動。", provider: "google", model: attemptedModel });
      }
      return;
    }

    // Phase 2 canonical planning input. The legacy ItineraryPlanningAssistant
    // posts no `selections`, so it keeps the original contract below untouched.
    if (Array.isArray(input.selections)) {
      const selections = input.selections as Array<Record<string, unknown>>;
      if (selections.length === 0) { res.status(400).json({ error: "請先選擇要排進行程的收藏靈感。" }); return; }
      const model = "gemini-3-flash-preview";
      // Trip-wide guidance the user typed. Bounded before it reaches the prompt so a
      // pasted wall of text cannot crowd out the trip facts or the selection rules.
      const planningPreferences = typeof input.planningPreferences === "string"
        ? input.planningPreferences.trim().slice(0, 1200)
        : "";
      // The three inputs stay in separate, labelled blocks: trip facts, saved
      // inspiration, and free-text preferences. Preferences steer scheduling only —
      // a place the model adds because of them is still an untagged AI suggestion.
      const preferenceBlock = planningPreferences
        ? `\n\n【3. 使用者的規劃偏好（使用者自己輸入的自由文字）】\n"""\n${planningPreferences}\n"""\n這段文字是高優先度的排程指示，優先於一般預設排法。請照著調整出發時間、每天的行程密度、交通方式與活動類型。\n但它仍必須服從旅程日期、地理位置、已確定的地點識別與合理的作息；不合理或做不到的要求就盡力接近，並在 warnings 說明，不要假裝已經滿足。\n這段文字「不會」賦予任何地點收藏靈感的身分：因為這段話而加入的地點，sourceInspirationIds 一律是空陣列。`
        : "";
      const generationConfig = {
        contents: `為這趟旅程安排一份行程提案。\n\n【1. 旅程事實】\n只能使用 ${input.startDate} 到 ${input.endDate} 之間的日期。目的地：${input.destination || ""}${input.destinationCountry ? `（${input.destinationCountry}）` : ""}。共 ${input.durationDays || "未知"} 天。\n\n【2. 使用者已收藏並挑選的地點與原作者經驗筆記】\n${JSON.stringify(selections)}${preferenceBlock}\n\n規則：\n1. 每個被挑選的地點都要排進去，而且整份提案中只能出現一次。\n2. 回傳 sourceInspirationIds 時，必須原封不動使用上面每個地點提供的 inspirationIds。\n3. 不要捏造 placeId 或座標；已提供的地點識別由系統自行帶入。\n4. 同一天的地點要地理上相鄰，避免跨城市來回移動。\n5. 每天安排合理數量的活動，並留下合理的移動與用餐時間。\n5a. 【時間最重要】同一天的每個項目都必須有各自不同、依序遞增的 suggestedStartTime，格式 HH:mm。絕對不可以讓同一天的多個活動共用同一個開始時間（例如三個活動都寫 09:00），那不是可以照著走的行程。\n5b. 下一個活動的開始時間 = 前一個活動的開始時間 + 該活動的 durationMinutes + 合理的交通時間（市區內通常 15～45 分鐘，距離越遠越久）。活動之間不可以重疊。\n5c. 每個項目都要填 durationMinutes，用該地點實際合理的停留時間（例如市場 60～90 分鐘、海水浴場 90～120 分鐘、寺廟 60～90 分鐘）。\n5d. 如果使用者在規劃偏好說了幾點才出門，當天第一個活動就不能早於那個時間，後面的活動再依序往後排。\n6. 經驗筆記要影響排程。例如筆記說「傍晚去比較漂亮」就盡量排在下午稍晚或傍晚；說「週末人很多」就在還有其他日期可選時避開週末。筆記是偏好，不是硬性規定，除非它明確寫成硬性限制。\n7. 你可以加入少量未被收藏的建議地點來補完一天（包含使用者在規劃偏好裡指名想做的活動），但那些項目的 sourceInspirationIds 必須是空陣列。\n8. note 欄位用繁體中文寫一句簡短理由，說明為什麼排在這個時段。\n只回傳 JSON。`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              days: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    date: { type: Type.STRING },
                    items: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          placeName: { type: Type.STRING },
                          suggestedStartTime: { type: Type.STRING },
                          durationMinutes: { type: Type.NUMBER },
                          note: { type: Type.STRING },
                          sourceInspirationIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                        },
                        required: ["placeName", "sourceInspirationIds"],
                      },
                    },
                  },
                  required: ["date", "items"],
                },
              },
              warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["days"],
          },
        },
      } as const;

      let attemptedModel = model;
      try {
        const ai = new GoogleGenAI({ apiKey });
        // Same reasoning as the adjustment endpoint: four allowances and a
        // retry each, instead of two models and no second chance.
        const response = await withModelFallback(candidate => {
          attemptedModel = candidate;
          return ai.models.generateContent({ model: candidate, ...generationConfig });
        });
        const raw = response.text?.trim();
        if (!raw) { res.json({ days: [], warnings: ["AI 沒有回傳可檢視的行程提案。"] }); return; }
        let data;
        try {
          data = JSON.parse(raw.replace(/```json|```/g, "").trim());
        } catch {
          res.status(502).json({ error: "AI 回傳的行程格式無法解析，請重新產生。", provider: "google", model: attemptedModel });
          return;
        }
        res.json({ days: Array.isArray(data.days) ? data.days : [], warnings: Array.isArray(data.warnings) ? data.warnings : [] });
      } catch (error) {
        const quotaStatus = quotaStatusOf(error);
        if (quotaStatus) {
          // Report the quota failure exactly; never fabricate a local itinerary.
          console.error("Itinerary proposal quota/rate limit hit:", error);
          res.status(quotaStatus).json({ error: "AI 行程提案已達用量上限（HTTP 429），請稍後再試。你的選擇已保留。", provider: "google", model: attemptedModel, status: quotaStatus });
          return;
        }
        console.error("Itinerary proposal request failed:", error);
        res.status(502).json({ error: "AI 行程提案服務暫時無法使用。", provider: "google", model: attemptedModel });
      }
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Create a realistic itinerary proposal only; never claim bookings. Dates ${input.startDate} to ${input.endDate}. Destination: ${input.destination || ''}. Existing itinerary (preserve it): ${JSON.stringify(input.existingItinerary || [])}. Saved travel inspiration with original context: ${JSON.stringify(input.savedInspirations || [])}. Flight anchors: ${JSON.stringify(input.flightAnchors || [])}. Constraints: ${input.constraints || ''}. Return JSON with days [{date,items:[{id,time,title,location,notes,type,date}]}], conflicts [{type,message,existingItemId,proposedItemId}], warnings []. Use only provided facts; unresolved places may remain text.`;
      // The chain, rather than a pair. A catch that only rethrows is two
      // models pretending to be a strategy.
      const response = await withModelFallback(model =>
        ai.models.generateContent({ model, contents: prompt, config: { responseMimeType: "application/json" } }));
      const raw = response.text?.trim();
      if (!raw) { res.json({ days: [], conflicts: [], warnings: ["AI 沒有回傳可檢視的行程提案。"] }); return; }
      const data = JSON.parse(raw.replace(/```json|```/g, '').trim());
      res.json({ days: Array.isArray(data.days) ? data.days : [], conflicts: Array.isArray(data.conflicts) ? data.conflicts : [], warnings: Array.isArray(data.warnings) ? data.warnings : [] });
    } catch { res.status(502).json({ error: "Itinerary planning service unavailable." }); }
  });

  app.get("/api/weather", async (req, res) => {
    const destination = typeof req.query.destination === "string" ? req.query.destination.trim() : "";
    const country = typeof req.query.country === "string" ? req.query.country.trim() : "";
    const latitude = Number(req.query.latitude); const longitude = Number(req.query.longitude);
    const hasCoordinates = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
    if ((!destination && !hasCoordinates) || destination.length > 120) {
      res.status(400).json({ error: "A valid destination is required." });
      return;
    }

    try {
      let weatherLatitude = latitude; let weatherLongitude = longitude;
      if (!hasCoordinates) {
        const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search"); geocodeUrl.searchParams.set("name", destination); geocodeUrl.searchParams.set("count", "1"); geocodeUrl.searchParams.set("language", "en"); geocodeUrl.searchParams.set("format", "json");
        const geocodeResponse = await fetch(geocodeUrl, { signal: AbortSignal.timeout(5_000) }); if (!geocodeResponse.ok) throw new Error("Geocoding failed");
        const geocode = await geocodeResponse.json() as { results?: Array<{ latitude: number; longitude: number }> }; let place = geocode.results?.[0];
        if (!place && country && /korea|韓國|韩国/i.test(country)) { const fallback = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&q=${encodeURIComponent(destination)}`, { headers: { 'User-Agent': 'Trippie/1.0' }, signal: AbortSignal.timeout(5_000) }); const results = await fallback.json() as Array<{ lat?: string; lon?: string }>; const match = results[0]; if (match && Number.isFinite(Number(match.lat)) && Number.isFinite(Number(match.lon))) place = { latitude: Number(match.lat), longitude: Number(match.lon) }; }
        if (!place) { res.status(404).json({ error: "Destination could not be resolved." }); return; }
        weatherLatitude = place.latitude; weatherLongitude = place.longitude;
      }

      const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
      weatherUrl.searchParams.set("latitude", String(weatherLatitude));
      weatherUrl.searchParams.set("longitude", String(weatherLongitude));
      weatherUrl.searchParams.set("current", "temperature_2m,weather_code");
      weatherUrl.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max");
      weatherUrl.searchParams.set("forecast_days", "1");
      weatherUrl.searchParams.set("timezone", "auto");
      const weatherResponse = await fetch(weatherUrl, { signal: AbortSignal.timeout(5_000) });
      if (!weatherResponse.ok) throw new Error("Weather provider failed");
      const weather = await weatherResponse.json() as {
        current?: { temperature_2m?: number; weather_code?: number };
        daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[] };
      };
      const current = weather.current;
      const daily = weather.daily;
      if (typeof current?.temperature_2m !== "number" || typeof current.weather_code !== "number" || typeof daily?.temperature_2m_max?.[0] !== "number" || typeof daily.temperature_2m_min?.[0] !== "number" || typeof daily.precipitation_probability_max?.[0] !== "number") {
        throw new Error("Incomplete weather response");
      }
      const condition = current.weather_code === 0 ? "晴朗" : current.weather_code <= 3 ? "多雲" : current.weather_code <= 48 ? "有霧" : current.weather_code <= 67 ? "有雨" : current.weather_code <= 77 ? "有雪" : current.weather_code <= 82 ? "陣雨" : "雷雨";
      res.json({ temperature: current.temperature_2m, condition, high: daily.temperature_2m_max[0], low: daily.temperature_2m_min[0], precipitationProbability: daily.precipitation_probability_max[0] });
    } catch (error) {
      console.error("Weather request failed:", error);
      res.status(502).json({ error: "Weather provider is unavailable." });
    }
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-trip", (tripId) => {
      socket.join(tripId);
      console.log(`Socket ${socket.id} joined trip ${tripId}`);

      // Send initial state if exists
      if (sharedTrips[tripId]) {
        socket.emit("trip-update", { tripId, state: sharedTrips[tripId] });
      }
    });

    socket.on("update-trip", (data) => {
      const { tripId, state } = data;
      sharedTrips[tripId] = state;
      // Broadcast to others in the room
      socket.to(tripId).emit("trip-update", { tripId, state });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  app.get("/api/destination-image", async (req, res) => {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "Destination image provider is not configured." });
      return;
    }

    const rawQuery = typeof req.query.query === "string" ? req.query.query.trim() : "";
    if (!rawQuery || rawQuery.length > 120) {
      res.status(400).json({ error: "A valid destination query is required." });
      return;
    }

    const searchUrl = new URL("https://api.pexels.com/v1/search");
    searchUrl.searchParams.set("query", rawQuery);
    searchUrl.searchParams.set("orientation", "landscape");
    searchUrl.searchParams.set("size", "large");
    searchUrl.searchParams.set("per_page", "12");

    try {
      const response = await fetch(searchUrl, {
        headers: { Authorization: apiKey },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        res.status(response.status === 429 ? 429 : 502).json({
          error: "Destination image provider request failed.",
        });
        return;
      }

      const payload = (await response.json()) as {
        photos?: Array<{
          id: number;
          width: number;
          height: number;
          url: string;
          photographer: string;
          photographer_url: string;
          alt?: string;
          src?: { landscape?: string; large2x?: string; large?: string };
        }>;
      };
      const personTerms = /\b(person|people|man|woman|boy|girl|couple|portrait|selfie|crowd)\b/i;
      const photo = payload.photos?.find(
        (candidate) =>
          candidate.width >= 1200 &&
          candidate.width > candidate.height &&
          Boolean(candidate.src?.landscape || candidate.src?.large2x || candidate.src?.large) &&
          !personTerms.test(candidate.alt || ""),
      );

      if (!photo) {
        res.status(404).json({ error: "No suitable destination image was found." });
        return;
      }

      res.json({
        provider: "Pexels",
        providerPhotoId: String(photo.id),
        imageUrl: photo.src?.landscape || photo.src?.large2x || photo.src?.large,
        sourceUrl: photo.url,
        photographer: photo.photographer,
        photographerUrl: photo.photographer_url,
        licenseName: "Pexels License",
        licenseUrl: "https://www.pexels.com/license/",
        attributionRequired: true,
        destinationQuery: rawQuery,
      });
    } catch {
      res.status(502).json({ error: "Destination image provider is unavailable." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    // The single-page fallback, as a final middleware rather than app.get("*").
    // Express 5 rejects a bare "*" outright — the process exited on boot, so
    // this branch had never actually run.
    //
    // API paths are excluded on purpose: answering an unknown /api/ route with
    // index.html turns a 404 into a JSON parse error at the other end, which
    // is a much harder thing to read from a phone in another country.
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api/")) { next(); return; }
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
