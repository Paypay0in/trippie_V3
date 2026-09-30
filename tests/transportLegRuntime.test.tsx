/**
 * @vitest-environment jsdom
 *
 * How you get from one place on the plan to the next.
 *
 * Transit is the default because it is the only mode that answers where this
 * app is used: South Korea publishes no Google driving or walking routes, so
 * the existing DRIVE-only estimate had been failing silently since the app
 * learned to plan Busan. A mode with no route must say so rather than borrow
 * another mode's number.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import TransportLeg from '../components/TransportLeg';

const GAMCHEON = { latitude: 35.0975, longitude: 129.0107, title: '甘川文化村' };
const HAEUNDAE = { latitude: 35.1587, longitude: 129.1604, title: '海雲台' };

const TRANSIT_ANSWER = {
  mode: 'TRANSIT',
  available: true,
  durationSeconds: 4672,
  distanceMeters: 20809,
  steps: [
    { travelMode: 'TRANSIT', durationSeconds: 680, lineName: '서구2', departureStop: '감천문화마을', arrivalStop: '忠武洞交叉路', stopCount: 14 },
    { travelMode: 'WALK', durationSeconds: 49 },
    { travelMode: 'TRANSIT', durationSeconds: 2750, lineName: '1003', departureStop: '西区厅', arrivalStop: '海云台海水浴场', stopCount: 27 },
  ],
};

/** Records what each request asked for, and answers per mode. */
const requestedModes: string[] = [];
const answerByMode: Record<string, unknown> = {};

beforeEach(() => {
  requestedModes.length = 0;
  answerByMode.TRANSIT = TRANSIT_ANSWER;
  answerByMode.DRIVE = { mode: 'DRIVE', available: false };
  answerByMode.WALK = { mode: 'WALK', available: false };
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    requestedModes.push(body.mode);
    return { ok: true, status: 200, json: async () => answerByMode[body.mode] } as unknown as Response;
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the transport leg', () => {
  it('asks for transit first and names the mode beside the number', async () => {
    render(<TransportLeg origin={GAMCHEON} destination={HAEUNDAE} />);

    await waitFor(() => expect(screen.getByText(/約 78 分 · 大眾運輸/)).toBeTruthy());
    expect(requestedModes).toEqual(['TRANSIT']);
  });

  it('opens into the actual lines, stops and walking legs', async () => {
    const user = userEvent.setup();
    render(<TransportLeg origin={GAMCHEON} destination={HAEUNDAE} />);
    await waitFor(() => expect(screen.getByText(/約 78 分/)).toBeTruthy());

    await user.click(screen.getByRole('button', { name: '交通方式說明' }));

    expect(screen.getByText('1003')).toBeTruthy();
    expect(screen.getByText(/西区厅 → 海云台海水浴场/)).toBeTruthy();
    expect(screen.getByText(/27 站/)).toBeTruthy();
    expect(screen.getByText('步行 1 分')).toBeTruthy();
  });

  it('names the reason in Korea, where the absence has one', async () => {
    const user = userEvent.setup();
    render(<TransportLeg origin={GAMCHEON} destination={HAEUNDAE} destinationCountry="韓國" />);
    await waitFor(() => expect(screen.getByText(/約 78 分/)).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /步行/ }));

    await waitFor(() => expect(screen.getByText('🚫 因法規限制，Google 地圖無法以「步行」查詢')).toBeTruthy());
    // Pressing it again will not help, so the traveller is sent somewhere useful.
    expect(screen.getByText('當地人用 Naver Map 或 KakaoMap，這兩款查得到。')).toBeTruthy();
  });

  it('says plainly that a mode has no route here, rather than showing nothing', async () => {
    const user = userEvent.setup();
    render(<TransportLeg origin={GAMCHEON} destination={HAEUNDAE} />);
    await waitFor(() => expect(screen.getByText(/約 78 分/)).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /開車/ }));

    await waitFor(() => expect(screen.getByText('這個地區查不到開車路線')).toBeTruthy());
    expect(requestedModes).toEqual(['TRANSIT', 'DRIVE']);
    // Never the transit number under a driving label.
    expect(screen.queryByText(/約 78 分/)).toBeNull();
  });

  it('states both numbers when the plan leaves less time than the journey takes', async () => {
    render(<TransportLeg origin={GAMCHEON} destination={HAEUNDAE} availableMinutes={20} />);

    await waitFor(() => expect(screen.getByTestId('transport-too-tight')).toBeTruthy());
    expect(screen.getByText('這段只留了 20 分鐘，實際要 78 分鐘。')).toBeTruthy();
  });

  it('says nothing about tightness when there is time enough', async () => {
    render(<TransportLeg origin={GAMCHEON} destination={HAEUNDAE} availableMinutes={120} />);

    await waitFor(() => expect(screen.getByText(/約 78 分/)).toBeTruthy());
    expect(screen.queryByTestId('transport-too-tight')).toBeNull();
  });
});

/**
 * Mounted where the traveller actually looks.
 *
 * A component can be correct and still be on none of the screens that matter —
 * StayUploadCard shipped beside the wrong one of App's two render sites and was
 * unreachable. So this asserts against the 規劃 screen itself.
 */
describe('the transport leg, on the planning screen', () => {
  const DAY = '2026-10-03';
  const DRAFT_ID = 'draft-transport';

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
      id: DRAFT_ID, name: '釜山測試行程', destination: '釜山',
      startDate: DAY, endDate: '2026-10-04',
      expenses: [], companions: [], shoppingList: [],
      itinerary: [
        { id: 'it-a', date: DAY, time: '09:00', durationMinutes: 60, title: '甘川文化村', location: '甘川文化村', notes: '', type: 'ACTIVITY', placeId: 'p-a', latitude: 35.0975, longitude: 129.0107 },
        { id: 'it-b', date: DAY, time: '10:20', title: '海雲台', location: '海雲台', notes: '', type: 'ACTIVITY', placeId: 'p-b', latitude: 35.1587, longitude: 129.1604 },
      ],
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    }]));
    localStorage.setItem('trippie_active_trip_id', DRAFT_ID);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/routes/leg')) {
        const body = JSON.parse(String(init?.body || '{}'));
        return { ok: true, status: 200, json: async () => answerByMode[body.mode] } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }));
  });

  it('sits between the two cards, and states the squeeze', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText('旅行'));
    await user.click(screen.getByText(/繼續旅程/));
    await user.click(screen.getByText('規劃'));

    await waitFor(() => expect(screen.getByTestId('transport-leg')).toBeTruthy());
    expect(screen.getByText(/約 78 分 · 大眾運輸/)).toBeTruthy();
    // 09:00 + 60 minutes leaves 20 before 10:20, against a 78 minute journey.
    expect(screen.getByText('這段只留了 20 分鐘，實際要 78 分鐘。')).toBeTruthy();
  });
});
