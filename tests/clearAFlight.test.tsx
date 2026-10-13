/**
 * @vitest-environment jsdom
 *
 * 「這邊要可以重設 因為有可能會有傳錯或改航班的狀況」.
 *
 * A saved anchor could be edited field by field and never removed, so a
 * ticket read from the wrong screenshot had no way off the trip at all — and
 * a flight that changes is not an edit to the old one, it is a different
 * flight.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FlightAnchorsForm from '../components/FlightAnchorsForm';
import { reconcileFlightDerivedItems } from '../services/flightDerivedItems';

afterEach(cleanup);

const anchor = (direction: 'OUTBOUND' | 'RETURN', over: Record<string, unknown> = {}) => ({
  id: `f-${direction}`,
  direction,
  departureDate: direction === 'OUTBOUND' ? '2026-10-20' : '2026-10-24',
  departureTime: direction === 'OUTBOUND' ? '06:30' : '21:15',
  departureAirport: direction === 'OUTBOUND'
    ? 'TPE · Taiwan Taoyuan International Airport'
    : 'NRT · Narita International Airport',
  arrivalAirport: direction === 'OUTBOUND'
    ? 'NRT · Narita International Airport'
    : 'TPE · Taiwan Taoyuan International Airport',
  arrivalTime: direction === 'OUTBOUND' ? '11:00' : '23:55',
  airportArrivalBufferMinutes: 120,
  source: 'MANUAL',
  ...over,
}) as never;

type Props = React.ComponentProps<typeof FlightAnchorsForm>;

const mount = (props: Partial<Props> = {}) => {
  const onChange = vi.fn();
  render(
    <FlightAnchorsForm
      anchors={[anchor('OUTBOUND'), anchor('RETURN')]}
      onChange={onChange}
      destination="東京"
      startDate="2026-10-20"
      endDate="2026-10-24"
      flightMode="ROUND_TRIP"
      {...(props as Props)}
    />,
  );
  return { onChange };
};

describe('taking a flight back off the trip', () => {
  it('asks before removing one', () => {
    const { onChange } = mount();

    fireEvent.click(screen.getByTestId('clear-flight-OUTBOUND'));

    // Nothing happens on the first tap: an anchor is not only itself.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('clear-flight-confirm-OUTBOUND').textContent)
      .toContain('由它產生的卡片也會一起移除');
  });

  it('removes only the leg that was cleared', () => {
    const { onChange } = mount();

    fireEvent.click(screen.getByTestId('clear-flight-OUTBOUND'));
    fireEvent.click(screen.getByTestId('clear-flight-yes-OUTBOUND'));

    const kept = onChange.mock.calls[0]?.[0] as Array<{ direction: string }>;
    expect(kept).toHaveLength(1);
    expect(kept[0]?.direction).toBe('RETURN');
  });

  it('lets the traveller back out', () => {
    const { onChange } = mount();

    fireEvent.click(screen.getByTestId('clear-flight-RETURN'));
    fireEvent.click(screen.getByTestId('clear-flight-no-RETURN'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('clear-flight-confirm-RETURN')).toBeNull();
  });

  /** Nothing to clear on a leg that was never set. */
  it('offers no bin where there is no flight', () => {
    mount({ anchors: [anchor('OUTBOUND')] as never });

    expect(screen.getByTestId('clear-flight-OUTBOUND')).toBeTruthy();
    expect(screen.queryByTestId('clear-flight-RETURN')).toBeNull();
  });
});

/**
 * And the cards it generated go with it.
 *
 * This is the half the confirmation promises, and it is the reason the
 * confirmation exists: 抵達機場, 航班起飛 and 航班抵達 are not independent
 * entries somebody typed, they are consequences of the anchor.
 */
describe('what leaves with it', () => {
  it('drops the itinerary cards the anchor produced', () => {
    const outbound = anchor('OUTBOUND') as unknown as { id: string };
    const existing = [
      { id: `${outbound.id}-arrival`, title: '抵達機場', derivedFromFlightAnchorId: outbound.id },
      { id: 'own-1', title: '淺草寺' },
    ] as never;

    const kept = reconcileFlightDerivedItems(existing, [], new Set([outbound.id]));

    expect(kept.map(item => item.title)).toEqual(['淺草寺']);
  });

  /**
   * A companion's device has the items without ever having had the anchor,
   * and must not delete the owner's flights for both of them — which is what
   * the known-ids set is for.
   */
  it('keeps cards belonging to an anchor this device never had', () => {
    const existing = [
      { id: 'x-arrival', title: '抵達機場', derivedFromFlightAnchorId: 'f-theirs' },
    ] as never;

    const kept = reconcileFlightDerivedItems(existing, [], new Set());

    expect(kept).toHaveLength(1);
  });
});
