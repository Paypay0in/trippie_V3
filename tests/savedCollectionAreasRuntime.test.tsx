/**
 * @vitest-environment jsdom
 *
 * 「收藏裡也要分區」 — the collection screen listed every saved place in one
 * stream while the planner, reading the same records, grouped them by area.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SavedTravelDestinationDetail from '../components/SavedTravelDestinationDetail';
import { SavedExperienceNote, SavedTravelInspiration } from '../types';

afterEach(cleanup);

const saved = (over: Partial<SavedTravelInspiration>): SavedTravelInspiration => ({
  id: 'i', savedByUserId: 'me', placeName: 'x',
  country: '韓國', city: 'Busan', notes: [],
  sourcePostId: 'p', sourceSliceId: 's', sourceCreatorId: 'c', sourceNoteIds: [],
  savedAt: '2026-10-01T00:00:00.000Z',
  ...over,
} as SavedTravelInspiration);

/** Haeundae and Gwangalli are about six kilometres apart: two outings. */
const HAEUNDAE = { latitude: 35.1587, longitude: 129.1604, district: 'Haeundae' };
const GWANGALLI = { latitude: 35.1532, longitude: 129.1186, district: 'Suyeong-gu' };

const mount = (items: SavedTravelInspiration[], over: Record<string, unknown> = {}) => {
  const props = {
    country: '韓國', city: 'Busan', items, communityPosts: [],
    onBack: vi.fn(), onRemove: vi.fn(), onResolveItem: vi.fn(),
    onOpenCommunityPost: vi.fn(), onCreateTrip: vi.fn(),
    ...over,
  } as unknown as React.ComponentProps<typeof SavedTravelDestinationDetail>;
  render(<SavedTravelDestinationDetail {...props} />);
};

describe('the collection, grouped', () => {
  it('heads each area and counts it', () => {
    mount([
      saved({ id: 'a', placeName: '味贊王鹽烤肉', ...HAEUNDAE }),
      saved({ id: 'b', placeName: 'THRILL ON THE MUG', ...HAEUNDAE }),
      saved({ id: 'c', placeName: 'Dongmyeonsik Milmyeon', ...GWANGALLI }),
    ]);

    expect(screen.getByTestId('saved-area-Haeundae').textContent).toContain('2 個');
    expect(screen.getByTestId('saved-area-Suyeong-gu').textContent).toContain('1 個');
  });

  /** Places with no position get their own heading, not a scattering. */
  it('puts the unplaced ones together at the end', () => {
    mount([
      saved({ id: 'a', placeName: '味贊王鹽烤肉', ...HAEUNDAE }),
      saved({ id: 'b', placeName: 'Working holiday' }),
    ]);

    expect(screen.getByTestId('saved-area-unplaced')).toBeTruthy();
  });

  it('still lists every place exactly once', () => {
    mount([
      saved({ id: 'a', placeName: '味贊王鹽烤肉', ...HAEUNDAE }),
      saved({ id: 'b', placeName: 'Dongmyeonsik Milmyeon', ...GWANGALLI }),
      saved({ id: 'c', placeName: 'Working holiday' }),
    ]);

    ['味贊王鹽烤肉', 'Dongmyeonsik Milmyeon', 'Working holiday']
      .forEach(name => expect(screen.getAllByText(name)).toHaveLength(1));
  });
});

describe('the heading', () => {
  it('reads in the app s language', () => {
    mount([saved({ id: 'a', ...HAEUNDAE })]);

    expect(screen.getByText('韓國・釜山')).toBeTruthy();
    expect(screen.getByText(/建立釜山旅行/)).toBeTruthy();
  });
});

/**
 * 「點下去要有地圖資訊」 — the card carried a 「⋯」 menu and nothing else, so the
 * one thing a saved place is for, going to it, was not on it.
 */
describe('opening a saved place', () => {
  const place = saved({
    id: 'a',
    placeName: '味贊王鹽烤肉',
    placeId: 'ChIJecTzBkWNaDURHnlmBE4_y3A',
    formattedAddress: '46 Haeun-daero 608beon-gil, Haeundae, Busan',
    ...HAEUNDAE,
  });

  it('shows the place sheet, with somewhere to open it', () => {
    mount([place]);

    fireEvent.click(screen.getByTestId('open-place-a'));

    // Two of them for a Korean place: NAVER first, Google beneath it.
    expect(screen.getAllByText(/地圖開啟/).length).toBeGreaterThan(0);
  });

  /*
    The same sheet the itinerary and the planner open — so the Korean provider
    rule, which lives inside it, applies here without being restated.
  */
  it('offers NAVER for a Korean place', () => {
    mount([place]);

    fireEvent.click(screen.getByTestId('open-place-a'));

    expect(screen.getByText(/NAVER/)).toBeTruthy();
  });

  it('shows the address it has', () => {
    mount([place]);

    fireEvent.click(screen.getByTestId('open-place-a'));

    expect(screen.getByText(/Haeun-daero/)).toBeTruthy();
  });
});

/**
 * 「點編輯沒有反應」 — 「編輯收藏內容」 closed the menu and did nothing else. It had
 * the label, the description and the hover state of a working control.
 */
describe('editing what was saved about a place', () => {
  const note = (id: string, text: string): SavedExperienceNote =>
    ({ id, sourceNoteId: id, sourceSliceId: 's', sourcePostId: 'p', sourceCreatorId: 'c', type: 'other', text });

  const withNotes = () => saved({
    id: 'a', placeName: '味贊王鹽烤肉', ...HAEUNDAE,
    notes: [note('n1', '飯點人超多需排号'), note('n2', '推荐菜品：五花肉')],
  });

  const openEditor = () => {
    fireEvent.click(screen.getByLabelText('味贊王鹽烤肉 更多選項'));
    fireEvent.click(screen.getByTestId('edit-notes-a'));
  };

  it('opens with what is already saved', () => {
    mount([withNotes()]);
    openEditor();

    expect((screen.getByTestId('note-input-0') as HTMLTextAreaElement).value).toBe('飯點人超多需排号');
    expect((screen.getByTestId('note-input-1') as HTMLTextAreaElement).value).toBe('推荐菜品：五花肉');
  });

  it('saves an edit', () => {
    const onUpdateNotes = vi.fn();
    mount([withNotes()], { onUpdateNotes });
    openEditor();

    fireEvent.change(screen.getByTestId('note-input-0'), { target: { value: '要排隊，建議早到' } });
    fireEvent.click(screen.getByTestId('save-notes'));

    expect(onUpdateNotes).toHaveBeenCalledWith('a', [
      expect.objectContaining({ text: '要排隊，建議早到' }),
      expect.objectContaining({ text: '推荐菜品：五花肉' }),
    ]);
  });

  /** Clearing a note is how you delete it; an empty bullet is nobody's intent. */
  it('drops a note that was emptied', () => {
    const onUpdateNotes = vi.fn();
    mount([withNotes()], { onUpdateNotes });
    openEditor();

    fireEvent.change(screen.getByTestId('note-input-0'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('save-notes'));

    expect(onUpdateNotes.mock.calls[0][1]).toHaveLength(1);
  });

  it('adds one', () => {
    const onUpdateNotes = vi.fn();
    mount([withNotes()], { onUpdateNotes });
    openEditor();

    fireEvent.click(screen.getByTestId('add-note'));
    fireEvent.change(screen.getByTestId('note-input-2'), { target: { value: '靠窗位子最好' } });
    fireEvent.click(screen.getByTestId('save-notes'));

    expect(onUpdateNotes.mock.calls[0][1]).toHaveLength(3);
  });

  /** A working copy, so 取消 really is a cancel. */
  it('writes nothing when cancelled', () => {
    const onUpdateNotes = vi.fn();
    mount([withNotes()], { onUpdateNotes });
    openEditor();

    fireEvent.change(screen.getByTestId('note-input-0'), { target: { value: '改一半' } });
    fireEvent.click(screen.getByText('取消'));

    expect(onUpdateNotes).not.toHaveBeenCalled();
  });
});

/**
 * 「像這樣的旅行筆記 能請AI整理一些小重點嗎，至少寫是什麼餐廳」.
 *
 * 「什麼餐廳」 is a fact Google holds about that exact place id. Posted at the
 * live route, 大海鮑魚粥 comes back 「韓國餐廳, 4.4 (257), PRICE_LEVEL_MODERATE」.
 *
 * Not generated: a plausible sentence about a restaurant nobody has checked
 * reads exactly like a checked one, which is why `placeBasics` returns only
 * fields Google answered with.
 */
describe('a saved place nobody wrote anything about', () => {
  const BASICS = {
    basics: {
      kind: '韓國餐廳', rating: 4.4, ratingCount: 257,
      priceLevel: 'PRICE_LEVEL_MODERATE', businessStatus: 'OPERATIONAL',
    },
  };

  it('says what kind of place it is', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => BASICS })) as never);
    mount([saved({ id: 'a', placeName: '大海鮑魚粥', placeId: 'p1', notes: [], ...HAEUNDAE })]);

    const line = await screen.findByTestId('basics-a');

    expect(line.textContent).toContain('韓國餐廳');
    expect(line.textContent).toContain('4.4');
    vi.unstubAllGlobals();
  });

  /* A row that already carries what somebody wrote does not need a category. */
  it('says nothing extra where there are already notes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => BASICS })) as never);
    mount([saved({
      id: 'a', placeName: '大海鮑魚粥', placeId: 'p1', ...HAEUNDAE,
      notes: [{ id: 'n', sourceNoteId: 'n', sourceSliceId: 's', sourcePostId: 'p', sourceCreatorId: 'c', type: 'other', text: '鮑魚粥好吃' }],
    })]);

    await screen.findByText('鮑魚粥好吃');

    expect(screen.queryByTestId('basics-a')).toBeNull();
    vi.unstubAllGlobals();
  });

  /*
    Nothing to look up without an id, and nothing to invent either. Asserted
    on the route rather than on fetch itself — this screen also fetches its
    hero image and its thumbnails, so 「fetch was never called」 would be a
    claim about the wrong thing.
  */
  it('asks nothing of the place service without a map identity', () => {
    const fetchSpy = vi.fn(async (url: string) => ({ url, ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchSpy as never);
    mount([saved({ id: 'a', placeName: 'Working holiday', notes: [] })]);

    const calls = fetchSpy.mock.calls.map(call => String(call[0]));
    expect(calls.some(url => url.includes('/api/places/basics'))).toBe(false);
    vi.unstubAllGlobals();
  });
});

/**
 * 「這在釜山 我無法改」.
 *
 * Everything built to repair these records asked 「is anything missing?」, and a
 * record bound to the wrong place is missing nothing — it had an id, an
 * address and a city, all of Vancouver. The search that would have fixed it
 * was hidden on the grounds that it looked complete.
 */
describe('repointing a place that is simply wrong', () => {
  const wrong = () => saved({
    id: 'a',
    placeName: 'Working holiday',
    placeId: 'ChIJ7zvdl4dxhlQRItGrlhpIS6s',
    formattedAddress: '333 Seymour St, Vancouver',
    city: 'Vancouver',
    country: '加拿大',
    latitude: 49.2853846,
    longitude: -123.1124584,
  });

  it('is offered on a record that looks complete', () => {
    mount([wrong()], { onRebindPlace: vi.fn() });

    fireEvent.click(screen.getByLabelText('Working holiday 更多選項'));

    expect(screen.getByTestId('rebind-a')).toBeTruthy();
  });

  it('searches and writes the place that was picked', async () => {
    const onRebindPlace = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('/api/places/details')
        ? { placeId: 'p-busan', location: '포토웨이브', address: '2 Cheongsapo-ro, Haeundae, 부산시', latitude: 35.16, longitude: 129.19, city: '부산시', district: 'Haeundae', country: '南韓' }
        : { suggestions: [{ placeId: 'p-busan', primaryText: '포토웨이브', secondaryText: 'Haeundae, Busan' }] },
    })) as never);

    mount([wrong()], { onRebindPlace });
    fireEvent.click(screen.getByLabelText('Working holiday 更多選項'));
    fireEvent.click(screen.getByTestId('rebind-a'));
    fireEvent.click(screen.getByTestId('rebind-search-a'));

    fireEvent.click(await screen.findByTestId('rebind-pick-p-busan'));

    await waitFor(() => expect(onRebindPlace).toHaveBeenCalled());
    const [id, resolved] = onRebindPlace.mock.calls[0];
    expect(id).toBe('a');
    expect(resolved.city).toBe('부산시');
    expect(resolved.district).toBe('Haeundae');
    vi.unstubAllGlobals();
  });

  /** Offered only when the caller can actually write the result. */
  it('is absent when nothing can receive the change', () => {
    mount([wrong()]);

    fireEvent.click(screen.getByLabelText('Working holiday 更多選項'));

    expect(screen.queryByTestId('rebind-a')).toBeNull();
  });
});
