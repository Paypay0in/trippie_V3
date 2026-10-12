/**
 * @vitest-environment jsdom
 *
 * 「要他們先傳航班與住宿資訊 並提示：要先確定航班與住宿地點 才能相應依據這兩個點
 *   做規劃」.
 *
 * Asked for as a gate rather than a hint, and that was the right call: a plan
 * written without knowing where the traveller sleeps reads exactly like one
 * written with it, right up to the day they try to use it. Nothing on the
 * card could have told them which one they had.
 *
 * Exercised by pressing it rather than by reading the component's source —
 * the gate is only worth anything if the button is really gone.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TripPlanOverview from '../components/TripPlanOverview';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const flight = {
  id: 'f-1',
  direction: 'OUTBOUND',
  departureDate: '2026-11-05',
  departureTime: '14:20',
  departureAirport: '桃園國際機場',
  arrivalDate: '2026-11-05',
  arrivalTime: '18:40',
  arrivalAirport: 'OKA · Naha Airport',
};

const stay = {
  name: '博多站前飯店',
  address: '福岡市博多區博多站前 2-1-1',
  checkInDate: '2026-11-05',
  checkOutDate: '2026-11-10',
  nights: ['2026-11-05', '2026-11-06'],
  itemId: 'i-1',
};

type Props = React.ComponentProps<typeof TripPlanOverview>;

const mount = (props: Partial<Props> = {}) => render(
  <TripPlanOverview
    expenses={[]}
    shoppingList={[]}
    itinerary={[]}
    companionCount={1}
    dateRange="2026/11/05 - 2026/11/10"
    destination="日本沖繩"
    destinationCountry="日本"
    tripStartDate="2026-11-05"
    tripEndDate="2026-11-10"
    onContinuePlanning={vi.fn()}
    onEnterTripMode={vi.fn()}
    onManageMembers={vi.fn()}
    onExploreInspiration={vi.fn()}
    savedInspirations={[]}
    communityPosts={[]}
    travelRules={undefined}
    {...(props as Props)}
  />,
);

describe('a trip with no flights and no hotel', () => {
  it('does not offer to plan anything', () => {
    mount();

    expect(screen.getByTestId('plan-anchors-required')).toBeTruthy();
    // The box and the button are gone, not merely disabled: a disabled
    // button invites pressing it and explains nothing.
    expect(screen.queryByText('AI 幫我想方案')).toBeNull();
  });

  it('says which two things it needs, and why', () => {
    mount();

    expect(screen.getByText(/先補上航班資訊與住宿資訊/)).toBeTruthy();
    expect(screen.getByText(/知道幾點落地才知道第一天剩多少時間/)).toBeTruthy();
  });

  /**
   * 「為什麼分兩個格子啊」.
   *
   * The gate said 「去補航班住宿」 and the upload directly under it was how you
   * added them — in a second dashed frame of its own. Two frames for one job
   * reads as two unrelated things.
   *
   * Asserted by containment rather than by eye: the upload has to be inside
   * the gate, which is the only way to say they are one thing.
   */
  it('puts the upload inside the gate, not in a second box', () => {
    mount({
      onAddRentalFromScreenshot: vi.fn(),
      onSavePlacesFromScreenshot: vi.fn(),
      onAddStayItemsFromScreenshot: vi.fn(),
      onAddFlightAnchorsFromScreenshot: vi.fn(),
    } as never);

    const gate = screen.getByTestId('plan-anchors-required');
    expect(gate.contains(screen.getByTestId('plan-screenshot-intake'))).toBe(true);
  });

  /**
   * And the faster path gets the button. A screenshot of the booking is the
   * whole of what is being asked for; typing it in is the fallback for when
   * the picture cannot be read, so it is a line of text rather than a
   * gradient button competing with the upload.
   */
  it('offers the screenshot first and typing as the fallback', () => {
    mount({
      onAddAnchors: vi.fn(),
      onAddRentalFromScreenshot: vi.fn(),
      onSavePlacesFromScreenshot: vi.fn(),
      onAddStayItemsFromScreenshot: vi.fn(),
      onAddFlightAnchorsFromScreenshot: vi.fn(),
    } as never);

    expect(screen.getByTestId('plan-screenshot-upload')).toBeTruthy();
    expect(screen.getByTestId('plan-anchors-cta').textContent).toContain('手動填寫');
  });

  it('offers to take them there', () => {
    const onAddAnchors = vi.fn();
    mount({ onAddAnchors });

    fireEvent.click(screen.getByTestId('plan-anchors-cta'));
    expect(onAddAnchors).toHaveBeenCalledTimes(1);
  });

  /** One missing is still missing, and the wording has to name only that one. */
  it('names only what is actually absent', () => {
    mount({ flightAnchors: [flight] as never });

    expect(screen.getByText('先補上住宿資訊')).toBeTruthy();
  });
});

/**
 * 「有一個問題點：我的標題是沖繩」.
 *
 * The trip was 沖繩 11/05–11/10 and the flights were to 成田 on 10/20. The
 * gate was satisfied — there were flights and there was a hotel — so the
 * planner would have been told those dates and that airport as fact.
 */
describe('a trip whose flights contradict it', () => {
  const wrongFlight = { ...flight, departureDate: '2026-10-20', arrivalAirport: 'NRT · Narita International Airport' };

  it('says so, on the screen where the consequence lands', () => {
    mount({ flightAnchors: [wrongFlight] as never, stays: [stay] as never });

    const warning = screen.getByTestId('plan-anchor-contradictions');
    expect(warning.textContent).toContain('2026-10-20');
    expect(warning.textContent).toContain('不會看到這些航班');
  });

  /**
   * And the contradicted facts are withheld rather than sent with a caveat.
   * The model has no way to weigh our doubt against our own precise times.
   */
  it('does not tell the planner the flights it does not trust', async () => {
    const sent: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      sent.push(String(init?.body));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ requestId: 'r-1', options: [], sources: [], grounded: true }),
      } as unknown as Response);
    }));

    mount({ flightAnchors: [wrongFlight] as never, stays: [stay] as never });
    fireEvent.change(screen.getByPlaceholderText(/例如：我想滑雪/), { target: { value: '想走走' } });
    fireEvent.click(screen.getByText('AI 幫我想方案'));

    await waitFor(() => expect(sent.length).toBeGreaterThan(0));
    const body = sent.find(entry => entry.includes('anchorsBrief')) || '';
    expect(body).not.toContain('2026-10-20');
    expect(body).not.toContain('Narita');
  });
});

describe('a trip that has both', () => {
  it('lets the traveller ask', () => {
    mount({ flightAnchors: [flight] as never, stays: [stay] as never });

    expect(screen.queryByTestId('plan-anchors-required')).toBeNull();
    expect(screen.queryByTestId('plan-anchor-contradictions')).toBeNull();
    expect(screen.getByText('AI 幫我想方案')).toBeTruthy();
  });

  /**
   * The facts, in the request. This is the half the Founder actually asked
   * for — the gate only makes sure they exist.
   */
  it('tells the planner when they land and where they sleep', async () => {
    const sent: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      sent.push(String(init?.body));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ requestId: 'r-1', options: [], sources: [], grounded: true }),
      } as unknown as Response);
    }));

    mount({ flightAnchors: [flight] as never, stays: [stay] as never });

    fireEvent.change(screen.getByPlaceholderText(/例如：我想滑雪/), {
      target: { value: '想帶長輩走走' },
    });
    fireEvent.click(screen.getByText('AI 幫我想方案'));

    await waitFor(() => expect(sent.length).toBeGreaterThan(0));
    const body = sent.find(entry => entry.includes('anchorsBrief')) || '';
    expect(body).toContain('18:40');
    expect(body).toContain('博多站前飯店');
    expect(body).toContain('同一天的地點要在同一區');
  });
});
