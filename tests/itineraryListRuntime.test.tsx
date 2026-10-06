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

/*
  Derived from the clock, not written down.

  The itinerary only offers days that have not happened yet — 「ai排行程會排到已經
  失效的日期」 — so a fixture with fixed dates stops exercising this the moment the
  real date passes it. These did, overnight.
*/
const isoDay = (offset: number): string => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const DAY_5 = isoDay(1);
const DAY_6 = isoDay(2);
const DRAFT_ID = 'draft-list';

/** The ticket's fixture, plus one Day 5 item to drag across to. */
const itinerary: ItineraryItem[] = [
  { id: 'it-day5', date: DAY_5, time: '10:00', durationMinutes: 60, title: '甘川文化村', location: '甘川文化村', notes: '', type: 'ACTIVITY' },
  { id: 'it-a', date: DAY_6, time: '11:00', durationMinutes: 180, title: 'SPA LAND Centum City', location: 'SPA LAND Centum City', notes: '', type: 'ACTIVITY' },
  { id: 'it-b', date: DAY_6, time: '14:30', durationMinutes: 120, title: '新世界百貨 Centum City', location: '新世界百貨 Centum City', notes: '', type: 'ACTIVITY' },
  { id: 'it-c', date: DAY_6, time: '17:00', durationMinutes: 90, title: 'Place C', location: 'Place C', notes: '', type: 'ACTIVITY' },
];

const seedStorage = (items: ItineraryItem[] = itinerary, flightAnchors: unknown[] = []) => {
  localStorage.clear();
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
    id: DRAFT_ID, name: '釜山測試行程', destination: '釜山',
    startDate: DAY_5, endDate: DAY_6,
    expenses: [], companions: [], shoppingList: [], itinerary: items,
    ...(flightAnchors.length ? { flightAnchors, flightMode: 'ONE_WAY' } : {}),
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
      type: 'HOTEL', fixedEventKind: 'accommodation',
    },
    {
      id: 'stay-out', date: DAY_6, time: '11:00',
      title: '退房 海雲台格蘭飯店', location: '釜山廣域市海雲台區', notes: '',
      type: 'HOTEL', fixedEventKind: 'accommodation',
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
    // The bed icon carries the meaning; a 住宿 label beside it would spend the
    // row's width twice on the same word, at the name's expense.
    expect(within(banner).queryByText('住宿')).toBeNull();
    expect(within(banner).getByText(/詳情/)).toBeTruthy();
  });

  it('offers to add one on the morning they check out, with no room that night', async () => {
    // Day 2 is 2026-10-06 — the key goes back, so there is no room tonight.
    await openDay('Day 2');
    expect(screen.queryByTestId('stay-banner')).toBeNull();
    expect(within(screen.getByTestId('stay-banner-empty')).getByText('新增住宿資訊')).toBeTruthy();
  });

  it('opens the stay sheet from a night whose check-in card is on another day', async () => {
    const user = await openDay('Day 1');
    await user.click(screen.getByTestId('stay-banner'));

    const sheet = await screen.findByRole('dialog', { name: '住宿詳情' });
    // What someone standing outside a hotel at 23:00 needs: which one, when,
    // and where — not a form with fourteen editable fields.
    expect(within(sheet).getByText('海雲台格蘭飯店')).toBeTruthy();
    expect(within(sheet).getByText(/10\/03/)).toBeTruthy();
    expect(within(sheet).getByRole('link', { name: /在地圖中查看/ })).toBeTruthy();
  });

  it('shows no call or website button when the place could not be resolved', async () => {
    // Every Google-sourced detail is best effort. A button that dials nothing
    // is worse than a smaller sheet.
    const user = await openDay('Day 1');
    await user.click(screen.getByTestId('stay-banner'));
    const sheet = await screen.findByRole('dialog', { name: '住宿詳情' });

    expect(within(sheet).queryByRole('link', { name: /致電/ })).toBeNull();
    expect(within(sheet).queryByRole('link', { name: /前往官網/ })).toBeNull();
  });

  it('shows the photo the places endpoint nests, and credits it', async () => {
    // The endpoint answers { photo: { imageUrl, attribution } }. Reading
    // imageUrl off the top level found nothing and fell back to the bed icon,
    // which looks like a hotel with no photograph rather than a bug.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith('/api/places/resolve')) {
        return { ok: true, json: async () => ({ placeId: 'p1', address: '海雲台' }) };
      }
      if (path.endsWith('/api/places/details')) {
        return { ok: true, json: async () => ({ phone: '+82 51-742-2121', website: 'https://example.com' }) };
      }
      if (path.endsWith('/api/places/photo')) {
        return { ok: true, json: async () => ({ photo: { imageUrl: 'https://img.example/a.jpg', attribution: { uri: 'https://maps.example/x' } } }) };
      }
      return originalFetch(url as RequestInfo, init);
    }) as unknown as typeof fetch;

    try {
      const user = await openDay('Day 1');
      await user.click(screen.getByTestId('stay-banner'));
      const sheet = await screen.findByRole('dialog', { name: '住宿詳情' });

      // Queried by tag: the photo sits beside the name it illustrates, so its
      // alt is empty and it is correctly not exposed as an image to a reader.
      await waitFor(() => expect(sheet.querySelector('img')).toBeTruthy());
      expect(sheet.querySelector('img')?.getAttribute('src')).toBe('https://img.example/a.jpg');
      expect(within(sheet).getByLabelText('查看照片來源')).toBeTruthy();
      // And the contact buttons appear once their values arrive.
      expect(within(sheet).getByRole('link', { name: /致電/ })).toBeTruthy();
      expect(within(sheet).getByRole('link', { name: /前往官網/ })).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('closes again', async () => {
    const user = await openDay('Day 1');
    await user.click(screen.getByTestId('stay-banner'));
    await screen.findByRole('dialog', { name: '住宿詳情' });
    await user.click(screen.getByLabelText('關閉'));
    expect(screen.queryByRole('dialog', { name: '住宿詳情' })).toBeNull();
  });
});

describe('a night with no room booked', () => {
  beforeEach(() => seedStorage([
    { id: 'it-only', date: DAY_5, time: '12:00', title: '午餐', location: '札嘎其市場', notes: '', type: 'FOOD' },
  ]));

  it('says so rather than looking the same as a booked night', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    expect(screen.queryByTestId('stay-banner')).toBeNull();
    expect(within(screen.getByTestId('stay-banner-empty')).getByText('新增住宿資訊')).toBeTruthy();
  });
});

/**
 * Longer trips move hotels. The banner has to name the right one for the
 * night being looked at, including the day the traveller changes over.
 */
describe('two hotels on one trip', () => {
  beforeEach(() => seedStorage([
    {
      id: 'a-in', date: isoDay(0), time: '15:00', title: '入住 海雲台格蘭飯店',
      location: '海雲台', notes: '', type: 'HOTEL',
      fixedEventKind: 'accommodation',
    },
    {
      id: 'a-out', date: DAY_5, time: '11:00', title: '退房 海雲台格蘭飯店',
      location: '海雲台', notes: '', type: 'HOTEL',
      fixedEventKind: 'accommodation',
    },
    {
      id: 'b-in', date: DAY_5, time: '15:00', title: '入住 西面商務旅館',
      location: '西面', notes: '', type: 'HOTEL',
      fixedEventKind: 'accommodation',
    },
    {
      id: 'b-out', date: isoDay(3), time: '11:00', title: '退房 西面商務旅館',
      location: '西面', notes: '', type: 'HOTEL',
      fixedEventKind: 'accommodation',
    },
  ]));

  it('names the hotel they move into on the changeover day, not the one they left', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    // The first tab is the changeover day: out of the first hotel that
    // morning, into the second that afternoon. Tonight is the second one.
    const banner = screen.getByTestId('stay-banner');
    expect(within(banner).getByText('西面商務旅館')).toBeTruthy();
    expect(within(banner).queryByText('海雲台格蘭飯店')).toBeNull();
  });

  it('names the second hotel on the night after as well', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    await user.click(screen.getByText('Day 2'));

    expect(within(screen.getByTestId('stay-banner')).getByText('西面商務旅館')).toBeTruthy();
  });
});

/**
 * A booked room is a commitment. The hour you walk in is not.
 *
 * These cards were marked fixed, which put a lock badge on them and took away
 * the drag handle — so arriving late, dropping bags early, or reordering the
 * afternoon around check-in all became impossible on the one card that is
 * genuinely flexible about its time.
 */
describe('a stay can be moved; a flight cannot', () => {
  beforeEach(() => seedStorage([
    {
      id: 'stay-in', date: DAY_5, time: '15:00', title: '入住 海雲台格蘭飯店',
      location: '海雲台', notes: '', type: 'HOTEL', fixedEventKind: 'accommodation',
    },
    {
      id: 'flight', date: DAY_5, time: '18:00', title: '航班起飛',
      location: '金海國際機場', notes: '', type: 'FLIGHT',
      scheduleFlexibility: 'fixed', fixedEventKind: 'flight',
    },
  ]));

  it('leaves the stay unlocked', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    expect(screen.queryByTestId('fixed-badge-stay-in')).toBeNull();
    // The flight beside it keeps its lock, so this is not just "no badges".
    expect(screen.getByTestId('fixed-badge-flight')).toBeTruthy();
  });
});

/**
 * Entering a landing time must be enough.
 *
 * The transfer card was created once, when a booking was added, so saving an
 * arrival time afterwards changed nothing and the only way to see it was to
 * delete the stay and add it again — asking the traveller to work around the
 * shape of the code. It is derived now, so both ends keep it current.
 */
describe('the airport transfer follows the flight', () => {
  const STAY_ONLY: ItineraryItem[] = [
    {
      id: 'stay-in', date: DAY_5, time: '15:00', title: '入住 海雲台格蘭飯店',
      location: '海雲台', notes: '', type: 'HOTEL', fixedEventKind: 'accommodation',
    },
    {
      id: 'stay-out', date: '2026-10-08', time: '11:00', title: '退房 海雲台格蘭飯店',
      location: '海雲台', notes: '', type: 'HOTEL', fixedEventKind: 'accommodation',
    },
  ];

  beforeEach(() => {
    // No route estimate: the card must still appear, without a duration.
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
    seedStorage(STAY_ONLY, [
      {
        id: 'anchor-out', direction: 'OUTBOUND',
        departureDate: DAY_5, departureTime: '09:30', departureAirport: '桃園國際機場',
        arrivalDate: DAY_5, arrivalTime: '13:05', arrivalAirport: '金海國際機場',
        airportArrivalBufferMinutes: 120, source: 'MANUAL',
      },
    ]);
  });

  it('shows the ride in, two hours after landing', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    const transfer = await screen.findByRole('heading', { name: /前往 海雲台格蘭飯店/ });
    const card = transfer.closest('[data-item-id]') as HTMLElement;
    /*
      Read off the input, not off the text.

      「拖曳時間不方便」: the time on a card is a native time input now, so the
      phone's own picker opens on tap instead of the hour being reachable only
      by dragging in 30-minute steps. A value is not text content.
    */
    // Landing 13:05, out of the airport around 15:05.
    expect((within(card).getByLabelText(/前往 海雲台格蘭飯店 的開始時間/) as HTMLInputElement).value).toBe('15:05');
    expect(within(card).getByText(/入境與提領行李/)).toBeTruthy();
  });

  it('moves a check-in that was still on the uninformed default', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    await screen.findByRole('heading', { name: /前往 海雲台格蘭飯店/ });
    // Asserted on what was stored, not on the rendered time: storage is what
    // reaches the other traveller's phone, and it reads unambiguously.
    await waitFor(() => {
      const checkIn = persisted().find(item => item.title === '入住 海雲台格蘭飯店');
      // Out of the terminal at 15:05, through the door at 15:35. The ride is a
      // step of its own, so check-in never shares a minute with the transfer.
      expect(checkIn?.time).toBe('15:35');
    });
  });
});

/**
 * Landing belongs on the day it happens.
 *
 * The timeline held the two steps before take-off and then nothing until the
 * hotel, so the moment the traveller actually reaches the country was absent
 * from their itinerary entirely.
 */
describe('the landing card', () => {
  beforeEach(() => {
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
    seedStorage([], [
      {
        id: 'anchor-out', direction: 'OUTBOUND',
        departureDate: DAY_5, departureTime: '16:35', departureAirport: '桃園國際機場',
        arrivalDate: DAY_5, arrivalTime: '20:15', arrivalAirport: '金海國際機場',
        airportArrivalBufferMinutes: 120, source: 'MANUAL',
      },
    ]);
  });

  it('shows the landing, at its airport and its hour', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    const landing = await screen.findByText('航班抵達');
    const card = landing.closest('[class*="rounded-[20px]"]') as HTMLElement;
    expect(within(card).getByText('20:15')).toBeTruthy();
    expect(within(card).getByText(/金海國際機場/)).toBeTruthy();
  });

  it('sits after take-off, so the day reads in order', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    await screen.findByText('航班抵達');

    const titles = Array.from(document.querySelectorAll('h4, h3'))
      .map(node => node.textContent?.trim())
      .filter(title => title === '抵達機場' || title === '航班起飛' || title === '航班抵達');
    expect(titles).toEqual(['抵達機場', '航班起飛', '航班抵達']);
  });
});
