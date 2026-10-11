/**
 * @vitest-environment jsdom
 *
 * 「這個是要提示用戶上傳機票旅館等住宿」.
 *
 * 匯入旅程資料・機票・住宿・訂單 went to the blank new-trip form — the same
 * destination as 新增旅程 beside it — while the readers it promised sat inside
 * trips, reachable only by somebody who had already typed in the dates their
 * boarding pass was holding.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import BookingImportSheet from '../components/BookingImportSheet';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderSheet = () => {
  const onCreate = vi.fn();
  const onManual = vi.fn();
  render(<BookingImportSheet onCancel={() => {}} onCreate={onCreate} onManual={onManual} />);
  return { onCreate, onManual };
};

const drop = (testId: string, parsed: unknown) => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => parsed })));
  const file = new File(['x'], 'pass.jpg', { type: 'image/jpeg' });
  fireEvent.click(screen.getByTestId(testId));
  fireEvent.change(screen.getByTestId('import-file'), { target: { files: [file] } });
};

beforeEach(() => {
  // jsdom's FileReader gives no result for a stub File; the component only
  // needs the base64 half of a data URL, so a fixed one keeps the test about
  // the flow rather than about encoding.
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
    Object.defineProperty(this, 'result', { value: 'data:image/jpeg;base64,AAAA', writable: true });
    this.onload?.({} as ProgressEvent<FileReader>);
  });
});

describe('importing a trip from a booking', () => {
  it('offers flights and stays separately, rather than guessing the document', () => {
    renderSheet();
    expect(screen.getByTestId('import-flight')).toBeTruthy();
    expect(screen.getByTestId('import-stay')).toBeTruthy();
  });

  /** Nothing to create from an empty sheet, and the button should say so. */
  it('will not create a trip before anything has been read', () => {
    renderSheet();
    expect(screen.getByTestId('import-create').hasAttribute('disabled')).toBe(true);
  });

  it('reads a boarding pass and shows the trip it implies', async () => {
    renderSheet();
    drop('import-flight', {
      direction: 'OUTBOUND', arrivalAirportIata: 'PUS', departureDate: '2026-10-02',
    });
    await waitFor(() => expect(screen.getByTestId('import-readout')).toBeTruthy());
    expect(screen.getByText('Busan')).toBeTruthy();
    expect(screen.getByText('讀到 1 張機票')).toBeTruthy();
  });

  /**
   * A misread date found on this screen costs a retry; the same date found
   * weeks later is on a trip the traveller believes they typed themselves.
   */
  it('shows what was read before saving anything', async () => {
    const { onCreate } = renderSheet();
    drop('import-flight', { direction: 'OUTBOUND', departureDate: '2026-10-02' });
    await waitFor(() => expect(screen.getByTestId('import-readout')).toBeTruthy());
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('hands the derived trip over on 建立旅程', async () => {
    const { onCreate } = renderSheet();
    drop('import-flight', {
      direction: 'OUTBOUND', arrivalAirportIata: 'PUS', departureDate: '2026-10-02',
    });
    await waitFor(() => expect(screen.getByTestId('import-readout')).toBeTruthy());
    fireEvent.click(screen.getByTestId('import-create'));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ destination: 'Busan', startDate: '2026-10-02' }),
      expect.anything(),
    );
  });

  /** A one-way flight has no return; saying so beats inventing a date. */
  it('says the return is unknown rather than filling one in', async () => {
    renderSheet();
    drop('import-flight', { direction: 'OUTBOUND', departureDate: '2026-10-02' });
    await waitFor(() => expect(screen.getByTestId('import-dates')).toBeTruthy());
    expect(screen.getByTestId('import-dates').textContent).toContain('回程未知');
  });

  /**
   * The server words its failures for the traveller, and whether to retry is
   * the whole of what they need.
   */
  it('shows what the server said when a photo cannot be read', async () => {
    renderSheet();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, json: async () => ({ error: '這張看不清楚，換一張試試。' }),
    })));
    fireEvent.click(screen.getByTestId('import-stay'));
    fireEvent.change(screen.getByTestId('import-file'), {
      target: { files: [new File(['x'], 'b.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(screen.getByTestId('import-error').textContent)
      .toBe('這張看不清楚，換一張試試。'));
  });

  /** Some confirmations are a photo of a screen of a PDF. */
  it('keeps a way out for a booking nothing can read', () => {
    const { onManual } = renderSheet();
    fireEvent.click(screen.getByTestId('import-manual'));
    expect(onManual).toHaveBeenCalled();
  });
});
