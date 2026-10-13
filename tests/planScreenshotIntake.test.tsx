/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PlanScreenshotIntake from '../components/PlanScreenshotIntake';
import type { ParsedRental } from '../services/rentalIntake';
import type { ItinerarySlice } from '../services/itineraryImageSlices';

/**
 * 「新增一個上傳截圖的入口」, exercised by pressing it.
 *
 * The routing is covered where it lives, in `screenshotIntake.test.ts`. What
 * this file is for is the part that string assertions on a component have
 * repeatedly failed to catch tonight: whether the thing on screen actually
 * does what the handler behind it promises. A card was edited twice this week
 * that nothing rendered.
 */

const file = () => new File(['x'], 'shot.jpg', { type: 'image/jpeg' });

/** FileReader is jsdom's, and it does reach onload; the data is unused here. */
const ok = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) }) as unknown as Response;

afterEach(() => {
  // Explicit because globals are off in this config: without it the second
  // render finds two of every button and every query becomes ambiguous.
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (props: Partial<React.ComponentProps<typeof PlanScreenshotIntake>> = {}) => {
  const onAddRental = vi.fn<(rental: ParsedRental) => void>();
  const onSavePlaces = vi.fn<(slices: ItinerarySlice[]) => Promise<number>>(async () => 2);
  const onAddStayItems = vi.fn();
  const onAddFlightAnchors = vi.fn();
  const onStartTripFromFlights = vi.fn();
  render(
    <PlanScreenshotIntake
      destination="日本沖繩"
      destinationCountry="日本"
      onAddRental={onAddRental}
      onSavePlaces={onSavePlaces}
      onAddStayItems={onAddStayItems}
      onAddFlightAnchors={onAddFlightAnchors}
      onStartTripFromFlights={onStartTripFromFlights}
      tripStartDate="2026-11-05"
      tripEndDate="2026-11-10"
      {...props}
    />,
  );
  return { onAddRental, onSavePlaces, onAddStayItems, onAddFlightAnchors, onStartTripFromFlights };
};

const upload = () => fireEvent.change(screen.getByTestId('plan-screenshot-file'), {
  target: { files: [file()] },
});

describe('the screenshot entry', () => {
  /**
   * 「讀取很久」, then the measurement: the Founder's own LINE screenshot, run
   * against the deployed service, took 7 seconds to classify and 51 to read.
   * One unchanging label across the better part of a minute is
   * indistinguishable from a screen that has stopped.
   */
  /**
   * 「一直卡在這個畫面」 — stuck on 「看看這是什麼…」, which is the classify call.
   *
   * On the deployed service that call took 10.5s, then 23.9s, then 57.4s for
   * the same image as the rate limit tightened. It is also pure overhead
   * where the card has already said 「先補上航班資訊與住宿資訊」: a traveller
   * pressing 訂房 has answered the question the model was about to be asked.
   */
  it('skips classification when the traveller names the kind', async () => {
    const called: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      called.push(url);
      return Promise.resolve(ok({
        hotelName: '博多站前飯店',
        address: '福岡市博多區',
        checkInDate: '2026-11-05',
        checkOutDate: '2026-11-10',
      }));
    }));

    const { onAddStayItems } = mount({ offerKindShortcuts: ['flight', 'stay'] });
    fireEvent.click(screen.getByTestId('plan-screenshot-kind-stay'));
    upload();

    await waitFor(() => expect(onAddStayItems).toHaveBeenCalledTimes(1));
    // The classify route is never asked. The place lookup that follows is a
    // different service and not the one that was slow.
    expect(called).not.toContain('/api/screenshots/kind');
    expect(called[0]).toBe('/api/stays/parse-image');
  });

  /** The plain entry still works it out, because it has not been told. */
  it('still classifies when nobody said', async () => {
    const called: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      called.push(url);
      return Promise.resolve(url === '/api/screenshots/kind'
        ? ok({ kind: 'inspiration' })
        : ok({ slices: [{ type: 'place', title: '暖暮拉麵' }] }));
    }));

    mount({ offerKindShortcuts: ['flight', 'stay'] });
    fireEvent.click(screen.getByTestId('plan-screenshot-upload'));
    upload();

    await waitFor(() => expect(called.length).toBe(2));
    expect(called[0]).toBe('/api/screenshots/kind');
  });

  /** And the shortcuts are absent where the card never named anything. */
  it('offers no shortcuts outside the gate', () => {
    mount();
    expect(screen.queryByTestId('plan-screenshot-kinds')).toBeNull();
  });

  /**
   * 「我在成立這個旅冊的時候，一開始就已上傳機票，因此這個欄位這邊要先判讀用戶是否
   *   上傳過了」.
   *
   * The line above already said 先補上住宿資訊, singular. A 機票 button beside
   * it is the card contradicting itself one row later.
   */
  it('offers only what the trip is still missing', () => {
    mount({ offerKindShortcuts: ['stay'] });

    expect(screen.getByTestId('plan-screenshot-kind-stay')).toBeTruthy();
    expect(screen.queryByTestId('plan-screenshot-kind-flight')).toBeNull();
  });

  it('says which half of the wait it is in', async () => {
    let releaseParse: (value: unknown) => void = () => {};
    vi.stubGlobal('fetch', vi.fn((url: string) => (url === '/api/screenshots/kind'
      ? Promise.resolve(ok({ kind: 'inspiration' }))
      // The long half: 51 seconds against the real service.
      : new Promise(resolve => { releaseParse = resolve; }))));

    mount();
    upload();

    // Classification is done; the wait now names what it is actually doing.
    await screen.findByText(/讀取資料中，約需一分鐘/);

    releaseParse(ok({ slices: [{ type: 'place', title: '暖暮拉麵' }] }));
    await screen.findByText('上傳截圖');
  });

  it('offers one upload for everything the trip needs', () => {
    mount();
    expect(screen.getByTestId('plan-screenshot-upload')).toBeTruthy();
    // 靈感、租車、票券 — the traveller is told what may be thrown at it,
    // because an upload button that does not say what it takes gets used
    // for one thing only.
    const hint = screen.getByText(/機票、訂房、租車訂單、旅行靈感截圖都可以/);
    expect(hint).toBeTruthy();
  });

  it('puts a hire on the trip', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind'
        ? ok({ kind: 'rental' })
        : ok({ company: 'OTS レンタカー', pickUpDate: '2026-11-02', dropOffDate: '2026-11-04' }),
    )));

    const { onAddRental } = mount();
    upload();

    await waitFor(() => expect(onAddRental).toHaveBeenCalledTimes(1));
    expect(onAddRental.mock.calls[0]?.[0].company).toBe('OTS レンタカー');
    await screen.findByText(/已加到租車資訊/);
  });

  it('saves places from an inspiration screenshot', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind'
        ? ok({ kind: 'inspiration' })
        : ok({ slices: [{ type: 'food', title: '暖暮拉麵' }, { type: 'place', title: '美麗海水族館' }] }),
    )));

    const { onSavePlaces } = mount();
    upload();

    await waitFor(() => expect(onSavePlaces).toHaveBeenCalledTimes(1));
    expect(onSavePlaces.mock.calls[0]?.[0]).toHaveLength(2);
    // The count the caller reports, not the count that was read: those differ
    // when a place cannot be resolved, and the traveller is told the真實 one.
    await screen.findByText(/已存 2 個到收藏/);
  });

  /**
   * 「這個不能直接讓用戶在這個介面上傳」.
   *
   * These two used to be classified and then refused, with the traveller sent
   * to another screen — on a card whose own message says it cannot plan
   * without them. Two things on one screen arguing with each other.
   */
  it('files a hotel booking from here', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind'
        ? ok({ kind: 'stay' })
        : ok({
            hotelName: '博多站前飯店',
            address: '福岡市博多區',
            checkInDate: '2026-11-05',
            checkOutDate: '2026-11-10',
          }),
    )));

    const { onAddStayItems } = mount();
    upload();

    await waitFor(() => expect(onAddStayItems).toHaveBeenCalledTimes(1));
    // The booking's own cards, through the conversion 住宿資訊 uses — what
    // lands has to be the same record however it arrived.
    expect(onAddStayItems.mock.calls[0]?.[0].length).toBeGreaterThan(0);
    await screen.findByText(/博多站前飯店/);
  });

  /**
   * 「我傳的是這個」 — a friend's address, where the card asked for a hotel —
   * and then 「那這樣可以跳出顯示住宿日期讓用戶填寫」.
   *
   * No check-in and no check-out, because nobody books a friend's spare
   * room. Without a date nothing reaches the itinerary and the upload looks
   * like a silent failure; filling the trip's dates in silently was the
   * first answer, and asking is the better one — only the person going knows
   * which nights they are there.
   */
  const friendsAddress = () => vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
    url === '/api/screenshots/kind'
      ? ok({ kind: 'stay' })
      : url === '/api/places/resolve'
        ? ok({ placeId: 'p', latitude: 35.71, longitude: 139.79, name: 'ハーモニーレジデンス浅草' })
        : ok({ hotelName: 'ハーモニーレジデンス浅草', address: '東京都台東区寿4丁目6-2' }),
  )));

  it('asks for the dates instead of filing without them', async () => {
    friendsAddress();
    const { onAddStayItems } = mount();
    upload();

    const prompt = await screen.findByTestId('plan-stay-dates');
    expect(prompt.textContent).toContain('ハーモニーレジデンス浅草');
    expect(prompt.textContent).toContain('請填一下');
    // Nothing is filed while the question is open.
    expect(onAddStayItems).not.toHaveBeenCalled();
  });

  /** Seeded from the trip, so two characters change rather than eight typed. */
  it('starts from the trip dates', async () => {
    friendsAddress();
    mount();
    upload();

    await screen.findByTestId('plan-stay-dates');
    expect((screen.getByTestId('plan-stay-check-in') as HTMLInputElement).value)
      .toBe('2026-11-05');
    expect((screen.getByTestId('plan-stay-check-out') as HTMLInputElement).value)
      .toBe('2026-11-10');
  });

  it('files the stay on the dates the traveller typed', async () => {
    friendsAddress();
    const { onAddStayItems } = mount();
    upload();

    await screen.findByTestId('plan-stay-dates');
    fireEvent.change(screen.getByTestId('plan-stay-check-in'), { target: { value: '2026-11-06' } });
    fireEvent.change(screen.getByTestId('plan-stay-check-out'), { target: { value: '2026-11-08' } });
    fireEvent.click(screen.getByTestId('plan-stay-confirm'));

    await waitFor(() => expect(onAddStayItems).toHaveBeenCalledTimes(1));
    const items = onAddStayItems.mock.calls[0]?.[0] as Array<{ date?: string }>;
    expect(items[0]?.date).toBe('2026-11-06');
  });

  /**
   * One end is not an answer: a stay with only a check-in cannot say which
   * nights it covers, which is the whole reason it is being asked.
   */
  it('will not file on half an answer', async () => {
    friendsAddress();
    mount();
    upload();

    await screen.findByTestId('plan-stay-dates');
    fireEvent.change(screen.getByTestId('plan-stay-check-out'), { target: { value: '' } });

    expect((screen.getByTestId('plan-stay-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  /**
   * Linked to the place it is, before it lands.
   *
   * I first shipped this without the lookup and said what lands is the same
   * record however it arrived. It was not: a hotel with an address and no
   * `placeId` is invisible downstream — no photo, no map, and no travel time
   * into or out of the place they sleep.
   */
  it('links the hotel to its place, as 住宿資訊 does', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind' ? ok({ kind: 'stay' })
        : url === '/api/places/resolve'
          ? ok({ placeId: 'place-hakata', latitude: 33.5898, longitude: 130.4207, name: '博多站前飯店' })
          : ok({ hotelName: '博多站前飯店', address: '福岡市博多區', checkInDate: '2026-11-05', checkOutDate: '2026-11-10' }),
    )));

    const { onAddStayItems } = mount();
    upload();

    await waitFor(() => expect(onAddStayItems).toHaveBeenCalledTimes(1));
    const items = onAddStayItems.mock.calls[0]?.[0] as Array<{ placeId?: string }>;
    expect(items.some(item => item.placeId === 'place-hakata')).toBe(true);
  });

  /** A lookup that finds nothing must never hold the booking back. */
  it('still files the hotel when the lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/screenshots/kind') return Promise.resolve(ok({ kind: 'stay' }));
      if (url === '/api/places/resolve') return Promise.reject(new Error('offline'));
      return Promise.resolve(ok({ hotelName: '博多站前飯店', address: '福岡市博多區', checkInDate: '2026-11-05', checkOutDate: '2026-11-10' }));
    }));

    const { onAddStayItems } = mount();
    upload();

    await waitFor(() => expect(onAddStayItems).toHaveBeenCalledTimes(1));
    expect(onAddStayItems.mock.calls[0]?.[0].length).toBeGreaterThan(0);
  });

  it('files both legs of a flight from here', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind'
        ? ok({ kind: 'flight' })
        : ok({
            OUTBOUND: {
              departureAirport: '桃園國際機場',
              departureDate: '2026-11-05',
              departureTime: '14:20',
              arrivalAirport: 'OKA · Naha Airport',
              arrivalDate: '2026-11-05',
              arrivalTime: '18:40',
            },
            RETURN: {
              departureAirport: 'OKA · Naha Airport',
              departureDate: '2026-11-10',
              departureTime: '09:15',
            },
          }),
    )));

    const { onAddFlightAnchors } = mount();
    upload();

    await waitFor(() => expect(onAddFlightAnchors).toHaveBeenCalledTimes(1));
    const anchors = onAddFlightAnchors.mock.calls[0]?.[0] as Array<{ direction: string }>;
    expect(anchors).toHaveLength(2);
    // The direction comes from the envelope key, not the body: a leg that
    // disagreed with its own slot would file two outbounds.
    expect(anchors.map(anchor => anchor.direction)).toEqual(['OUTBOUND', 'RETURN']);
    await screen.findByText(/讀到 2 段航班/);
  });

  /**
   * A leg with no time anchors nothing, and everything downstream is built
   * from the date and the hour. Refused rather than filed with a blank.
   */
  /**
   * 「應該要跳出提示詢問用戶」.
   *
   * A ticket to 成田 on a 沖繩 trip is either the wrong picture or a
   * connection. Filing it quietly means the planner is later told a landing
   * time for a different journey as fact — so it is held and asked about at
   * the moment the picture was chosen, not reported later on another card.
   */
  it('asks before filing a flight that disagrees with the trip', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind'
        ? ok({ kind: 'flight' })
        : ok({
            OUTBOUND: {
              departureAirport: '桃園國際機場',
              departureDate: '2026-10-20',
              departureTime: '06:35',
              arrivalAirport: 'NRT · Narita International Airport',
              arrivalDate: '2026-10-20',
              arrivalTime: '11:00',
            },
          }),
    )));

    const { onAddFlightAnchors } = mount();
    upload();

    const confirm = await screen.findByTestId('plan-flight-confirm');
    // 「這張票是成田，但旅程是沖繩，確定嗎？」 — both facts in one sentence,
    // first, rather than a verdict followed by a list to assemble.
    const headline = screen.getByTestId('plan-flight-confirm-headline').textContent || '';
    expect(headline).toContain('這張票是');
    expect(headline).toContain('Narita International Airport');
    expect(headline).toContain('日本沖繩');
    expect(headline.endsWith('確定嗎？')).toBe(true);
    expect(confirm.textContent).toContain('2026-10-20');
    // Nothing is filed while the question is open; neither answer is default.
    expect(onAddFlightAnchors).not.toHaveBeenCalled();
  });

  it('files it anyway when the traveller says it is right', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind'
        ? ok({ kind: 'flight' })
        : ok({ OUTBOUND: {
            departureAirport: '桃園國際機場',
            departureDate: '2026-10-20',
            departureTime: '06:35',
            arrivalAirport: 'NRT · Narita International Airport',
          } }),
    )));

    const { onAddFlightAnchors } = mount();
    upload();

    fireEvent.click(await screen.findByTestId('plan-flight-confirm-add'));
    expect(onAddFlightAnchors).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('plan-flight-confirm')).toBeNull();
  });

  /**
   * 「跳出問用戶是否建立新旅行 或是要捨棄這個紀錄」.
   *
   * A ticket for another city in another month is rarely a mistake — it is
   * the next trip, read before anybody made it. Discarding it throws away a
   * booking somebody already paid for.
   */
  it('offers to start a new trip from the ticket', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind'
        ? ok({ kind: 'flight' })
        : ok({ OUTBOUND: {
            departureAirport: '桃園國際機場',
            departureDate: '2026-10-20',
            departureTime: '06:35',
            arrivalAirport: 'NRT · Narita International Airport',
            arrivalAirportIata: 'NRT',
          } }),
    )));

    const { onStartTripFromFlights, onAddFlightAnchors } = mount();
    upload();

    fireEvent.click(await screen.findByTestId('plan-flight-new-trip'));
    expect(onStartTripFromFlights).toHaveBeenCalledTimes(1);
    // The legs as read, so the new trip can take its dates and destination
    // from them. Anchors belong to a trip, and this one does not exist yet.
    expect(onStartTripFromFlights.mock.calls[0]?.[0]?.[0]?.departureDate).toBe('2026-10-20');
    expect(onAddFlightAnchors).not.toHaveBeenCalled();
  });

  /**
   * The question is only ever reached by a leg that already has a date —
   * that is what makes it an anchor — so the trip it would create is always
   * nameable. There is no case here where the offer is withheld.
   */
  it('offers the new trip whenever a flight is held', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind'
        ? ok({ kind: 'flight' })
        : ok({ OUTBOUND: {
            departureAirport: '桃園國際機場',
            departureDate: '2026-10-20',
            departureTime: '06:35',
            arrivalAirport: '某個沒人認得的機場',
          } }),
    )));

    mount();
    upload();

    await screen.findByTestId('plan-flight-confirm');
    expect(screen.getByTestId('plan-flight-new-trip')).toBeTruthy();
  });

  it('drops it when the traveller says it was the wrong picture', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind'
        ? ok({ kind: 'flight' })
        : ok({ OUTBOUND: {
            departureAirport: '桃園國際機場',
            departureDate: '2026-10-20',
            departureTime: '06:35',
            arrivalAirport: 'NRT · Narita International Airport',
          } }),
    )));

    const { onAddFlightAnchors } = mount();
    upload();

    fireEvent.click(await screen.findByTestId('plan-flight-confirm-cancel'));
    expect(onAddFlightAnchors).not.toHaveBeenCalled();
    expect(screen.queryByTestId('plan-flight-confirm')).toBeNull();
  });

  it('refuses a flight it could not fully read', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(
      url === '/api/screenshots/kind'
        ? ok({ kind: 'flight' })
        : ok({ OUTBOUND: { departureAirport: '桃園國際機場', departureDate: '2026-11-05' } }),
    )));

    const { onAddFlightAnchors } = mount();
    upload();

    await screen.findByText(/讀不出完整的日期與時間/);
    expect(onAddFlightAnchors).not.toHaveBeenCalled();
  });

  it('shows the server message when reading fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ error: '辨識服務忙碌中，請稍後再試。' }),
    } as unknown as Response)));

    mount();
    upload();

    await screen.findByText('辨識服務忙碌中，請稍後再試。');
  });

  /** A failed upload has to be retryable with the same picture. */
  it('lets the same file be picked again after a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ error: '辨識服務忙碌中，請稍後再試。' }),
    } as unknown as Response)));

    mount();
    upload();
    await screen.findByTestId('plan-screenshot-error');

    const input = screen.getByTestId('plan-screenshot-file') as HTMLInputElement;
    expect(input.value).toBe('');
  });
});
