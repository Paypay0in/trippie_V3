
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Category, PaymentMethod, TaxRule, VisaInfo, Expense, Trip, TravelBook, ItineraryItem, PublicTrip } from '../types';

const cleanJsonString = (str: string) => {
    // Remove markdown code blocks if present
    let cleaned = str.replace(/```json/g, '').replace(/```/g, '');
    return cleaned.trim();
};

const getAiModel = () => {
    // Safe access to environment variables
    let apiKey = '';
    
    // 1. Try Vite's import.meta.env (standard for Vite)
    try {
        apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    } catch (e) {}

    // 2. Try process.env (often defined via Vite's 'define' config)
    if (!apiKey || apiKey === 'undefined') {
        try {
            apiKey = (process.env as any).GEMINI_API_KEY || (process.env as any).API_KEY;
        } catch (e) {}
    }

    if (!apiKey || apiKey === 'undefined' || apiKey === 'null') {
        console.error("Gemini API Key is missing. Please set VITE_GEMINI_API_KEY in your deployment environment.");
        return null;
    }
    
    return new GoogleGenAI({ apiKey });
};

// Retry helper for API calls
const callWithRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    // Check for rate limit (429) or Service Unavailable (503)
    const shouldRetry = 
        error?.status === 429 || 
        error?.code === 429 || 
        error?.status === 'RESOURCE_EXHAUSTED' ||
        error?.message?.includes('429') ||
        error?.message?.includes('Quota') ||
        error?.status === 503;

    if (retries > 0 && shouldRetry) {
      console.warn(`Gemini API busy (Retrying in ${delay}ms):`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

export const parseExpenseWithGemini = async (text: string): Promise<{
  description?: string;
  amount?: number;
  currency?: string;
  category?: string;
  paymentMethod?: string;
} | null> => {
  const ai = getAiModel();
  if (!ai) {
    console.warn("API Key missing");
    return null;
  }

  try {
    const prompt = `
      Extract expense details from this text: "${text}".
      Identify the description, amount, currency code (ISO 4217), and fit it into one of these categories:
      ${Object.values(Category).join(', ')}.
      
      Important Category Rules:
      - If the text mentions "幫買", "代買", "幫朋友", "代購" (help buy/buying for friend), set category to '${Category.HELP_BUY}'.
      - If the text mentions "回國", "回家", "機場捷運", "高鐵", "統聯" (return transport), set category to '${Category.TRANSPORT_POST}'.

      Also identify the payment method.
      - If it is credit card, map to '${PaymentMethod.CREDIT_CARD}'.
      - If it is TWD cash (台幣現金) or implied domestic cash, map to '${PaymentMethod.CASH_TWD}'.
      - If it is foreign cash (外幣現金), map to '${PaymentMethod.CASH_FOREIGN}'.
      - If it is IC card/Suica/EasyCard, map to '${PaymentMethod.IC_CARD}'.
      
      If unknown cash type, just return '${PaymentMethod.CASH_FOREIGN}' if currency is not TWD, otherwise '${PaymentMethod.CASH_TWD}'.

      If the currency is not specified but implied (e.g. "yen"), use the code (JPY). Default to TWD if unknown.
      If category is unclear, use "其他".
    `;

    const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
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

    if (response.text) {
        return JSON.parse(cleanJsonString(response.text));
    }
    return null;

  } catch (error) {
    console.error("Gemini parse error:", error);
    return null;
  }
};

export const parseImageExpenseWithGemini = async (base64Data: string, mimeType: string): Promise<{
  description?: string;
  amount?: number;
  currency?: string;
  category?: string;
  date?: string;
  paymentMethod?: string;
  country?: string;
  isUncertain?: boolean;
  travelStartDate?: string;
  travelEndDate?: string;
} | null> => {
  const ai = getAiModel();
  if (!ai) {
    console.warn("API Key missing");
    return null;
  }

  try {
    const prompt = `
      Analyze this image (receipt, flight ticket, hotel booking, or screen capture).
      
      Extract the following details:
      1. Merchant Name or Short Description.
      2. Total Amount (Final total).
      3. Currency Code (ISO 4217).
      4. Category: Choose strictly from: ${Object.values(Category).join(', ')}.
      5. Payment Method: Infer Credit Card, Cash, or IC Card.
      6. Country: Infer the country in Traditional Chinese.

      CRITICAL DATE PARSING:
      - "date": The specific date when the TRANSACTION/PAYMENT happened (or the invoice date). This is for the ledger.
      - "travelStartDate" & "travelEndDate": IF this is a FLIGHT ticket or HOTEL booking, extract the actual TRAVEL dates.
        - For flights: Start = Departure Date, End = Return Date (or Arrival Date if one-way).
        - For hotels: Start = Check-in, End = Check-out.
        - For normal receipts (food, shopping), these fields should be null.
      
      Format all dates as YYYY-MM-DD.

      Flag 'isUncertain' as true if the image is blurry or key info is ambiguous.
      Return JSON.
    `;

    const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: prompt }
        ]
      },
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

    if (response.text) {
        return JSON.parse(cleanJsonString(response.text));
    }
    return null;

  } catch (error) {
    console.error("Gemini image parse error:", error);
    return null;
  }
};

export const fetchTaxRefundRules = async (countryName: string): Promise<TaxRule | null> => {
  const ai = getAiModel();
  if (!ai || !countryName) {
    return null;
  }

  try {
    const prompt = `
      What are the current tourist tax refund (VAT refund) rules for "${countryName}"?
      Provide the minimum spend amount required in a single receipt (in the local currency) to be eligible for a refund, and the approximate refund percentage rate.
      Also identify the local currency code (e.g., JPY, EUR, KRW).
      
      Crucial Rule:
      - If the country does NOT have a tourist tax refund system (e.g., Hong Kong, USA, Macau), or if it's a tax-free region, set 'minSpend' to 0 and 'refundRate' to 0.

      Return JSON.
    `;

    const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            country: { type: Type.STRING, description: "Name of the country identified" },
            currency: { type: Type.STRING, description: "Currency code (ISO 4217)" },
            minSpend: { type: Type.NUMBER, description: "Minimum spend amount in local currency" },
            refundRate: { type: Type.NUMBER, description: "Refund rate as a decimal (e.g., 0.10 for 10%)" },
            notes: { type: Type.STRING, description: "Short summary of the rule (max 10 words)" },
          },
          required: ["country", "currency", "minSpend", "refundRate"],
        },
      },
    }));

    if (response.text) {
        const rule = JSON.parse(cleanJsonString(response.text)) as TaxRule;
        return {
            ...rule,
            currency: rule.currency.toUpperCase() // Normalize currency to uppercase
        };
    }
    return null;
  } catch (error) {
    console.error("Gemini tax fetch error:", error);
    return null;
  }
};

// NEW: Fetch Visa and Entry Info
export const fetchVisaAndEntryInfo = async (destination: string, origin: string): Promise<VisaInfo | null> => {
  const ai = getAiModel();
  if (!ai || !destination || !origin) return null;

  try {
    const prompt = `
      I am a citizen from "${origin}" traveling to "${destination}".
      I need to know the entry requirements.
      
      1. Visa Requirement: Is it Visa-Free, E-Visa/ETA required (like ESTA, K-ETA, NZeTA), or Visa Required?
      2. Visa Name: e.g. "ESTA", "K-ETA", "落地簽 (Visa on Arrival)".
      3. Visa Application Link: Official website URL for application if applicable.
      4. Online Entry Form: Is there a mandatory online arrival card/health declaration? (e.g. Visit Japan Web, SG Arrival Card). Provide the name and official link.
      5. Estimated Fee: The cost of the visa/ETA. If free, 0.
      6. Currency of Fee: ISO code.

      Provide links to OFFICIAL government websites where possible.
      Return JSON.
    `;

    const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            destination: { type: Type.STRING },
            origin: { type: Type.STRING },
            requirement: { type: Type.STRING, enum: ['VISA_FREE', 'E_VISA', 'VISA_REQUIRED', 'UNKNOWN'] },
            visaName: { type: Type.STRING, description: "Name of visa or 'Visa Free'" },
            visaLink: { type: Type.STRING, description: "URL for visa application" },
            entryFormName: { type: Type.STRING, description: "Name of digital arrival card" },
            entryFormLink: { type: Type.STRING, description: "URL for digital arrival card" },
            feeAmount: { type: Type.NUMBER, description: "Cost of visa" },
            feeCurrency: { type: Type.STRING, description: "Currency of visa fee" },
            notes: { type: Type.STRING, description: "Short advice (max 15 words)" },
          },
          required: ["requirement", "feeAmount", "feeCurrency"],
        },
      },
    }));

    if (response.text) {
        return JSON.parse(cleanJsonString(response.text)) as VisaInfo;
    }
    return null;
  } catch (error) {
    console.error("Gemini visa fetch error:", error);
    return null;
  }
};

export const generateTravelBook = async (trip: Trip): Promise<TravelBook | null> => {
    const ai = getAiModel();
    if (!ai) return null;

    try {
        const expensesSummary = trip.expenses.map(e => `${e.date}: ${e.description} (${e.category})`).join('\n');
        const prompt = `
            Based on these trip expenses, generate a beautiful "Travel Book" summary in Traditional Chinese.
            1. Summary: A 2-sentence emotional summary of the trip.
            2. Trajectory: A list of 5-8 key location highlights or activities.
            3. AI Narrative: A poetic narrative of the journey (approx 150 words).
            
            Trip Name: ${trip.name}
            Expenses:
            ${expensesSummary}
            
            Return JSON.
        `;

        const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        summary: { type: Type.STRING },
                        trajectory: { type: Type.ARRAY, items: { type: Type.STRING } },
                        aiNarrative: { type: Type.STRING }
                    },
                    required: ["summary", "trajectory", "aiNarrative"]
                }
            }
        }));

        if (response.text) {
            const data = JSON.parse(cleanJsonString(response.text));
            return {
                tripId: trip.id,
                ...data
            };
        }
        return null;
    } catch (error) {
        console.error("Gemini travel book error:", error);
        return null;
    }
};

export const extractItineraryFromExpenses = async (expenses: Expense[]): Promise<ItineraryItem[]> => {
    const ai = getAiModel();
    if (!ai || expenses.length === 0) return [];

    try {
        const expensesData = expenses.map(e => ({
            id: e.id,
            desc: e.description,
            date: e.date,
            cat: e.category
        }));

        const prompt = `
            Analyze these expenses and extract a structured itinerary (calendar).
            Focus on Flights, Hotels, and major Activities.
            Assign a specific time if possible, otherwise use "09:00", "14:00", etc.
            
            Expenses:
            ${JSON.stringify(expensesData)}
            
            Return JSON as an array of ItineraryItems.
        `;

        const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING },
                            time: { type: Type.STRING, description: "HH:MM format" },
                            title: { type: Type.STRING },
                            location: { type: Type.STRING },
                            notes: { type: Type.STRING },
                            type: { type: Type.STRING, enum: ['FLIGHT', 'HOTEL', 'ACTIVITY', 'FOOD', 'TRANSPORT'] },
                            linkedExpenseId: { type: Type.STRING }
                        },
                        required: ["time", "title", "type"]
                    }
                }
            }
        }));

        if (response.text) {
            return JSON.parse(cleanJsonString(response.text));
        }
        return [];
    } catch (error) {
        console.error("Gemini itinerary extraction error:", error);
        return [];
    }
};

export const recommendTrips = async (nextTripDescription: string, publicTrips: PublicTrip[]): Promise<PublicTrip[]> => {
    const ai = getAiModel();
    if (!ai || !nextTripDescription) return [];

    try {
        const tripsMeta = publicTrips.map(t => ({ id: t.id, name: t.name, tags: t.tags }));
        const prompt = `
            The user is planning a trip: "${nextTripDescription}".
            Recommend the top 3 most relevant trips from this public list:
            ${JSON.stringify(tripsMeta)}
            
            Return only the IDs of the recommended trips as a JSON array.
        `;

        const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        }));

        if (response.text) {
            const recommendedIds = JSON.parse(cleanJsonString(response.text));
            return publicTrips.filter(t => recommendedIds.includes(t.id));
        }
        return [];
    } catch (error) {
        console.error("Gemini recommendation error:", error);
        return [];
    }
};

export const fetchShoppingSuggestions = async (tripDescription: string): Promise<{suggestions: Array<{item: string, reason: string}>, country: string}> => {
    const ai = getAiModel();
    if (!ai || !tripDescription) return { suggestions: [], country: '' };

    try {
        const prompt = `
            Based on the user's trip description: "${tripDescription}", 
            1. Identify the main destination country (in Traditional Chinese, e.g. 日本, 冰島, 法國). If multiple or unclear, pick the primary one or leave empty.
            2. Suggest 4 to 6 essential items they should buy BEFORE the trip (Pre-trip shopping).
            
            Focus on practical necessities like specific clothing (e.g., thermal wear, snow boots), gadgets (adapters, power banks), or medical items.
            Do NOT suggest generic items like "Passport" or "Money" unless there's a specific reason.
            
            IMPORTANT: Return the "item" name and the "reason" in Traditional Chinese (繁體中文).
            
            Return JSON.
        `;

        const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        country: { type: Type.STRING, description: "Identified destination country (Traditional Chinese)" },
                        suggestions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    item: { type: Type.STRING, description: "Name of the item to buy (Traditional Chinese)" },
                                    reason: { type: Type.STRING, description: "Why is this needed? (Max 10 words, Traditional Chinese)" }
                                },
                                required: ["item", "reason"]
                            }
                        }
                    },
                    required: ["suggestions"]
                }
            }
        }));

        if (response.text) {
            const data = JSON.parse(cleanJsonString(response.text));
            return {
                suggestions: data.suggestions || [],
                country: data.country || ''
            };
        }
        return { suggestions: [], country: '' };
    } catch (error) {
        console.error("Gemini shopping suggestion error:", error);
        return { suggestions: [], country: '' };
    }
};

export const findCheapestTimes = async (location: string, publicTrips: PublicTrip[]): Promise<string> => {
    const ai = getAiModel();
    if (!ai || !location) return "";

    try {
        const relevantTrips = publicTrips.filter(t => t.expenses.some(e => e.description.includes(location)));
        const data = relevantTrips.map(t => t.expenses.filter(e => e.description.includes(location)).map(e => ({ date: e.date, amount: e.amount, currency: e.currency })));
        
        const prompt = `
            Analyze these shared expenses for "${location}" and identify the cheapest times to visit (e.g., lunch vs dinner, or specific months).
            Data: ${JSON.stringify(data)}
            
            Provide a short summary in Traditional Chinese.
        `;

        const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        }));

        return response.text || "";
    } catch (error) {
        console.error("Gemini cheapest times error:", error);
        return "";
    }
};

export const fetchCurrentExchangeRate = async (fromCurrency: string, toCurrency: string = 'TWD'): Promise<number | null> => {
    const ai = getAiModel();
    if (!ai || !fromCurrency || fromCurrency === toCurrency) return null;

    try {
        const prompt = `What is the current exchange rate from ${fromCurrency} to ${toCurrency}? Provide only the numerical rate.`;
        
        const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }]
            }
        }));

        if (response.text) {
            // Extract number from text (e.g., "0.22" or "The rate is 0.22")
            const match = response.text.match(/(\d+(\.\d+)?)/);
            if (match) {
                return parseFloat(match[0]);
            }
        }
        return null;
    } catch (error) {
        console.error("Gemini exchange rate fetch error:", error);
        return null;
    }
};
