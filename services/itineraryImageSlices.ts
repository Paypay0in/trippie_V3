import { ItineraryItem, PostSliceType } from '../types';

/**
 * Travel plans arriving as a screenshot.
 *
 * 「這邊加一個可以上傳截圖的區塊。讓他讀取截圖中的旅行資訊，切片之後讓用戶可以加入
 * 行程」. Trips are planned in other people's apps — an Instagram save, a blog
 * post, a friend's list in a chat — and the work of getting them into Trippie
 * is retyping, which is the reason it does not happen.
 *
 * A screenshot is cut into the same slices the community posts already use, so
 * a saved Instagram carousel and a saved post produce the same kind of thing:
 * a named place with the practical notes that came with it.
 *
 * What a screenshot cannot give is identity. A picture of the words 「甘川洞
 * 文化村」 is not a Google place, so nothing here invents a placeId, an address
 * or coordinates — the itinerary resolves those the same way it does for any
 * typed-in place, or leaves the card unlinked and says so.
 */

export const SLICE_TYPES: PostSliceType[] = ['place', 'food', 'hotel', 'activity', 'transport', 'tip'];

export interface ItinerarySliceNote {
  text: string;
}

export interface ItinerarySlice {
  /** Stable within one parse, so selection survives a re-render. */
  id: string;
  type: PostSliceType;
  /** What to show on the card. */
  title: string;
  /** The place as it was written, when the screenshot named one. */
  placeName?: string;
  summary?: string;
  /** Only when the screenshot actually states one. */
  suggestedStartTime?: string;
  durationMinutes?: number;
  notes: ItinerarySliceNote[];
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Turns whatever the model returned into slices that can be shown.
 *
 * A slice with no title is nothing to add, and a type outside the six the app
 * knows has nowhere to render — both are dropped rather than guessed at.
 */
export const normalizeItinerarySlices = (raw: unknown): ItinerarySlice[] => {
  const slices = raw && typeof raw === 'object' && Array.isArray((raw as { slices?: unknown }).slices)
    ? (raw as { slices: unknown[] }).slices
    : [];

  const seen = new Set<string>();

  return slices.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const slice = entry as Record<string, unknown>;
    const title = text(slice.title);
    const type = text(slice.type) as PostSliceType;
    if (!title || !SLICE_TYPES.includes(type)) return [];

    // One screenshot often repeats a place in its caption and its tags.
    const key = `${type}:${title.toLocaleLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);

    const startTime = text(slice.suggestedStartTime);
    const duration = typeof slice.durationMinutes === 'number' && Number.isFinite(slice.durationMinutes) && slice.durationMinutes > 0
      ? Math.min(Math.round(slice.durationMinutes), 24 * 60)
      : undefined;

    return [{
      id: `shot-${index}-${key}`,
      type,
      title,
      placeName: text(slice.placeName) || undefined,
      summary: text(slice.summary) || undefined,
      suggestedStartTime: CLOCK.test(startTime) ? startTime : undefined,
      durationMinutes: duration,
      notes: Array.isArray(slice.notes)
        ? (slice.notes as unknown[])
            .map(note => ({ text: text((note as Record<string, unknown>)?.text) }))
            .filter(note => note.text)
        : [],
    }];
  });
};

/** Which kind of itinerary card a slice becomes. */
const ITEM_TYPE: Record<PostSliceType, ItineraryItem['type']> = {
  place: 'ACTIVITY',
  food: 'FOOD',
  hotel: 'HOTEL',
  activity: 'ACTIVITY',
  transport: 'TRANSPORT',
  tip: 'ACTIVITY',
};

/**
 * A chosen slice, as an itinerary card.
 *
 * Undated unless the traveller picked a day, and untimed unless the screenshot
 * stated a time: a card that lands on an invented hour has to be corrected,
 * which is more work than placing it was.
 *
 * `origin` is deliberately left unset — the two values it has mean Saved
 * Inspiration and AI suggestion, and this is neither. A picture of a place
 * confers no provenance; the traveller picked this card, so it is theirs.
 */
export const sliceToItineraryItem = (
  slice: ItinerarySlice,
  makeId: () => string,
  date?: string,
): ItineraryItem => ({
  id: makeId(),
  type: ITEM_TYPE[slice.type],
  title: slice.title,
  location: slice.placeName || slice.title,
  notes: [slice.summary, ...slice.notes.map(note => `・${note.text}`)].filter(Boolean).join('\n'),
  date,
  time: slice.suggestedStartTime || '',
  ...(slice.durationMinutes ? { durationMinutes: slice.durationMinutes } : {}),
  isCompleted: false,
});
