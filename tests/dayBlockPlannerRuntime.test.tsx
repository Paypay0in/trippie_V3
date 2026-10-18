/**
 * @vitest-environment jsdom
 *
 * 「可以接畫面 因為我們根本無法用行程表的這個功能」.
 *
 * The day is built by filling blocks rather than by placing times. Nothing new
 * is stored: a filled block *is* an itinerary item, and an empty one is a shape
 * that has not been filled yet — a second store of 「the day's blocks」 would be
 * a second answer to 「what is at 14:00」.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DayBlockPlanner from '../components/DayBlockPlanner';
import { buildTripAreas } from '../services/tripAreas';
import { ItineraryItem } from '../types';
import type { FixedScheduleEntry } from '../services/itineraryDayFloor';

const nearbyFound = vi.fn(async () => [] as Array<Record<string, unknown>>);
vi.mock('../services/nearbyRestaurantsService', () => ({
  fetchNearbyRestaurants: (...args: unknown[]) => nearbyFound(...(args as [])),
}));

afterEach(cleanup);

const DAY = '2026-10-06';

const item = (id: string, location: string, time: string, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id, title: location, location, notes: '', type: 'ACTIVITY', date: DAY, time,
  durationMinutes: 120, ...over,
} as ItineraryItem);

const gwangalli = [
  item('it-nasari', 'Nasari Sigdang', '10:00', {
    latitude: 35.1535, longitude: 129.1190, address: 'Suyeong-gu, Gwangan-ro 61beon-gil, Busan',
  }),
];

const places = [
  { id: 'g-working', placeName: 'Working holiday', areaLabel: 'Suyeong-gu', areaColorIndex: 0 },
  { id: 'g-diart', placeName: 'DIART coffee', areaLabel: 'Haeundae', areaColorIndex: 1 },
  { id: 'g-done', placeName: '海雲台傳統市場', areaLabel: 'Haeundae', areaColorIndex: 1, alreadyPlanned: true },
];

const renderPlanner = (over: Record<string, unknown> = {}) => {
  const onFillBlock = vi.fn();
  const onChangeDuration = vi.fn();
  render(
    <DayBlockPlanner
      date={DAY}
      items={gwangalli}
      places={places}
      areas={buildTripAreas({ itinerary: gwangalli })}
      onFillBlock={onFillBlock}
      onChangeDuration={onChangeDuration}
      {...over}
    />,
  );
  return { onFillBlock, onChangeDuration };
};

describe('the day as blocks', () => {
  it('shows the day in two-hour blocks from the first item', () => {
    renderPlanner();

    expect(screen.getByTestId('day-block-0').textContent).toContain('10:00–12:00');
    expect(screen.getByTestId('day-block-1').textContent).toContain('12:00–14:00');
  });

  it('names the midday block 午餐', () => {
    renderPlanner();

    expect(screen.getByTestId('day-block-1').textContent).toContain('午餐');
  });

  it('shows what is already in a block instead of a dropdown', () => {
    renderPlanner();

    expect(screen.getByTestId('day-block-0').textContent).toContain('Nasari Sigdang');
    expect(screen.queryByTestId('fill-block-0')).toBeNull();
  });

  /*
    「這個下拉式選單是不足夠的 應該要 pop up 一個視窗讓用戶滑看筆記跟圖片才會知道」 —
    so the block opens a sheet, and the choosing happens there.
  */
  it('offers the saved places in an empty block', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await user.click(screen.getByTestId('fill-block-1'));

    expect(screen.getByTestId('pick-place-g-working')).toBeTruthy();
  });

  it('puts the places in today’s area first', async () => {
    // The point of the picker is a day that stays in one place, so the places
    // that would do that are the ones to reach first.
    const user = userEvent.setup();
    renderPlanner();

    await user.click(screen.getByTestId('fill-block-1'));

    const names = Array.from(document.querySelectorAll('[data-testid^="pick-place-"]'))
      .map(node => node.getAttribute('data-testid'));
    expect(names[0]).toBe('pick-place-g-working');
  });

  it('greys out a place already on the plan', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await user.click(screen.getByTestId('fill-block-1'));

    expect((screen.getByTestId('pick-place-g-done') as HTMLButtonElement).disabled).toBe(true);
  });

  it('fills a block with the block’s own time and length', async () => {
    const user = userEvent.setup();
    const { onFillBlock } = renderPlanner();

    await user.click(screen.getByTestId('fill-block-1'));
    await user.click(screen.getByTestId('pick-place-g-working'));

    expect(onFillBlock).toHaveBeenCalledWith(
      expect.objectContaining({ startTime: '12:00', durationMinutes: 120 }),
      'g-working',
    );
  });

  /* The reason a place was saved, which a name cannot carry. */
  it('shows the notes and the photo kept with a place', async () => {
    const user = userEvent.setup();
    renderPlanner({
      places: [{
        ...places[0],
        notes: ['靠窗位子最好', '週末人很多'],
        photoUrl: 'https://example.com/working.jpg',
      }],
    });

    await user.click(screen.getByTestId('fill-block-1'));

    expect(screen.getByText('靠窗位子最好')).toBeTruthy();
    expect(document.querySelector('img[src="https://example.com/working.jpg"]')).toBeTruthy();
  });

  /* Fifty saved places is a list nobody reads to the end of. */
  it('can be searched by name or by what the note says', async () => {
    const user = userEvent.setup();
    renderPlanner({ places: [{ ...places[0], notes: ['靠窗位子最好'] }, places[1]] });

    await user.click(screen.getByTestId('fill-block-1'));
    await user.type(screen.getByTestId('place-picker-search'), '靠窗');

    expect(screen.getByTestId('pick-place-g-working')).toBeTruthy();
    expect(screen.queryByTestId('pick-place-g-diart')).toBeNull();
  });
});

describe('a block’s length', () => {
  it('can be changed on a placed item', async () => {
    const user = userEvent.setup();
    const { onChangeDuration } = renderPlanner();

    await user.selectOptions(screen.getByTestId('block-duration-0'), '180');

    expect(onChangeDuration).toHaveBeenCalledWith('it-nasari', 180);
  });

  it('moves every later block with it', () => {
    // 「後來的行程就都要自動提前或順延」.
    renderPlanner({ items: [item('it-nasari', 'Nasari Sigdang', '10:00', { durationMinutes: 180 })] });

    expect(screen.getByTestId('day-block-1').textContent).toContain('13:00–15:00');
  });

  it('is never offered on a flight', () => {
    // 「航班時間是固定的行程」, and a length control on one invites breaking the
    // thing the day is built around.
    renderPlanner({
      items: [item('it-flight', '航班起飛', '10:00')],
      isFixed: () => true,
    });

    expect(screen.queryByTestId('block-duration-0')).toBeNull();
    expect(screen.getByTestId('day-block-0').textContent).toContain('固定');
  });
});

describe('what the day adds up to', () => {
  it('says which areas it touches', () => {
    renderPlanner();

    expect(screen.getByTestId('day-area-spread').textContent).toContain('Suyeong-gu');
  });

  it('says nothing about a day with no flights left to plan around', () => {
    renderPlanner({
      items: [],
      fixedSchedule: [{ date: DAY, time: '20:00', durationMinutes: 60, label: '航班抵達', role: 'landing' }],
    });

    expect(screen.queryByTestId('day-block-0')).toBeNull();
    expect(screen.getByText(/航班佔掉了/)).toBeTruthy();
  });
});

/**
 * 「這個表 不是刪掉行程就會消失 要固定存在 欄位可以寫『無』」.
 *
 * The table used to start at the first item's time, so a day whose first stop
 * was at 17:00 had no morning at all — and deleting that stop took its block
 * away with it. The table is the day; the items are only what is in it.
 */
describe('the table itself', () => {
  const evening = [item('it-cheongsapo', 'Cheongsapo', '17:00', {
    latitude: 35.1607, longitude: 129.1919, address: '12 Cheongsapo-ro, Haeundae, Busan',
  })];

  it('covers the whole day even when the only stop is in the evening', () => {
    renderPlanner({ items: evening });

    expect(screen.getByTestId('day-block-0').textContent).toContain('10:00–12:00');
  });

  it('puts that stop in a block of its own, at its own time', () => {
    // 「這裡的時間線 跟行程表的不一樣」: the block reports the itinerary rather
    // than a position arrived at by stacking lengths, so it says 17:00 — and
    // the free time before it is a block of its own, not a block it sits in.
    renderPlanner({ items: evening });

    const block = screen.getByText('Cheongsapo').closest('[data-testid^="day-block-"]');

    expect(block?.textContent).toContain('17:00–19:00');
  });

  it('still shows every block when the day is empty', () => {
    renderPlanner({ items: [], areas: undefined });

    expect(screen.getByTestId('day-block-0')).toBeTruthy();
    expect(screen.getByTestId('day-block-4')).toBeTruthy();
  });

  it('writes 無 in a block with nothing in it', () => {
    renderPlanner({ items: evening });

    expect(screen.getByTestId('day-block-0').textContent).toContain('無');
  });

  it('never leaves an early stop outside the grid', () => {
    // An 08:00 item on a day that opens at 10:00 would otherwise have no block
    // to sit in, and would read as though it had been deleted.
    renderPlanner({ items: [item('it-early', '早市', '08:00')] });

    expect(screen.getByTestId('day-block-0').textContent).toContain('早市');
    expect(screen.getByTestId('day-block-0').textContent).toContain('08:00–10:00');
  });
});

/**
 * 「下拉式選單要讓用戶也可以手動新增」.
 *
 * The picker offered the collection and nothing else, so a slot could only be
 * filled by somebody who had already saved the place — and a traveller
 * planning a morning around a shop a friend just mentioned had to leave the
 * screen, save it, and come back.
 */
describe('typing a place into a slot', () => {
  const emptySlot = () => screen.getAllByTestId(/^fill-block-/)[0];
  const indexOf = (element: HTMLElement) =>
    element.getAttribute('data-testid')!.replace('fill-block-', '');
  /** The way in is the picker now; 自己輸入 sits at the bottom of it. */
  const openManual = async (user: ReturnType<typeof userEvent.setup>) => {
    const index = indexOf(emptySlot());
    await user.click(emptySlot());
    await user.click(screen.getByTestId('place-picker-manual'));
    return index;
  };

  it('offers 自己輸入 at the bottom of the picker', async () => {
    const user = userEvent.setup();
    renderPlanner({ onFillBlockManually: vi.fn() });

    await user.click(emptySlot());

    expect(screen.getByTestId('place-picker-manual')).toBeTruthy();
  });

  /** Nothing to type into when the screen above has no way to save it. */
  it('does not offer it when the caller cannot accept one', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await user.click(emptySlot());

    expect(screen.queryByTestId('place-picker-manual')).toBeNull();
  });

  it('hands the typed name back, trimmed', async () => {
    const onFillBlockManually = vi.fn();
    renderPlanner({ onFillBlockManually });
    const user = userEvent.setup();

    const index = await openManual(user);
    await user.type(screen.getByTestId(`manual-block-input-${index}`), '  Cafe Onion  ');
    await user.click(screen.getByTestId(`manual-block-save-${index}`));

    expect(onFillBlockManually).toHaveBeenCalledWith(
      expect.objectContaining({ index: Number(index) }),
      'Cafe Onion',
    );
  });

  /**
   * A slot the traveller opened and thought better of is not an entry called
   * 「 」 — the empty slot already says 無, which is an answer.
   */
  it('will not add a blank', async () => {
    const onFillBlockManually = vi.fn();
    renderPlanner({ onFillBlockManually });
    const user = userEvent.setup();

    const index = await openManual(user);
    await user.type(screen.getByTestId(`manual-block-input-${index}`), '   ');

    const save = screen.getByTestId(`manual-block-save-${index}`);
    expect(save.hasAttribute('disabled')).toBe(true);
    await user.click(save);
    expect(onFillBlockManually).not.toHaveBeenCalled();
  });

  it('lets the traveller back out', async () => {
    renderPlanner({ onFillBlockManually: vi.fn() });
    const user = userEvent.setup();

    const index = await openManual(user);
    await user.click(screen.getByLabelText('取消輸入'));

    expect(screen.queryByTestId(`manual-block-input-${index}`)).toBeNull();
    expect(screen.getByTestId(`fill-block-${index}`)).toBeTruthy();
  });

  /** Opening the typing field is not choosing a saved place. */
  it('never calls the saved-place handler on the way to typing', async () => {
    const { onFillBlock } = renderPlanner({ onFillBlockManually: vi.fn() });
    const user = userEvent.setup();

    await openManual(user);

    expect(onFillBlock).not.toHaveBeenCalled();
  });
});

/**
 * 「當有標籤後 這個下拉式選單 展開後就依標籤分類展開」, then 「這個分類可以用city分類
 * 然後括號裡面是類別嗎」 — the heading became the ward and the tag moved into
 * the brackets beside the name.
 *
 * That way round because of what the dropdown is for: it fills one block of
 * one day, and what makes a day work is staying in one part of the city.
 */
describe('依區分類的下拉選單', () => {
  const tagged = [
    { id: 'g-ramen', placeName: 'らぁ麺や 嶋', category: 'food' as const, district: '渋谷区' },
    { id: 'g-coffee', placeName: 'DIART coffee', category: 'cafe' as const, district: '渋谷区' },
    { id: 'g-garden', placeName: '新宿御苑', category: 'sight' as const, district: '新宿区' },
    { id: 'g-plain', placeName: 'Working holiday' },
  ];

  /*
    Found by its label rather than by index: the default day in this file
    already has an item in it, so which block numbers are still empty depends
    on the fixture rather than on anything this test is about.
  */
  const openLabelled = async (needle: string) => {
    const trigger = Array
      .from(document.querySelectorAll('[data-testid^="fill-block-"]'))
      .find(node => (node.getAttribute('aria-label') || '').includes(needle)) as HTMLElement;
    await userEvent.setup().click(trigger);
  };

  const groupsIn = async (needle: string) => {
    await openLabelled(needle);
    return Array.from(document.querySelectorAll('[data-testid="place-picker"] h3'))
      .map(node => node.textContent || '');
  };

  const optionsUnder = async (needle: string, ward: string) => {
    await openLabelled(needle);
    const heading = Array.from(document.querySelectorAll('[data-testid="place-picker"] section'))
      .find(node => (node.querySelector('h3')?.textContent || '') === ward);
    return Array.from(heading?.querySelectorAll('[data-testid^="pick-place-"]') || [])
      .map(node => node.textContent || '');
  };

  it('以區為標題，不是以標籤', async () => {
    renderPlanner({ places: tagged });

    const headings = await groupsIn('行程');
    expect(headings).toContain('渋谷区');
    expect(headings).toContain('新宿区');
    expect(headings).not.toContain('餐廳');
  });

  it('類別標在名字旁邊', async () => {
    renderPlanner({ places: tagged });

    expect((await optionsUnder('行程', '渋谷区')).join('|')).toContain('らぁ麺や 嶋');
    expect((await optionsUnder('行程', '渋谷区')).join('|')).toContain('餐廳');
    expect((await optionsUnder('行程', '新宿区')).join('|')).toContain('景點');
  });

  /*
    Leading, not filtering: a café can be lunch and a market can be an
    afternoon. A dropdown that hid them would answer a question nobody asked.
  */
  it('午餐的格子讓同一區裡的餐廳排在前面，但沒有藏起別的', async () => {
    renderPlanner({ places: tagged });

    const inShibuya = await optionsUnder('午餐', '渋谷区');

    expect(inShibuya[0]).toContain('らぁ麺や 嶋');
    expect(inShibuya.join('|')).toContain('DIART coffee');
  });

  /* 「其他」 is the one heading that says nothing, so it goes last. */
  it('不知道在哪一區的歸在「其他」，排在最後，不會消失', async () => {
    renderPlanner({ places: tagged });

    const labels = await groupsIn('行程');
    expect(labels[labels.length - 1]).toBe('其他');
    expect(screen.getAllByText('Working holiday').length).toBeGreaterThan(0);
  });
});

/**
 * 「選項也要有一個無」.
 *
 * Every empty row already says 無. Once a row was filled there was no way
 * back to it from this panel — a slot could be given a place and never taken
 * one away, so undoing a wrong pick meant leaving the screen entirely.
 */
describe('清空一格', () => {
  const filled = () => document
    .querySelector('[data-testid^="filled-block-"]') as HTMLElement;

  it('offers 清空這格 on a filled block', async () => {
    const user = userEvent.setup();
    renderPlanner({ onClearBlock: vi.fn() });

    await user.click(filled());

    expect(screen.getByTestId('place-picker-clear')).toBeTruthy();
  });

  it('empties the block when 清空 is chosen', async () => {
    const onClearBlock = vi.fn();
    const user = userEvent.setup();
    renderPlanner({ onClearBlock });

    await user.click(filled());
    await user.click(screen.getByTestId('place-picker-clear'));

    expect(onClearBlock).toHaveBeenCalledWith('it-nasari');
  });

  /* The same sheet swaps the place, so a wrong pick is one action to fix. */
  it('swaps the place when another one is chosen', async () => {
    const onClearBlock = vi.fn();
    const user = userEvent.setup();
    const { onFillBlock } = renderPlanner({ onClearBlock });

    await user.click(filled());
    await user.click(screen.getByTestId('pick-place-g-diart'));

    expect(onClearBlock).toHaveBeenCalledWith('it-nasari');
    expect(onFillBlock).toHaveBeenCalledWith(expect.anything(), 'g-diart');
  });

  /**
   * 「在這換了一家餐廳 但行程表上沒有同步刪除舊的餐廳行程」.
   *
   * A slot holds one stop. Replacing from the collection removed the old one;
   * taking a Google result or typing a name only added, so the day quietly
   * held two stops at the same hour while the panel still drew one row.
   */
  it('removes the old stop when a Google result takes the slot', async () => {
    const onClearBlock = vi.fn();
    const onFillBlockManually = vi.fn();
    const user = userEvent.setup();
    nearbyFound.mockResolvedValueOnce([
      { placeId: 'ChIJ-ichiran', placeName: '一蘭 淺草店', rating: 4.3, kind: '拉麵店' },
    ]);
    renderPlanner({
      onClearBlock,
      onFillBlockManually,
      /* An anchor the sheet can be 「near」: the occupant itself is not one. */
      items: [...gwangalli, item('it-later', 'Millak', '16:00', {
        latitude: 35.1540, longitude: 129.1300,
      })],
    });

    await user.click(filled());
    await user.click(await screen.findByTestId('suggested-place-ChIJ-ichiran'));

    expect(onClearBlock).toHaveBeenCalledWith('it-nasari');
    expect(onFillBlockManually).toHaveBeenCalledWith(expect.anything(), '一蘭 淺草店');
  });

  it('removes the old stop when a typed name takes the slot', async () => {
    const onClearBlock = vi.fn();
    const onFillBlockManually = vi.fn();
    const user = userEvent.setup();
    renderPlanner({ onClearBlock, onFillBlockManually });

    const index = filled().getAttribute('data-testid')!.replace('filled-block-', '');
    await user.click(filled());
    await user.click(screen.getByTestId('place-picker-manual'));
    await user.type(screen.getByTestId(`manual-block-input-${index}`), 'Cafe Onion');
    await user.click(screen.getByTestId(`manual-block-save-${index}`));

    expect(onClearBlock).toHaveBeenCalledWith('it-nasari');
    expect(onFillBlockManually).toHaveBeenCalledWith(expect.anything(), 'Cafe Onion');
  });

  /* A screen that cannot persist the removal must not appear to offer it. */
  it('offers nothing when the caller cannot write the removal', () => {
    renderPlanner();

    expect(filled()).toBeNull();
  });
});

/**
 * 「這是ＡＩ排的行程」.
 *
 * A 「固定」 chip appeared on a restaurant he had not meant to pin. A full
 * trace found only one writer of `isPinned` in the whole app — the pin button
 * on the timeline card — so it was a stray tap on an 11px unlabelled icon.
 * The chip here was a dead label: it said the row could not be changed and
 * offered no way to change it back.
 */
describe('取消固定', () => {
  const pinned = [
    { ...gwangalli[0], isPinned: true } as ItineraryItem,
  ];

  const renderPinned = (over: Record<string, unknown> = {}) => renderPlanner({
    items: pinned,
    areas: buildTripAreas({ itinerary: pinned }),
    isFixed: (item: ItineraryItem) => item.isPinned === true,
    ...over,
  });

  it('offers the way back from where the effect is visible', async () => {
    const onUnpin = vi.fn();
    renderPinned({ onUnpin });

    await userEvent.setup().click(screen.getByTestId('unpin-block-0'));

    expect(onUnpin).toHaveBeenCalledWith('it-nasari');
  });

  /* A flight is not the traveller's own and stays a plain label. */
  it('stays a label for something that is not a pin', () => {
    const flight = [{ ...gwangalli[0], type: 'FLIGHT' } as ItineraryItem];
    renderPlanner({
      items: flight,
      areas: buildTripAreas({ itinerary: flight }),
      isFixed: () => true,
      onUnpin: vi.fn(),
    });

    expect(screen.queryByTestId('unpin-block-0')).toBeNull();
    expect(screen.getAllByText('固定').length).toBeGreaterThan(0);
  });
});

/**
 * 「在這個表上可以跟用戶再確認一次」.
 *
 * His 晚餐 rows held Leaves Coffee Roasters and Lonich. The automatic rules
 * move a restaurant into a free meal window; what they cannot do is notice a
 * window ended up with a café in it.
 */
describe('這一餐真的是這個嗎', () => {
  const dinner = [
    item('it-coffee', 'Leaves Coffee Roasters', '18:30', {
      latitude: 35.7142, longitude: 139.7967, address: 'Sumida City, Tokyo',
    }),
  ];

  const renderDinner = (tag?: string) => renderPlanner({
    items: dinner,
    areas: buildTripAreas({ itinerary: dinner }),
    categoryOf: () => tag,
  });

  it('asks when a café is sitting in a meal slot', () => {
    renderDinner('cafe');

    const asked = document.querySelector('[data-testid^="meal-check-"]');
    expect(asked?.textContent).toContain('Leaves Coffee Roasters');
    expect(asked?.textContent).toContain('咖啡');
  });

  it('says nothing when the slot holds a restaurant', () => {
    renderDinner('food');

    expect(document.querySelector('[data-testid^="meal-check-"]')).toBeNull();
  });

  /* 「I cannot tell what this is」 is not a reason to query someone's dinner. */
  it('says nothing when the tag is unknown', () => {
    renderDinner(undefined);

    expect(document.querySelector('[data-testid^="meal-check-"]')).toBeNull();
  });
});

/**
 * 「這邊在左邊欄位直接可以有上下箭頭去移動排序」.
 *
 * Reordering meant dragging cards in the timeline below — the right tool for
 * a long day and the wrong one for 「these two are the wrong way round」,
 * especially on a phone where a drag has to miss every other control on the
 * way past.
 */
describe('上下箭頭', () => {
  const twoStops = [
    item('it-nasari', 'Nasari Sigdang', '10:00', {
      latitude: 35.1535, longitude: 129.1190, address: 'Suyeong-gu, Busan',
    }),
    item('it-working', 'Working holiday', '12:00', {
      latitude: 35.1529, longitude: 129.1181, address: 'Suyeong-gu, Busan',
    }),
  ];

  const renderTwo = (over: Record<string, unknown> = {}) => renderPlanner({
    items: twoStops,
    areas: buildTripAreas({ itinerary: twoStops }),
    ...over,
  });

  it('swaps with the next row when something is already in it', async () => {
    const onSwapBlocks = vi.fn();
    renderTwo({ onSwapBlocks, onShiftBlock: vi.fn() });

    await userEvent.setup().click(screen.getByTestId('move-down-0'));

    expect(onSwapBlocks).toHaveBeenCalledWith('it-nasari', 'it-working');
  });

  it('moves the second one back up', async () => {
    const onSwapBlocks = vi.fn();
    renderTwo({ onSwapBlocks, onShiftBlock: vi.fn() });

    await userEvent.setup().click(screen.getByTestId('move-up-1'));

    expect(onSwapBlocks).toHaveBeenCalledWith('it-working', 'it-nasari');
  });

  /*
    「這樣點擊就是一直在交換行程」, then 「讓兩個行程相鄰」.

    東京都現代美術館 13:54–15:54 and Hoppy Street 19:00 are three hours apart.
    The first press should close that gap, not rearrange the same dead
    afternoon.
  */
  const spreadOut = [
    item('it-museum', '東京都現代美術館', '13:54', {
      durationMinutes: 120, latitude: 35.6805, longitude: 139.8075, address: 'Koto City, Tokyo',
    }),
    item('it-hoppy', 'Hoppy Street', '19:00', {
      durationMinutes: 90, latitude: 35.7142, longitude: 139.7967, address: 'Taito City, Tokyo',
    }),
  ];

  const renderSpread = (over: Record<string, unknown> = {}) => renderPlanner({
    items: spreadOut,
    areas: buildTripAreas({ itinerary: spreadOut }),
    onSwapBlocks: vi.fn(),
    onShiftBlock: vi.fn(),
    ...over,
  });

  it('closes the gap so the two stops touch', async () => {
    const onShiftBlock = vi.fn();
    const onSwapBlocks = vi.fn();
    renderSpread({ onShiftBlock, onSwapBlocks });

    // The museum runs two hours, so ending at 19:00 means starting at 17:00.
    await userEvent.setup().click(screen.getByTestId('move-down-2'));

    expect(onShiftBlock).toHaveBeenCalledWith('it-museum', '17:00');
    expect(onSwapBlocks).not.toHaveBeenCalled();
  });

  it('pulls the later stop up to meet the earlier one', async () => {
    const onShiftBlock = vi.fn();
    renderSpread({ onShiftBlock });

    const up = Array.from(document.querySelectorAll('[data-testid^="move-up-"]')).pop() as HTMLElement;
    await userEvent.setup().click(up);

    // 13:54 plus the museum's two hours.
    expect(onShiftBlock).toHaveBeenCalledWith('it-hoppy', '15:54');
  });

  /* With nothing left between them, the only move that changes anything. */
  it('swaps once there is no gap left', async () => {
    const adjacent = [
      item('it-a', 'A', '10:00', { durationMinutes: 120, latitude: 35.68, longitude: 139.8, address: 'Koto City, Tokyo' }),
      item('it-b', 'B', '12:00', { durationMinutes: 120, latitude: 35.69, longitude: 139.81, address: 'Koto City, Tokyo' }),
    ];
    const onSwapBlocks = vi.fn();
    const onShiftBlock = vi.fn();
    renderPlanner({
      items: adjacent,
      areas: buildTripAreas({ itinerary: adjacent }),
      onSwapBlocks,
      onShiftBlock,
    });

    await userEvent.setup().click(screen.getByTestId('move-down-0'));

    expect(onSwapBlocks).toHaveBeenCalledWith('it-a', 'it-b');
    expect(onShiftBlock).not.toHaveBeenCalled();
  });

  /*
    An arrow with nothing to trade with is not rendered. A dead button teaches
    people the row cannot move at all.
  */
  it('offers nothing when there is only one stop', () => {
    renderPlanner({ onSwapBlocks: undefined, onShiftBlock: undefined });

    expect(document.querySelector('[data-testid^="move-up-"]')).toBeNull();
    expect(document.querySelector('[data-testid^="move-down-"]')).toBeNull();
  });

  /* A flight is a wall, not a partner: swapping it with lunch breaks the day. */
  it('refuses to trade with a fixed row', () => {
    const onSwapBlocks = vi.fn();
    renderTwo({ onSwapBlocks, onShiftBlock: vi.fn(), isFixed: (entry: ItineraryItem) => entry.id === 'it-working' });

    expect(document.querySelector('[data-testid^="move-down-"]')).toBeNull();
  });

  /* Nothing is offered when the caller cannot write the swap. */
  it('offers nothing without a handler', () => {
    renderTwo();

    expect(document.querySelector('[data-testid^="move-down-"]')).toBeNull();
  });
});

/**
 * 「最後一天有飛行行程那這個一定要開始進行交通的時間要被以紅色標注提醒用戶不能排行程
 * 了！要出發去機場」.
 *
 * The blocks have stopped at that hour since this table was built. Stopping is
 * silent: an evening with no rows looks like an evening nobody has planned
 * yet, which is the opposite of what it is.
 */
describe('最後一天要出發去機場', () => {
  const goingHome: FixedScheduleEntry[] = [
    { date: DAY, time: '15:30', label: '前往機場', role: 'to_airport', durationMinutes: 0 },
    { date: DAY, time: '18:30', label: '航班起飛', role: 'departure', durationMinutes: 0 },
  ];

  it('says when the day stops being a day', () => {
    renderPlanner({ fixedSchedule: goingHome });

    const warning = screen.getByTestId('day-closes-for-airport');
    expect(warning.textContent).toContain('15:30');
    expect(warning.textContent).toContain('機場');
  });

  /*
    「我的飛機是晚上九點」 — the line read 「19:15 要出發去機場」, and 19:15 is the
    抵達機場 card: departure less the check-in buffer. Setting off then misses
    the flight by the length of the ride.
  */
  it('separates when to be there from when to leave', () => {
    const day = [
      item('it-last', 'Nakameguro', '16:46', {
        latitude: 35.6447, longitude: 139.6988, address: 'Meguro City, Tokyo',
      }),
      item('flight-arrival-f1', '抵達機場', '19:15', {
        latitude: 35.7720, longitude: 140.3929, address: 'Narita International Airport',
        type: 'TRANSPORT', derivedFromFlightAnchorId: 'f1',
      }),
    ];
    renderPlanner({
      items: day,
      areas: buildTripAreas({ itinerary: day }),
      isFixed: (entry: ItineraryItem) => Boolean(entry.derivedFromFlightAnchorId),
      fixedSchedule: [
        { date: DAY, time: '19:15', label: '抵達機場', role: 'to_airport', durationMinutes: 0 },
        { date: DAY, time: '21:00', label: '航班起飛', role: 'departure', durationMinutes: 0 },
      ] as FixedScheduleEntry[],
    });

    const warning = screen.getByTestId('day-closes-for-airport').textContent || '';
    // 中目黒 to 成田 is a long way: setting off has to be well before 19:15.
    expect(warning).toContain('19:15 前要到');
    expect(warning).toMatch(/\d{2}:\d{2} 就要出發去機場/);
    expect(warning).not.toContain('19:15 就要出發');
  });

  /* With no located stop to leave from, only the fact that can be stated. */
  it('states only the arrival time when the journey is unknown', () => {
    renderPlanner({ fixedSchedule: goingHome });

    expect(screen.getByTestId('day-closes-for-airport').textContent).toContain('15:30 前要到機場');
  });

  /* Said in red, which is what he asked for and what the rest of this panel is not. */
  it('is red', () => {
    renderPlanner({ fixedSchedule: goingHome });

    expect(screen.getByTestId('day-closes-for-airport').className).toContain('rose');
  });

  /* An ordinary day has no such hour and must not be warned about one. */
  it('says nothing on a day with no flight out', () => {
    renderPlanner();

    expect(screen.queryByTestId('day-closes-for-airport')).toBeNull();
  });

  /* Arriving is not leaving: a landing closes nothing. */
  it('says nothing on the day they arrive', () => {
    renderPlanner({
      fixedSchedule: [
        { date: DAY, time: '11:00', label: '航班抵達', role: 'landing', durationMinutes: 0 },
      ] as FixedScheduleEntry[],
    });

    expect(screen.queryByTestId('day-closes-for-airport')).toBeNull();
  });
});

/**
 * 「若不是在編輯吃東西的時段時 推薦就不要是食物」.
 *
 * The 15:30 下午行程 block opened on three Korean restaurants. The saved-place
 * half of the same sheet already led an activity with sights; Google's half
 * asked for restaurants whatever the slot was. Two paths, one doing less.
 */
describe('推薦要跟著時段', () => {
  const located = [
    item('it-morning', 'Nasari Sigdang', '10:00', { latitude: 35.1535, longitude: 129.1190 }),
    item('it-evening', 'Cheongsapo', '18:00', { latitude: 35.1600, longitude: 129.1900 }),
  ];

  const askedFor = async (label: string) => {
    nearbyFound.mockClear();
    const user = userEvent.setup();
    renderPlanner({ items: located, onClearBlock: vi.fn() });

    const block = [...document.querySelectorAll('[data-testid^="fill-block-"]')]
      .find(node => (node.getAttribute('aria-label') || '').includes(label)) as HTMLElement;
    await user.click(block);

    return nearbyFound.mock.calls[0] as unknown as unknown[];
  };

  it('asks for things to do in an afternoon block', async () => {
    expect((await askedFor('下午行程'))?.[2]).toBe('activity');
  });

  it('asks for food in a meal block', async () => {
    expect((await askedFor('午餐'))?.[2]).toBe('food');
  });
});

/**
 * 「這個也填過很多次了」.
 *
 * 幾點出門 was blank every time the screen opened and forgot whatever was typed
 * — nothing is stored by it, because the input is an instruction to move the
 * day and once the day has moved the instruction is spent.
 */
describe('幾點出門', () => {
  const start = () => screen.getByTestId('day-start-input') as HTMLInputElement;

  it('shows the time the day already starts at', () => {
    renderPlanner({ items: [item('it-nasari', 'Nasari Sigdang', '10:30')] });

    expect(start().value).toBe('10:30');
  });

  /* A flight is not when the traveller chose to leave. */
  it('reads the first stop it could actually move', () => {
    renderPlanner({
      items: [
        item('it-flight', '航班抵達', '06:35', { type: 'FLIGHT', derivedFromFlightAnchorId: 'a1' }),
        item('it-asakusa', '淺草寺', '10:30'),
      ],
    });

    expect(start().value).toBe('10:30');
  });

  /* A day with nothing movable on it has no start to report. */
  it('is blank when there is nothing to move', () => {
    renderPlanner({ items: [] });

    expect(start().value).toBe('');
  });

  /* Typing still asks, rather than rewriting the day on the way to 11:00. */
  it('offers the move once a different time is chosen', async () => {
    const user = userEvent.setup();
    renderPlanner({ items: [item('it-nasari', 'Nasari Sigdang', '09:00')], onShiftDay: vi.fn() });

    expect(screen.queryByTestId('shift-day-start')).toBeNull();
    await user.clear(start());
    await user.type(start(), '11:00');

    expect(screen.getByTestId('shift-day-start')).toBeTruthy();
  });

  /*
    A time chosen for one day is not a time chosen for the next: this panel
    stays mounted while the day tabs change, so 10:30 typed on Day 2 followed
    Day 3 around and offered to move a day nobody had said anything about.
  */
  it('forgets the chosen time when the day changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DayBlockPlanner
        date={DAY}
        items={[item('it-nasari', 'Nasari Sigdang', '09:00')]}
        places={places}
        onFillBlock={vi.fn()}
        onChangeDuration={vi.fn()}
        onShiftDay={vi.fn()}
      />,
    );
    await user.clear(start());
    await user.type(start(), '11:00');
    expect(screen.getByTestId('shift-day-start')).toBeTruthy();

    rerender(
      <DayBlockPlanner
        date="2026-10-07"
        items={[item('it-other', '海雲台', '09:00', { date: '2026-10-07' })]}
        places={places}
        onFillBlock={vi.fn()}
        onChangeDuration={vi.fn()}
        onShiftDay={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('shift-day-start')).toBeNull();
    expect(start().value).toBe('09:00');
  });
});

/**
 * 「這裡還需要：更多搜尋🔍」.
 *
 * The sheet offered the collection and three places Google chose. Somebody who
 * already knows the name they want had no way past those three.
 */
describe('更多搜尋', () => {
  const openSheet = async (user: ReturnType<typeof userEvent.setup>) => {
    renderPlanner({
      onClearBlock: vi.fn(),
      onFillBlockManually: vi.fn(),
      items: [
        item('it-nasari', 'Nasari Sigdang', '10:00', { latitude: 35.1535, longitude: 129.1190 }),
        item('it-evening', 'Cheongsapo', '18:00', { latitude: 35.1600, longitude: 129.1900 }),
      ],
    });
    await user.click(document.querySelector('[data-testid^="fill-block-"]') as HTMLElement);
  };

  it('offers a search once something is typed', async () => {
    const user = userEvent.setup();
    await openSheet(user);

    expect(screen.queryByTestId('search-more-places')).toBeNull();
    await user.type(screen.getByTestId('place-picker-search'), '一蘭');

    expect(screen.getByTestId('search-more-places').textContent).toContain('一蘭');
  });

  it('shows what came back as the same cards', async () => {
    nearbyFound.mockResolvedValue([
      { placeId: 'ChIJ-ichiran', placeName: '一蘭 淺草店', rating: 4.3, kind: '拉麵店' },
    ]);
    const user = userEvent.setup();
    await openSheet(user);

    await user.type(screen.getByTestId('place-picker-search'), '一蘭');
    await user.click(screen.getByTestId('search-more-places'));

    expect(await screen.findByTestId('suggested-place-ChIJ-ichiran')).toBeTruthy();
    expect((nearbyFound.mock.calls as unknown[][]).at(-1)?.[3]).toBe('一蘭');
  });

  /* An empty answer is said, not left looking like a button that did nothing. */
  it('says when the corner has nothing by that name', async () => {
    nearbyFound.mockResolvedValue([]);
    const user = userEvent.setup();
    await openSheet(user);

    await user.type(screen.getByTestId('place-picker-search'), '不存在的店');
    await user.click(screen.getByTestId('search-more-places'));

    expect(await screen.findByText(/找不到「不存在的店」/)).toBeTruthy();
  });
});

/**
 * 「若想要刪除行程可以格子往右推 就出現「刪除」選項嗎」.
 *
 * Removing a stop meant opening the sheet and finding 清空這格 under fifty
 * saved places, which is a long way round for 「not this one」.
 */
describe('往右推刪除', () => {
  const swipe = (node: HTMLElement, by: number) => {
    fireEvent.touchStart(node, { touches: [{ clientX: 10 }] });
    fireEvent.touchEnd(node, { changedTouches: [{ clientX: 10 + by }] });
  };

  it('shows 刪除 when the row is pushed right', () => {
    const onClearBlock = vi.fn();
    renderPlanner({ onClearBlock });

    const remove = screen.getByTestId('swipe-delete-0');
    expect(remove.className).toContain('opacity-0');

    swipe(screen.getByTestId('day-block-0'), 80);

    expect(screen.getByTestId('swipe-delete-0').className).not.toContain('opacity-0');
  });

  it('removes the stop when it is pressed', () => {
    const onClearBlock = vi.fn();
    renderPlanner({ onClearBlock });

    swipe(screen.getByTestId('day-block-0'), 80);
    fireEvent.click(screen.getByTestId('swipe-delete-0'));

    expect(onClearBlock).toHaveBeenCalledWith('it-nasari');
  });

  /* A tap that wandered a few pixels is a tap. */
  it('stays shut for a small movement', () => {
    renderPlanner({ onClearBlock: vi.fn() });

    swipe(screen.getByTestId('day-block-0'), 12);

    expect(screen.getByTestId('swipe-delete-0').className).toContain('opacity-0');
  });

  it('closes again when pushed back', () => {
    renderPlanner({ onClearBlock: vi.fn() });
    const row = screen.getByTestId('day-block-0');

    swipe(row, 80);
    swipe(row, -80);

    expect(screen.getByTestId('swipe-delete-0').className).toContain('opacity-0');
  });

  /* A flight is what the day is built around; this panel may not remove one. */
  it('is not offered on a fixed row', () => {
    renderPlanner({ onClearBlock: vi.fn(), isFixed: () => true });

    expect(screen.queryByTestId('swipe-delete-0')).toBeNull();
  });

  /* A screen that cannot persist the removal must not appear to offer it. */
  it('is not offered when the caller cannot write it', () => {
    renderPlanner();

    expect(screen.queryByTestId('swipe-delete-0')).toBeNull();
  });
});
