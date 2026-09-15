/**
 * @vitest-environment jsdom
 *
 * Runtime proof for the flight anchors screen: one outbound + one return,
 * airport autocomplete, canonical identity, prefill and save/reopen.
 */
import React, { useState } from 'react';
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FlightAnchorsForm from '../components/FlightAnchorsForm';
import { FlightAnchor, TripFlightMode } from '../types';
import { readDraftStore, writeDraftStore, TripDraft } from '../services/tripPersistence';

const TRIP = { destination: 'Busan', startDate: '2026-09-14', endDate: '2026-10-07' };

/** Host that holds the saved anchors the way App.tsx does, so save/reopen is real. */
function Host({ initial = [], homeAirportIata, oneWay = false }: { initial?: FlightAnchor[]; homeAirportIata?: string; oneWay?: boolean }) {
  const [anchors, setAnchors] = useState<FlightAnchor[]>(initial);
  const [mode, setMode] = useState<TripFlightMode>(oneWay ? 'ONE_WAY' : 'ROUND_TRIP');
  return (
    <>
      <FlightAnchorsForm
        anchors={anchors}
        onChange={setAnchors}
        flightMode={mode}
        onFlightModeChange={setMode}
        homeAirportIata={homeAirportIata}
        {...TRIP}
      />
      <pre data-testid="saved">{JSON.stringify(anchors)}</pre>
    </>
  );
}

const savedAnchors = (): FlightAnchor[] => JSON.parse(screen.getByTestId('saved').textContent || '[]');

beforeEach(() => cleanup());

describe('flight anchors form runtime', () => {
  it('renders exactly one outbound and one return card, and no add-flight buttons', async () => {
    render(<Host />);
    expect(screen.getAllByTestId('flight-card-OUTBOUND')).toHaveLength(1);
    expect(screen.getAllByTestId('flight-card-RETURN')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /＋\s*去程航班/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /＋\s*回程航班/ })).toBeNull();
  });

  it('collapses duplicated legacy return cards to a single return', () => {
    const legacy: FlightAnchor[] = [
      { id: 'r1', direction: 'RETURN', departureDate: '', departureTime: '', departureAirport: '', airportArrivalBufferMinutes: 120, source: 'MANUAL' },
      { id: 'r2', direction: 'RETURN', departureDate: '2026-10-07', departureTime: '17:30', departureAirport: 'Gimhae International Airport', airportArrivalBufferMinutes: 120, source: 'MANUAL' },
      { id: 'o1', direction: 'OUTBOUND', departureDate: '2026-09-14', departureTime: '12:30', departureAirport: 'Toronto Pearson International Airport', airportArrivalBufferMinutes: 120, source: 'MANUAL' },
    ];
    render(<Host initial={legacy} />);
    expect(screen.getAllByTestId('flight-summary-RETURN')).toHaveLength(1);
  });

  it('prefills trip dates and the obvious Busan arrival airport', () => {
    render(<Host />);
    expect((screen.getByLabelText('去程出發日期') as HTMLInputElement).value).toBe('2026-09-14');
    expect((screen.getByLabelText('回程出發日期') as HTMLInputElement).value).toBe('2026-10-07');
    const outbound = screen.getByTestId('flight-card-OUTBOUND');
    expect(within(outbound).getByText('PUS · Gimhae International Airport')).toBeTruthy();
  });

  it('autocompletes an airport and saves the canonical identity', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const outbound = screen.getByTestId('flight-card-OUTBOUND');
    const departureInput = within(outbound).getByLabelText('去程出發機場');
    await user.type(departureInput, 'Toronto');

    const options = within(outbound).getAllByRole('button', { name: /Toronto/ });
    expect(options.length).toBeGreaterThanOrEqual(2); // YYZ and YTZ

    await user.click(screen.getByTestId(`departure-airport-${departureInput.getAttribute('data-testid')?.split('departure-airport-')[1]}-option-YYZ`));

    await user.type(screen.getByLabelText('去程出發時間'), '12:30');
    await user.type(screen.getByLabelText('回程出發時間'), '17:30');
    await user.click(screen.getByRole('button', { name: /儲存航班/ }));

    const outboundSaved = savedAnchors().find(item => item.direction === 'OUTBOUND');
    expect(outboundSaved?.departureAirportIata).toBe('YYZ');
    expect(outboundSaved?.departureAirportCity).toBe('Toronto');
    expect(outboundSaved?.arrivalAirportIata).toBe('PUS');
  });

  it('mirrors the outbound pair onto the return leg', () => {
    render(<Host homeAirportIata="YYZ" />);
    const ret = screen.getByTestId('flight-card-RETURN');
    expect(within(ret).getByText('PUS · Gimhae International Airport')).toBeTruthy();
    expect(within(ret).getByText('YYZ · Toronto Pearson International Airport')).toBeTruthy();
  });

  it('reports the exact missing field instead of a generic message', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: /儲存航班/ }));
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('請選擇去程出發時間')).toBeTruthy();
    expect(within(alert).getByText('請選擇去程出發機場')).toBeTruthy();
    expect(alert.textContent).not.toContain('請完成航班日期、時間與出發機場');
    expect(savedAnchors()).toHaveLength(0);
  });

  it('hides the return leg in 單程 mode', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('radio', { name: '單程' }));
    expect(screen.queryByTestId('flight-card-RETURN')).toBeNull();
    expect(screen.getAllByTestId('flight-card-OUTBOUND')).toHaveLength(1);
  });

  it('keeps the saved airport after save, close and reopen', async () => {
    const user = userEvent.setup();
    render(<Host homeAirportIata="YYZ" />);
    await user.type(screen.getByLabelText('去程出發時間'), '12:30');
    await user.type(screen.getByLabelText('回程出發時間'), '17:30');
    await user.click(screen.getByRole('button', { name: /儲存航班/ }));

    expect(screen.getByTestId('flight-summary-OUTBOUND').textContent).toContain('YYZ · Toronto Pearson International Airport');

    await user.click(screen.getByRole('button', { name: /編輯/ }));
    const outbound = screen.getByTestId('flight-card-OUTBOUND');
    expect(within(outbound).getByText('YYZ · Toronto Pearson International Airport')).toBeTruthy();
    expect(within(outbound).getByText('PUS · Gimhae International Airport')).toBeTruthy();
  });
});

describe('flight time validation (Founder runtime bug)', () => {
  /**
   * The reported symptom: 12:30 is visible in the field, yet the field is red
   * and save still reports 「請選擇去程出發時間」. The cause was a frozen error
   * snapshot, so these drive the exact sequence — fail a save first, then fill.
   */
  const fillOutboundAirports = async (user: ReturnType<typeof userEvent.setup>) => {
    const outbound = screen.getByTestId('flight-card-OUTBOUND');
    await user.type(within(outbound).getByLabelText('去程出發機場'), 'Taipei');
    await user.click(within(outbound).getByText('Taiwan Taoyuan International Airport'));
  };

  it('shows no errors before the first save attempt', () => {
    render(<Host />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('§8 clears the time error as soon as a valid time is entered', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: /儲存航班/ }));
    expect(screen.getByRole('alert').textContent).toContain('請選擇去程出發時間');

    await user.type(screen.getByLabelText('去程出發時間'), '12:30');

    // No second save attempt required.
    expect(screen.getByRole('alert').textContent).not.toContain('請選擇去程出發時間');
    expect(screen.getByLabelText('去程出發時間').closest('label')?.className).not.toContain('rose');
  });

  it('§5 the Founder fixture passes validation and saves', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(screen.getByLabelText('去程出發時間'), '12:30');
    await fillOutboundAirports(user);
    await user.type(screen.getByLabelText('回程出發時間'), '17:30');
    await user.click(screen.getByRole('button', { name: /儲存航班/ }));

    expect(screen.queryByRole('alert')).toBeNull();
    const outbound = savedAnchors().find(item => item.direction === 'OUTBOUND');
    expect(outbound?.departureTime).toBe('12:30');
    expect(outbound?.departureDate).toBe('2026-09-14');
    expect(outbound?.departureAirportIata).toBe('TPE');
    expect(outbound?.arrivalAirportIata).toBe('PUS');
  });

  it('§7 the return leg behaves identically', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: /儲存航班/ }));
    expect(screen.getByRole('alert').textContent).toContain('請選擇回程出發時間');

    await user.type(screen.getByLabelText('回程出發時間'), '17:30');
    expect(screen.getByRole('alert').textContent).not.toContain('請選擇回程出發時間');

    await user.type(screen.getByLabelText('去程出發時間'), '12:30');
    await fillOutboundAirports(user);
    await user.click(screen.getByRole('button', { name: /儲存航班/ }));
    expect(savedAnchors().find(item => item.direction === 'RETURN')?.departureTime).toBe('17:30');
  });

  it('§6 the time survives save, close and reopen', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(screen.getByLabelText('去程出發時間'), '12:30');
    await fillOutboundAirports(user);
    await user.type(screen.getByLabelText('回程出發時間'), '17:30');
    await user.click(screen.getByRole('button', { name: /儲存航班/ }));

    expect(screen.getByTestId('flight-summary-OUTBOUND').textContent).toContain('12:30');

    await user.click(screen.getByRole('button', { name: /編輯/ }));
    expect((screen.getByLabelText('去程出發時間') as HTMLInputElement).value).toBe('12:30');
    expect((screen.getByLabelText('回程出發時間') as HTMLInputElement).value).toBe('17:30');
  });

  it('the input renders from the same state that save writes', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(screen.getByLabelText('去程出發時間'), '12:30');
    await fillOutboundAirports(user);
    await user.type(screen.getByLabelText('回程出發時間'), '17:30');

    const displayed = (screen.getByLabelText('去程出發時間') as HTMLInputElement).value;
    await user.click(screen.getByRole('button', { name: /儲存航班/ }));
    expect(savedAnchors().find(item => item.direction === 'OUTBOUND')?.departureTime).toBe(displayed);
  });

  it('cancelling clears the error state for the next edit', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: /儲存航班/ }));
    expect(screen.getByRole('alert')).toBeTruthy();

    // Two elements answer to 取消: the header X icon and the footer button.
    const cancelButton = screen.getAllByRole('button', { name: '取消' })
      .find(node => node.textContent?.trim() === '取消')!;
    await user.click(cancelButton);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('time field works without the native time control (Safari bug)', () => {
  /**
   * Safari/macOS renders <input type="time"> but, for a React-controlled field,
   * fires no input/change and leaves .value as '' — the Founder saw 12:30 on
   * screen while the element reported nothing. The field is now a text input.
   */
  it('is not a native time control', () => {
    render(<Host />);
    const input = screen.getByLabelText('去程出發時間') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.placeholder).toBe('HH:MM');
  });

  it('typing digits formats to HH:MM and commits the canonical value', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const input = screen.getByLabelText('去程出發時間') as HTMLInputElement;
    await user.type(input, '1230');
    expect(input.value).toBe('12:30');

    await user.click(screen.getByRole('button', { name: /儲存航班/ }));
    expect(screen.getByRole('alert').textContent).not.toContain('請選擇去程出發時間');
  });

  it('accepts a typed colon and a pasted value', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const input = screen.getByLabelText('去程出發時間') as HTMLInputElement;
    await user.type(input, '05:30');
    expect(input.value).toBe('05:30');

    await user.clear(input);
    await user.paste('23:45');
    expect(input.value).toBe('23:45');
  });

  it('keeps the canonical field empty while the entry is partial', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const input = screen.getByLabelText('去程出發時間') as HTMLInputElement;
    await user.type(input, '12');
    await user.click(screen.getByRole('button', { name: /儲存航班/ }));
    // Honest: 12 is not a time, so the error stands.
    expect(screen.getByRole('alert').textContent).toContain('請選擇去程出發時間');
  });

  it('rejects an out-of-range time rather than storing nonsense', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const input = screen.getByLabelText('去程出發時間') as HTMLInputElement;
    await user.type(input, '2599');
    await user.click(screen.getByRole('button', { name: /儲存航班/ }));
    expect(screen.getByRole('alert').textContent).toContain('請選擇去程出發時間');
  });

  it('§7 saves the Founder one-way fixture end to end', async () => {
    const user = userEvent.setup();
    render(<Host oneWay />);
    await user.type(screen.getByLabelText('去程出發時間'), '1230');

    const outbound = screen.getByTestId('flight-card-OUTBOUND');
    await user.type(within(outbound).getByLabelText('去程出發機場'), 'Taipei');
    await user.click(within(outbound).getByText('Taiwan Taoyuan International Airport'));
    await user.click(screen.getByRole('button', { name: /儲存航班/ }));

    expect(screen.queryByRole('alert')).toBeNull();
    const saved = savedAnchors();
    expect(saved).toHaveLength(1);
    expect(saved[0].departureTime).toBe('12:30');
    expect(saved[0].departureAirportIata).toBe('TPE');
    expect(saved[0].arrivalAirportIata).toBe('PUS');

    await user.click(screen.getByRole('button', { name: /編輯/ }));
    expect((screen.getByLabelText('去程出發時間') as HTMLInputElement).value).toBe('12:30');
  });

  it('keeps a leading zero exactly', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const input = screen.getByLabelText('去程出發時間') as HTMLInputElement;
    await user.type(input, '0530');
    expect(input.value).toBe('05:30');
  });
});

describe('flight anchor persistence', () => {
  it('survives a reload and collapses duplicate legacy anchors on read', async () => {
    localStorage.clear();
    const now = new Date().toISOString();
    const anchors: FlightAnchor[] = [
      { id: 'o1', direction: 'OUTBOUND', departureDate: '2026-09-14', departureTime: '12:30', departureAirport: 'Toronto Pearson International Airport', departureAirportIata: 'YYZ', departureAirportCity: 'Toronto', arrivalAirport: 'Gimhae International Airport', arrivalAirportIata: 'PUS', airportArrivalBufferMinutes: 120, source: 'MANUAL' },
      { id: 'r-empty', direction: 'RETURN', departureDate: '2026-10-07', departureTime: '17:30', departureAirport: 'Gimhae International Airport', airportArrivalBufferMinutes: 120, source: 'MANUAL' },
      { id: 'r2', direction: 'RETURN', departureDate: '2026-10-07', departureTime: '17:30', departureAirport: 'Gimhae International Airport', departureAirportIata: 'PUS', arrivalAirport: 'Toronto Pearson International Airport', arrivalAirportIata: 'YYZ', airportArrivalBufferMinutes: 120, source: 'MANUAL' },
    ];
    writeDraftStore(
      [{ id: 'trip-1', name: 'Busan', destination: 'Busan', startDate: '2026-09-14', endDate: '2026-10-07', expenses: [], companions: [], shoppingList: [], flightAnchors: anchors, createdAt: now, updatedAt: now } as unknown as TripDraft],
      'trip-1',
    );

    const reloaded = readDraftStore().drafts[0].flightAnchors || [];
    expect(reloaded.map(item => item.direction)).toEqual(['OUTBOUND', 'RETURN']);
    expect(reloaded.find(item => item.direction === 'RETURN')?.id).toBe('r2');
    expect(reloaded.find(item => item.direction === 'OUTBOUND')?.departureAirportIata).toBe('YYZ');
    expect(reloaded.find(item => item.direction === 'RETURN')?.arrivalAirportIata).toBe('YYZ');
  });
});
