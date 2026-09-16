
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer, loadEnv } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import { registerPlaceCommerceRoute } from "./services/placeCommerceLookup";

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

  const PORT = 3000;

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

  app.use(express.json({ limit: "16kb" }));

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
      const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY, "X-Goog-FieldMask": "id,displayName,formattedAddress,addressComponents,location" }, signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error("Place details failed");
      const data = await response.json() as { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number }; addressComponents?: Array<{ longText?: string; types?: string[] }> };
      if (!data.displayName?.text || typeof data.location?.latitude !== "number" || typeof data.location.longitude !== "number") throw new Error("Incomplete place details");
      res.json({ placeId: data.id || placeId, location: data.displayName.text, address: data.formattedAddress, latitude: data.location.latitude, longitude: data.location.longitude, country: data.addressComponents?.find(c => c.types?.includes("country"))?.longText });
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
        contents: `研究目前旅遊規定：目的地 ${destination}；旅程日期 ${startDate || "未知"} 至 ${endDate || "未知"}；使用護照國籍 countryCode ${passportCountryCode || "未知"}；居住地 ${residenceCountryCode || "未知"}。請只依可追溯的官方移民、海關、稅務、官方旅遊或機場來源整理入境/簽證與購物退稅。護照國籍不等於居住地。每個入境 actionable item 必須有且只有一個 actionType：visa_or_eta、passport_validity、health_declaration、customs_declaration、arrival_form、required_documents、onward_travel 或 other。相同 actionType 只產生一個 canonical action。若退稅規則有官方且可計算的數值，除 user-facing guidance 外回傳 taxRefund.numericRule，且只使用 thresholdScope per_transaction；提供 currency、minSpend 與 refundMethod { type: rate, rate }，無法安全計算時使用 refundMethod { type: not_calculable }。不要自行決定 numericCalculationAvailable。model_knowledge fallback 可提供 guidance，但不得提供可信 numericRule。每個 grounded source URL 必須來自 Google Search grounding 結果，不可捏造。`,
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
        response = await generatePreparation(true, "gemini-3-flash-preview");
      } catch (groundedError) {
        console.warn("Grounded preparation lookup failed; retrying without search.", groundedError);
        grounded = false;
        try {
          response = await generatePreparation(false, "gemini-3-flash-preview");
        } catch (primaryError) {
          console.warn("Primary preparation model failed; using fallback model.", primaryError);
          response = await generatePreparation(false, "gemini-3.6-flash");
        }
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
    if (input.adjustmentMode === "add" || input.adjustmentMode === "reorder" || input.adjustmentMode === "replan") {
      const mode = input.adjustmentMode as "add" | "reorder" | "replan";
      const existingItinerary = Array.isArray(input.existingItinerary) ? input.existingItinerary : [];
      if (existingItinerary.length === 0) { res.status(400).json({ error: "目前沒有可調整的正式行程。" }); return; }
      const selections = Array.isArray(input.selections) ? input.selections : [];
      const model = "gemini-3-flash-preview";
      const fallbackModel = "gemini-3.6-flash";
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

      const generationConfig = {
        contents: `使用者這趟旅程「已經有正式行程」了。請先讀懂目前的安排，再提出調整建議。不要當成空白行程重排。

【1. 旅程事實】
只能使用 ${input.startDate} 到 ${input.endDate} 之間的日期。目的地：${input.destination || ""}${input.destinationCountry ? `（${input.destinationCountry}）` : ""}。共 ${input.durationDays || "未知"} 天。

【2. 目前的正式行程（這是事實，不是建議）】
${JSON.stringify(existingItinerary)}
每個項目的 id 是穩定識別碼。要更動既有項目時，existingItemId 必須原封不動使用這裡的 id。
locked 為 true 的項目（航班錨點、已連結支出、固定行程）完全不能被 move、update 或 remove。
fixedEvent 為 true 的項目是硬性時間限制（航班、火車、訂位、已購票活動）：其他行程必須繞開它，絕對不要在它的時段安排觀光，也不要提議更改它的時間。
isPinned 為 true 的項目是使用者親手固定的錨點，在所有模式（補充行程、重新安排路線、重新規劃）都是硬性限制：不可以移動它、不可以刪除它、不可以更改它的時間、不可以更改它的地點。請把它當成固定錨點，安排周邊的其他行程來配合它。

【3. 系統對目前行程的分析】
${JSON.stringify(input.analysis || {})}
emptyDates 是完全沒有安排的日子；crowdedDates 是已經太滿的日子；untimedItemIds 是沒有時間的項目；tightTransitions 是前後太趕的銜接；longHops 是同一天相隔太遠的移動；unusedInspirationIds 是使用者收藏了但還沒排進行程的地點。

【3b. 使用者已收藏並挑選、可供參考的地點】
${JSON.stringify(selections)}${preferenceBlock}

【5. 模式規則（最重要）】
${MODE_RULES[mode]}

回傳規則：
1. 只回傳「變更」，不要回傳整份重排後的行程。沒有要動的項目就不要出現在 changes 裡。
2. move / update / remove 必須帶 existingItemId，而且只能用【2】裡出現過的 id。絕對不要用地點名稱指認項目。
3. 不要重複建議目前行程已經有的地點。
4. add 的項目若來自【3b】的收藏地點，sourceInspirationIds 必須原封不動使用該地點的 inspirationIds；否則一律是空陣列。
5. 不要捏造 placeId 或座標；地點識別由系統自行帶入。
6. 每一筆變更都要在 reason 用繁體中文寫一句簡短理由。
7. summary 用繁體中文寫一兩句話，說明這次調整的整體想法。
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
                  required: ["type"],
                },
              },
              warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["changes"],
          },
        },
      } as const;

      let attemptedModel = model;
      try {
        const ai = new GoogleGenAI({ apiKey });
        let response;
        try {
          response = await ai.models.generateContent({ model, ...generationConfig });
        } catch (primaryError) {
          if (quotaStatusOf(primaryError)) throw primaryError;
          console.warn("Primary itinerary adjustment model failed; using fallback model.", primaryError);
          attemptedModel = fallbackModel;
          response = await ai.models.generateContent({ model: fallbackModel, ...generationConfig });
        }
        const raw = response.text?.trim();
        if (!raw) { res.json({ changes: [], warnings: ["AI 沒有回傳可檢視的調整建議。"] }); return; }
        let data;
        try {
          data = JSON.parse(raw.replace(/```json|```/g, "").trim());
        } catch {
          res.status(502).json({ error: "AI 回傳的調整格式無法解析，請重新產生。", provider: "google", model: attemptedModel });
          return;
        }
        res.json({
          summary: typeof data.summary === "string" ? data.summary : "",
          changes: Array.isArray(data.changes) ? data.changes : [],
          warnings: Array.isArray(data.warnings) ? data.warnings : [],
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
      const fallbackModel = "gemini-3.6-flash";
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
        let response;
        try {
          response = await ai.models.generateContent({ model, ...generationConfig });
        } catch (primaryError) {
          if (quotaStatusOf(primaryError)) throw primaryError;
          console.warn("Primary itinerary proposal model failed; using fallback model.", primaryError);
          attemptedModel = fallbackModel;
          response = await ai.models.generateContent({ model: fallbackModel, ...generationConfig });
        }
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
      let response;
      try {
        response = await ai.models.generateContent({ model: "gemini-3-flash-preview", contents: prompt, config: { responseMimeType: "application/json" } });
      } catch (primaryError) {
        try {
          response = await ai.models.generateContent({ model: "gemini-3.6-flash", contents: prompt, config: { responseMimeType: "application/json" } });
        } catch (fallbackError) {
          throw fallbackError;
        }
      }
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
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
