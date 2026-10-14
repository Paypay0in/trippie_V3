/**
 * @vitest-environment jsdom
 *
 * 「收藏裡也要分區」 — the collection screen listed every saved place in one
 * stream while the planner, reading the same records, grouped them by area.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
