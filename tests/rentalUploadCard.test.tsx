/**
 * @vitest-environment jsdom
 *
 * 租車資訊 — 「可以在安排行程那加上租車訂單等 啥的 讓用戶可以上傳資訊」.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import RentalUploadCard from '../components/RentalUploadCard';
import { ParsedRental } from '../services/rentalIntake';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

beforeEach(() => {
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
    Object.defineProperty(this, 'result', { value: 'data:image/jpeg;base64,AAAA', writable: true });
    this.onload?.({} as ProgressEvent<FileReader>);
  });
});

const okinawa: ParsedRental = {
  company: 'OTS レンタカー',
  pickUpDate: '2026-10-03', pickUpTime: '10:00',
  dropOffDate: '2026-10-05', dropOffTime: '18:00',
  pickUpLocation: '那覇空港営業所',
};

const open = (rentals: ParsedRental[] = []) => {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  render(<RentalUploadCard rentals={rentals} onAdd={onAdd} onRemove={onRemove} />);
  return { onAdd, onRemove };
};

const upload = (testId: string, parsed: unknown, ok = true) => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => parsed })));
  fireEvent.change(screen.getByTestId('rental-file'), {
    target: { files: [new File(['x'], 'r.jpg', { type: 'image/jpeg' })] },
  });
};

describe('with nothing uploaded yet', () => {
  it('says what it will read, rather than only 上傳', () => {
    open();
    expect(screen.getByText('自動讀出租車公司、取車與還車時間')).toBeTruthy();
  });

  it('sends the confirmation to the rental reader, not the stay one', async () => {
    const { onAdd } = open();
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      seen.push(String(url));
      return { ok: true, json: async () => okinawa };
    }));
    fireEvent.change(screen.getByTestId('rental-file'), {
      target: { files: [new File(['x'], 'r.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(okinawa));
    expect(seen).toEqual(['/api/rentals/parse-image']);
  });

  it('shows what the server said when it cannot be read', async () => {
    open();
    upload('rental-upload', { error: '這張截圖看不出租車公司，請手動輸入。' }, false);
    await waitFor(() => expect(screen.getByTestId('rental-error').textContent)
      .toBe('這張截圖看不出租車公司，請手動輸入。'));
  });
});

describe('once a hire is on the trip', () => {
  it('shows the company and the span', () => {
    open([okinawa]);
    expect(screen.getByText('OTS レンタカー')).toBeTruthy();
    expect(screen.getByText('10/03 10:00 – 10/05 18:00')).toBeTruthy();
  });

  /**
   * The whole reason the card exists: 「是租兩天的車等 但旅行有五天」. The
   * traveller sees which days the car covers instead of the app deciding five
   * days are drivable because two of them are.
   */
  it('says how many days actually have a car', () => {
    open([okinawa]);
    expect(screen.getByTestId('rental-days-0').textContent).toBe('這 3 天有車');
  });

  it('claims no days when only one end was read', () => {
    open([{ company: 'Hertz', pickUpDate: '2026-10-03' }]);
    expect(screen.queryByTestId('rental-days-0')).toBeNull();
    expect(screen.getByText('10/03')).toBeTruthy();
  });

  it('warns on a confirmation the reader was unsure about', () => {
    open([{ ...okinawa, isUncertain: true }]);
    expect(screen.getByText(/讀不清楚/)).toBeTruthy();
  });

  it('removes one by its own position', () => {
    const { onRemove } = open([okinawa, { company: 'Hertz' }]);
    fireEvent.click(screen.getByTestId('rental-remove-1'));
    expect(onRemove).toHaveBeenCalledWith(1);
  });
});

/**
 * tests/transportLegRuntime.test.tsx records StayUploadCard shipping beside
 * the wrong one of App's two trip render sites, and being invisible.
 */
describe('where it is mounted', () => {
  const APP = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');

  it('appears at both of App’s render sites, like the stay card', () => {
    const rentals = APP.split('{rentalCard}').length - 1;
    const stays = APP.split('<StayUploadCard').length - 1;
    expect(rentals).toBe(stays);
    expect(rentals).toBeGreaterThan(1);
  });
});

/** Recording only: the planner asks later, it does not decide now. */
describe('it plans nothing by itself', () => {
  it('never reaches into the transport card', () => {
    const leg = readFileSync(resolve(__dirname, '../components/TransportLeg.tsx'), 'utf8');
    expect(leg).not.toContain('rental');
    expect(leg).not.toContain('carRentals');
  });
});
