/**
 * @vitest-environment jsdom
 *
 * Runtime proof for the itinerary list: fixed cards with their own left time
 * label, drag to reorder, an explicit 「重新安排時間」 repair, real localStorage and
 * a real reload. The real App, driven by real pointer events on the real handle.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ItineraryItem } from '../types';

const DAY_5 = '2026-10-05';
const DAY_6 = '2026-10-06';
const DRAFT_ID = 'draft-list';

/** The ticket's fixture, plus one Day 5 item to drag across to. */
const itinerary: ItineraryItem[] = [
  { id: 'it-day5', date: DAY_5, time: '10:00', durationMinutes: 60, title: '甘川文化村', location: '甘川文化村', notes: '', type: 'ACTIVITY' },
  { id: 'it-a', date: DAY_6, time: '11:00', durationMinutes: 180, title: 'SPA LAND Centum City', location: 'SPA LAND Centum City', notes: '', type: 'ACTIVITY' },
  { id: 'it-b', date: DAY_6, time: '14:30', durationMinutes: 120, title: '新世界百貨 Centum City', location: '新世界百貨 Centum City', notes: '', type: 'ACTIVITY' },
  { id: 'it-c', date: DAY_6, time: '17:00', durationMinutes: 90, title: 'Place C', location: 'Place C', notes: '', type: 'ACTIVITY' },
];

const seedStorage = (items: ItineraryItem[] = itinerary) => {
  localStorage.clear();
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
    id: DRAFT_ID, name: '釜山測試行程', destination: '釜山',
    startDate: DAY_5, endDate: DAY_6,
    expenses: [], companions: [], shoppingList: [], itinerary: items,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  }]));
  localStorage.setItem('trippie_active_trip_id', DRAFT_ID);
};

const persisted = (): ItineraryItem[] => {
  const drafts = JSON.parse(localStorage.getItem('trippie_drafts_v1') || '[]');
  return drafts.find((draft: { id: string }) => draft.id === DRAFT_ID)?.itinerary || [];
};

const trace: string[] = [];
const log = (label: string, value: unknown) => {
  trace.push(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
};

beforeEach(() => {
  seedStorage();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const openPlanning = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByText('旅行'));
  await user.click(screen.getByText(/繼續旅程/));
  await user.click(screen.getByText('規劃'));
  // Wait for the timeline itself, not for a fixed number of milliseconds: every
  // assertion below reads through `list()`, so a slow machine used to fail the
  // whole file here rather than where the behaviour actually is.
  await waitFor(() => expect(screen.getByLabelText('行程時間軸')).toBeTruthy());
};

const list = () => screen.getByLabelText('行程時間軸');
const rows = () => Array.from(list().querySelectorAll('[data-item-id]')) as HTMLElement[];
const renderedOrder = () => rows().map(node => node.querySelector('h4')?.textContent || '');
const renderedTimes = () => rows().map(node => node.getAttribute('data-start'));
const handleFor = (title: string) => screen.getByRole('button', { name: `拖曳排序 ${title}` });

/**
 * jsdom gives every element a zero-size rect, so the midpoint maths needs real
 * geometry. Each row gets an identical 100px band — which is the point: spacing
 * does not vary with the time gap.
 */
const stubGeometry = () => {
  rows().forEach((node, index) => {
    node.getBoundingClientRect = () => ({
      top: index * 100, bottom: index * 100 + 100, left: 0, right: 300,
      height: 100, width: 300, x: 0, y: index * 100, toJSON: () => ({}),
    }) as DOMRect;
  });
  Array.from(document.querySelectorAll('[data-drop-day]')).forEach(node => {
    const date = node.getAttribute('data-drop-day')!;
    const column = date === DAY_5 ? 0 : 1;
    (node as HTMLElement).getBoundingClientRect = () => ({
      top: -60, bottom: -20, left: column * 100, right: column * 100 + 90,
      height: 40, width: 90, x: column * 100, y: -60, toJSON: () => ({}),
    }) as DOMRect;
  });
};

const drag = (title: string, to: { clientX: number; clientY: number }) => {
  stubGeometry();
  fireEvent.pointerDown(handleFor(title), { pointerId: 1, clientX: 10, clientY: 10 });
  stubGeometry();
  fireEvent.pointerMove(list(), { pointerId: 1, ...to });
  fireEvent.pointerUp(list(), { pointerId: 1, ...to });
};

describe('itinerary list runtime', () => {
  it('renders evenly spaced cards with their own left time labels', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    await user.click(screen.getByText('Day 2'));

    expect(renderedOrder()).toEqual(['SPA LAND Centum City', '新世界百貨 Centum City', 'Place C']);
    expect(renderedTimes()).toEqual(['11:00', '14:30', '17:00']);
    log('ROWS', renderedTimes());

    // Duration is metadata only.
    expect(screen.getByText('約 180 分')).toBeTruthy();
    expect(screen.getByText('約 120 分')).toBeTruthy();
    expect(screen.getByText('約 90 分')).toBeTruthy();

    // No hourly ruler, no nested scroll region, no proportional gaps.
    expect(screen.queryByTestId('time-axis')).toBeNull();
    expect(screen.queryByTestId('schedule-viewport')).toBeNull();
    expect(screen.queryByText('12:00')).toBeNull();
    expect(screen.queryByText('13:00')).toBeNull();
    rows().forEach(node => {
      expect(node.style.top).toBe('');
      expect(node.style.minHeight).toBe('');
    });

    // The day reads forwards, so no warning.
    expect(screen.queryByText('行程順序已更新，請確認時間安排。')).toBeNull();
  });

  /** One 30-minute step is DRAG_STEP_PIXELS of vertical movement. */
  const STEP = 40;

  it('drags SPA LAND two steps earlier and carries the day with it', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    await user.click(screen.getByText('Day 2'));

    // 11:00 → 10:00 is two 30-minute steps upward.
    drag('SPA LAND Centum City', { clientX: 120, clientY: 10 - STEP * 2 });
    await waitFor(() => expect(renderedTimes()).toEqual(['10:00', '13:30', '16:00']));
    log('DRAG_EARLIER', renderedTimes());
    // Card order is still chronological and nothing was duplicated.
    expect(renderedOrder()).toEqual(['SPA LAND Centum City', '新世界百貨 Centum City', 'Place C']);
    expect(persisted().filter(entry => entry.date === DAY_6)).toHaveLength(3);
    // Durations untouched.
    expect(persisted().find(entry => entry.id === 'it-a')?.durationMinutes).toBe(180);

    // Reload keeps the shifted schedule.
    cleanup();
    render(<App />);
    const user2 = userEvent.setup();
    await openPlanning(user2);
    await user2.click(screen.getByText('Day 2'));
    expect(renderedTimes()).toEqual(['10:00', '13:30', '16:00']);
    log('AFTER_RELOAD', renderedTimes());
  });

  it('drags SPA LAND two steps later and pushes the day back without overlap', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    await user.click(screen.getByText('Day 2'));

    drag('SPA LAND Centum City', { clientX: 120, clientY: 10 + STEP * 2 });
    await waitFor(() => expect(renderedTimes()).toEqual(['12:00', '15:30', '18:00']));
    log('DRAG_LATER', renderedTimes());
    expect(screen.queryByText('行程順序已更新，請確認時間安排。')).toBeNull();
  });

  it('leaves earlier activities untouched when a later one is dragged', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    await user.click(screen.getByText('Day 2'));

    drag('新世界百貨 Centum City', { clientX: 120, clientY: 10 + STEP });
    await waitFor(() => expect(renderedTimes()[1]).toBe('15:00'));
    log('DRAG_MIDDLE', renderedTimes());
    // SPA LAND is before it, so it does not move.
    expect(persisted().find(entry => entry.id === 'it-a')?.time).toBe('11:00');
    expect(renderedTimes()[0]).toBe('11:00');
    expect(renderedTimes()[1]).toBe('15:00');
  });

  it('shows the target time while dragging, before release', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    await user.click(screen.getByText('Day 2'));

    stubGeometry();
    fireEvent.pointerDown(handleFor('SPA LAND Centum City'), { pointerId: 1, clientX: 10, clientY: 10 });
    stubGeometry();
    fireEvent.pointerMove(list(), { pointerId: 1, clientX: 120, clientY: 10 - STEP });

    const preview = screen.getByTestId('drag-time-preview');
    expect(preview.textContent).toBe('10:30');
    log('DRAG_PREVIEW', preview.textContent);
    // Nothing is written until the drop.
    expect(persisted().find(entry => entry.id === 'it-a')?.time).toBe('11:00');

    fireEvent.pointerUp(list(), { pointerId: 1, clientX: 120, clientY: 10 - STEP });
    await waitFor(() => expect(persisted().find(entry => entry.id === 'it-a')?.time).toBe('10:30'));
  });

  it('moves an item to another day without duplicating it', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    await user.click(screen.getByText('Day 2'));

    drag('新世界百貨 Centum City', { clientX: 40, clientY: -40 });
    await waitFor(() => expect(persisted().find(entry => entry.id === 'it-b')?.date).toBe(DAY_5));

    const all = persisted();
    log('CROSS_DAY', all.map(entry => `${entry.date} ${entry.title}`));
    expect(all.filter(entry => entry.id === 'it-b')).toHaveLength(1);
    expect(all.find(entry => entry.id === 'it-b')?.date).toBe(DAY_5);
    expect(all).toHaveLength(4);
    expect(renderedOrder()).toEqual(['SPA LAND Centum City', 'Place C']);

    cleanup();
    render(<App />);
    await openPlanning(userEvent.setup());
    expect(persisted().find(entry => entry.id === 'it-b')?.date).toBe(DAY_5);
  });

  it('rolls back and persists nothing when the write fails', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    await user.click(screen.getByText('Day 2'));

    const before = renderedTimes();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    try {
      drag('SPA LAND Centum City', { clientX: 120, clientY: 10 - STEP * 2 });
      // Wait for the write to actually be attempted, with the spy still in
      // place. Waiting a fixed 20ms here meant the assertions below could run
      // before the drag reached the store at all — in which case "nothing
      // moved" was true because nothing had happened yet, not because the
      // failed write was handled.
      await waitFor(() => expect(setItem).toHaveBeenCalled());
    } finally {
      setItem.mockRestore();
    }

    // `commitItinerary` persists before it moves the visible state, so a write
    // that threw leaves both the screen and the store untouched.
    expect(renderedTimes()).toEqual(before);
    expect(persisted().find(entry => entry.id === 'it-a')?.time).toBe('11:00');
    log('ROLLBACK', renderedTimes());
  });

  it('keeps untimed items in their own section, with no invented time', async () => {
    seedStorage([...itinerary, {
      id: 'it-untimed', date: DAY_6, time: '', title: '待定景點', location: '待定景點', notes: '', type: 'ACTIVITY',
    }]);

    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    await user.click(screen.getByText('Day 2'));

    expect(screen.getByText('尚未安排時間')).toBeTruthy();
    expect(screen.getAllByText('待定景點').length).toBeGreaterThan(0);
    expect(renderedOrder()).toEqual(['SPA LAND Centum City', '新世界百貨 Centum City', 'Place C']);
    expect(persisted().find(entry => entry.id === 'it-untimed')?.time).toBe('');
  });

  it('leaves a tap on the card, 完成 and the overflow menu working', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    await user.click(screen.getByText('Day 2'));

    const card = list().querySelector('[data-item-id="it-a"]') as HTMLElement;
    await user.click(within(card).getByRole('checkbox'));
    expect(persisted().find(entry => entry.id === 'it-a')?.isCompleted).toBe(true);
    expect(renderedOrder()).toEqual(['SPA LAND Centum City', '新世界百貨 Centum City', 'Place C']);

    await user.click(within(card).getByRole('button', { name: /更多選項/ }));
    expect(screen.getByText('編輯行程')).toBeTruthy();

    // eslint-disable-next-line no-console
    console.log(trace.join('\n'));
  });
});

/**
 * Fixed events: a flight makes the day impossible, the user is told, and nothing
 * is written until they apply the proposal.
 */
describe('fixed events runtime', () => {
  const DAY_6_WITH_FLIGHT: ItineraryItem[] = [
    { id: 'it-day5', date: DAY_5, time: '10:00', durationMinutes: 60, title: '甘川文化村', location: '甘川文化村', notes: '', type: 'ACTIVITY' },
    { id: 'it-a', date: DAY_6, time: '11:00', durationMinutes: 120, title: '白淺灘文化村', location: '白淺灘文化村', notes: '', type: 'ACTIVITY' },
    { id: 'it-b', date: DAY_6, time: '14:00', durationMinutes: 120, title: '太宗臺', location: '太宗臺', notes: '', type: 'ACTIVITY' },
    { id: 'it-c', date: DAY_6, time: '17:00', durationMinutes: 90, title: 'P.ARK', location: 'P.ARK', notes: '', type: 'ACTIVITY' },
    {
      id: 'it-flight', date: DAY_6, time: '18:00', durationMinutes: 0,
      title: '釜山 → 台北', location: '金海國際機場', notes: '', type: 'FLIGHT',
      scheduleFlexibility: 'fixed', fixedEventKind: 'flight',
    },
  ];

  const openDay6 = async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    await user.click(screen.getByText('Day 2'));
    return user;
  };

  beforeEach(() => seedStorage(DAY_6_WITH_FLIGHT));

  it('marks the flight as fixed and gives it no drag handle', async () => {
    await openDay6();
    expect(screen.getByTestId('fixed-badge-it-flight').textContent).toContain('航班 · 固定');
    expect(screen.queryByRole('button', { name: '拖曳排序 釜山 → 台北' })).toBeNull();
    // Ordinary activities keep theirs.
    expect(screen.getByRole('button', { name: '拖曳排序 白淺灘文化村' })).toBeTruthy();
  });

  it('tells the user the day needs adjusting, and changes nothing yet', async () => {
    await openDay6();
    expect(screen.getByText('新增航班後，當日行程需要調整')).toBeTruthy();
    expect(screen.getByText(/我們建議調整 3 個行程/)).toBeTruthy();
    // No route data in this environment, so the estimate is declared.
    expect(screen.getByText(/交通時間為估算值/)).toBeTruthy();
    // Storage untouched.
    expect(persisted().find(entry => entry.id === 'it-a')?.time).toBe('11:00');
    log('FIXED_NOTICE', renderedTimes());
  });

  it('shows a structured preview that is still non-mutating', async () => {
    const user = await openDay6();
    await user.click(screen.getByRole('button', { name: '查看調整' }));

    expect(screen.getByText('建議調整')).toBeTruthy();
    expect(screen.getByTestId('adjust-it-a').textContent).toContain('11:00');
    expect(screen.getByTestId('adjust-it-c').textContent).toContain('移至');
    // One reason line per moved activity.
    expect(screen.getAllByText('需預留機場交通與報到時間。').length).toBe(2);
    // Still nothing written.
    expect(persisted().find(entry => entry.id === 'it-a')?.time).toBe('11:00');
    expect(persisted().find(entry => entry.id === 'it-c')?.date).toBe(DAY_6);
  });

  it('applies only on 套用調整, and the result survives a reload', async () => {
    const user = await openDay6();
    await user.click(screen.getByRole('button', { name: '查看調整' }));
    await user.click(screen.getByRole('button', { name: '套用調整' }));
    await waitFor(() => expect(persisted().find(entry => entry.id === 'it-a')?.time).toBe('10:00'));

    const after = persisted();
    log('FIXED_APPLIED', after.map(entry => `${entry.date} ${entry.time} ${entry.title}`));
    // The two that fit moved earlier; P.ARK moved to the previous day.
    // 18:00 flight − 120 check-in − 60 fallback transit = a 15:00 deadline, so
    // the day starts at 10:00 and the user's 60-minute gap survives.
    expect(after.find(entry => entry.id === 'it-a')?.time).toBe('10:00');
    expect(after.find(entry => entry.id === 'it-b')?.time).toBe('13:00');
    expect(after.find(entry => entry.id === 'it-c')?.date).toBe(DAY_5);
    // The flight never moved, and nothing disappeared.
    expect(after.find(entry => entry.id === 'it-flight')?.time).toBe('18:00');
    expect(after).toHaveLength(5);

    cleanup();
    const { default: App } = await import('../App');
    render(<App />);
    await openPlanning(userEvent.setup());
    expect(persisted().find(entry => entry.id === 'it-c')?.date).toBe(DAY_5);
    log('FIXED_AFTER_RELOAD', persisted().filter(entry => entry.date === DAY_6).map(entry => entry.time));
  });
});

/**
 * A flight's date belongs to the flight.
 *
 * The two items an anchor derives are rebuilt from that anchor whenever it
 * changes, so an edit made on the itinerary card is accepted, looks saved, and
 * silently reverts. The card must not offer the edit at all.
 */
describe('derived flight items are not editable on the itinerary', () => {
  const DERIVED: ItineraryItem[] = [
    {
      id: 'flight-arrival-anchor-out', date: DAY_6, time: '14:35',
      title: '抵達機場', location: '台灣桃園國際機場',
      notes: '依航班起飛時間與機場緩衝自動推算，於「航班資訊」修改',
      type: 'TRANSPORT', derivedFromFlightAnchorId: 'anchor-out',
    },
    {
      id: 'it-own', date: DAY_6, time: '19:00',
      title: '晚餐', location: '札嘎其市場', notes: '', type: 'FOOD',
    },
  ];

  beforeEach(() => seedStorage(DERIVED));

  const openDay = async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    await user.click(screen.getByText('Day 2'));
    return user;
  };

  it('shows the flight date as text, with no date control to change it', async () => {
    await openDay();
    const card = screen.getByText('抵達機場').closest('[class*="rounded-[20px]"]') as HTMLElement;
    expect(within(card).queryByDisplayValue(DAY_6)).toBeNull();
    expect(within(card).getByText(/於航班資訊修改/)).toBeTruthy();
    // The date is still shown — hiding it would be worse than locking it.
    expect(within(card).getByText(DAY_6.replace(/-/g, '/'))).toBeTruthy();
  });

  it('still lets an ordinary item have its date changed', async () => {
    await openDay();
    const card = screen.getByText('晚餐').closest('[class*="rounded-[20px]"]') as HTMLElement;
    const input = within(card).getByDisplayValue(DAY_6);
    expect((input as HTMLInputElement).type).toBe('date');
  });

  it('points at the flight form instead of offering 編輯行程', async () => {
    const user = await openDay();
    await user.click(screen.getByLabelText('抵達機場 更多選項'));
    expect(screen.queryByRole('button', { name: '編輯行程' })).toBeNull();
    expect(screen.getByText(/航班時間請於「航班資訊」修改/)).toBeTruthy();
  });

  it('keeps 完成 tickable, because that one is the traveller’s own', async () => {
    await openDay();
    const card = screen.getByText('抵達機場').closest('[class*="rounded-[20px]"]') as HTMLElement;
    expect(within(card).getByText('完成')).toBeTruthy();
  });
});

/**
 * Flights and stays are the two fixed points a trip is arranged around, and
 * they belong on the same screen.
 *
 * App renders FlightAnchorsForm from two places. The stay card was first
 * mounted beside only one of them — the one the Founder never opens — so the
 * feature shipped, was verified end to end against its endpoint, and was
 * nowhere to be found in the app. This asserts against the screen a real
 * traveller uses rather than against the component in isolation.
 */
describe('the planning screen carries both anchors', () => {
  beforeEach(() => seedStorage([
    { id: 'it-own', date: DAY_6, time: '19:00', title: '晚餐', location: '札嘎其市場', notes: '', type: 'FOOD' },
  ]));

  it('shows 航班資訊 and 住宿資訊 together', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    expect(screen.getByText('航班資訊')).toBeTruthy();
    // This is the one that was missing.
    expect(screen.getByText('住宿資訊')).toBeTruthy();
  });

  it('offers both ways to enter a stay, since a screenshot can be unreadable', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    const stays = screen.getByText('住宿資訊').closest('section') as HTMLElement;
    // Exactly one of each: the actions live in the header or in the empty
    // panel, never both, so the card never shows the same choice twice.
    expect(within(stays).getByRole('button', { name: /上傳截圖/ })).toBeTruthy();
    expect(within(stays).getByRole('button', { name: /手動/ })).toBeTruthy();
  });
});

/**
 * Where you sleep, on every night you sleep there.
 *
 * A booking becomes a check-in card and a check-out card. Everything between —
 * most of a trip — said nothing about accommodation at all, so a day in the
 * middle gave no answer to the one question a traveller asks at midnight.
 */
describe('tonight’s stay banner', () => {
  const STAY: ItineraryItem[] = [
    // Checked in before this trip's first visible day and out on its last, so
    // Day 1 is a night in the middle of the stay carrying no accommodation
    // card of its own — the case that previously showed nothing.
    {
      id: 'stay-in', date: '2026-10-03', time: '15:00',
      title: '入住 海雲台格蘭飯店', location: '釜山廣域市海雲台區', notes: '共 3 晚',
      type: 'HOTEL', scheduleFlexibility: 'fixed', fixedEventKind: 'accommodation',
    },
    {
      id: 'stay-out', date: DAY_6, time: '11:00',
      title: '退房 海雲台格蘭飯店', location: '釜山廣域市海雲台區', notes: '',
      type: 'HOTEL', scheduleFlexibility: 'fixed', fixedEventKind: 'accommodation',
    },
    { id: 'it-mid', date: DAY_5, time: '12:00', title: '午餐', location: '札嘎其市場', notes: '', type: 'FOOD' },
    { id: 'it-six', date: DAY_6, time: '12:00', title: '太宗臺', location: '太宗臺', notes: '', type: 'ACTIVITY' },
  ];

  beforeEach(() => seedStorage(STAY));

  const openDay = async (label: string) => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    await user.click(screen.getByText(label));
    return user;
  };

  it('names the hotel on a night in the middle of the stay', async () => {
    // Day 1 is 2026-10-05: inside the stay, but with no accommodation card.
    await openDay('Day 1');
    const banner = screen.getByTestId('stay-banner');
    expect(within(banner).getByText('海雲台格蘭飯店')).toBeTruthy();
    expect(within(banner).getByText('住宿')).toBeTruthy();
  });

  it('shows nothing on the morning they check out', async () => {
    // Day 2 is 2026-10-06 — the key goes back, so there is no room tonight.
    await openDay('Day 2');
    expect(screen.queryByTestId('stay-banner')).toBeNull();
  });
});
