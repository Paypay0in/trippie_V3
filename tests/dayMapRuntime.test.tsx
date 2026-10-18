/**
 * @vitest-environment jsdom
 *
 * The 地圖模式 button has been in the day header all along — styled, labelled,
 * and wired to nothing. These assert it now does something, and that the map
 * is drawn beside the list rather than instead of it: the list is where times
 * are dragged, retimed and ticked.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ItineraryCalendar from '../components/ItineraryCalendar';
import DayMap from '../components/DayMap';
import { ItineraryItem } from '../types';

afterEach(cleanup);

const DAY = '2026-10-20';

const stop = (id: string, time: string, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id, title: id, location: id, notes: '', type: 'ACTIVITY', date: DAY, time,
  latitude: 35.6595, longitude: 139.7005, ...over,
} as ItineraryItem);

describe('the 地圖模式 button', () => {
  it('shows the map when pressed, and says so', () => {
    render(<ItineraryCalendar items={[stop('羽田機場', '08:00'), stop('渋谷', '10:00')]} startDate={DAY} endDate={DAY} />);

    expect(screen.queryByTestId('day-map')).toBeNull();

    fireEvent.click(screen.getByTestId('toggle-map-mode'));

    expect(screen.getByTestId('day-map')).toBeTruthy();
    expect(screen.getByTestId('toggle-map-mode').textContent).toContain('列表模式');
  });

  it('goes back', () => {
    render(<ItineraryCalendar items={[stop('渋谷', '10:00')]} startDate={DAY} endDate={DAY} />);

    fireEvent.click(screen.getByTestId('toggle-map-mode'));
    fireEvent.click(screen.getByTestId('toggle-map-mode'));

    expect(screen.queryByTestId('day-map')).toBeNull();
  });

  /** The map is added, not substituted. */
  it('keeps the timeline underneath', () => {
    render(<ItineraryCalendar items={[stop('渋谷', '10:00')]} startDate={DAY} endDate={DAY} />);

    fireEvent.click(screen.getByTestId('toggle-map-mode'));

    expect(document.querySelector('[data-item-id="渋谷"]')).toBeTruthy();
  });
});

describe('the picture itself', () => {
  it('asks our own server, never Google, and carries no key', () => {
    render(<DayMap items={[stop('a', '09:00'), stop('b', '11:00')]} />);

    const src = screen.getByTestId('day-map-image').getAttribute('src') || '';

    expect(src.startsWith('/api/maps/day?')).toBe(true);
    expect(src).not.toContain('googleapis');
    expect(src.toLowerCase()).not.toContain('key=');
  });

  /*
    A day showing four pins for five stops is a day the traveller has to count
    twice, so the ones that could not be placed are stated rather than dropped.
  */
  it('says how many stops it could not place', () => {
    render(<DayMap items={[
      stop('a', '09:00'),
      stop('b', '11:00', { latitude: undefined, longitude: undefined }),
    ]} />);

    expect(screen.getByTestId('day-map-unmapped').textContent).toContain('1');
  });

  it('says nothing about missing pins when none are missing', () => {
    render(<DayMap items={[stop('a', '09:00')]} />);

    expect(screen.queryByTestId('day-map-unmapped')).toBeNull();
  });

  it('draws no map at all when nothing has coordinates', () => {
    render(<DayMap items={[stop('a', '09:00', { latitude: undefined, longitude: undefined })]} />);

    expect(screen.queryByTestId('day-map-image')).toBeNull();
    expect(screen.getByTestId('day-map-empty').textContent).toContain('還沒連結地圖');
  });

  /** A broken image with no explanation is the failure this avoids. */
  it('says so when the picture cannot be drawn', () => {
    render(<DayMap items={[stop('a', '09:00')]} />);

    fireEvent.error(screen.getByTestId('day-map-image'));

    expect(screen.getByTestId('day-map-failed').textContent).toContain('畫不出地圖');
  });
});

/**
 * 「雖地圖不能用但我希望我去點 1 的時候會出現地名」.
 *
 * The map is a PNG — the pins carry no events and nothing can be attached to
 * them. A numbered pin whose name appears nowhere on the screen is a riddle,
 * so the numbers are listed under it, which is what the Founder's own mock had.
 */
describe('which pin is which', () => {
  it('names every pin, with its number', () => {
    render(<DayMap items={[stop('羽田機場', '08:00'), stop('淺草寺', '12:00')]} />);

    const legend = screen.getByTestId('day-map-legend');

    expect(legend.textContent).toContain('1');
    expect(legend.textContent).toContain('羽田機場');
    expect(legend.textContent).toContain('2');
    expect(legend.textContent).toContain('淺草寺');
  });

  it('shows the time beside the name', () => {
    render(<DayMap items={[stop('淺草寺', '12:00')]} />);

    expect(screen.getByTestId('day-map-legend').textContent).toContain('12:00');
  });

  /*
    The numbers follow the day, not the drawable subset — the same rule the
    pins follow, because the two have to agree about what 2 means.
  */
  it('numbers by position in the day', () => {
    render(<DayMap items={[
      stop('a', '09:00'),
      stop('b', '10:00', { latitude: undefined, longitude: undefined }),
      stop('c', '11:00'),
    ]} />);

    const rows = screen.getByTestId('day-map-legend').querySelectorAll('button');

    expect(rows).toHaveLength(2);
    expect(rows[1].textContent).toContain('3');
  });

  /** Tapping a row goes to the card, which is what the pin was reached for. */
  it('scrolls to the stop it names', () => {
    const scrollIntoView = vi.fn();
    render(
      <>
        <DayMap items={[stop('淺草寺', '12:00')]} />
        <div data-item-id="淺草寺" />
      </>,
    );
    const card = document.querySelector('[data-item-id="淺草寺"]') as HTMLElement;
    card.scrollIntoView = scrollIntoView;

    fireEvent.click(screen.getByTestId('day-map-legend-淺草寺'));

    expect(scrollIntoView).toHaveBeenCalled();
  });
});

/**
 * 「機場這張 我覺得有跟沒有一樣。要不多一個選項：是否包含機場？因為這樣根本無法判斷
 * 市區其他景點的相對距離」.
 *
 * His last day: four stops across Tokyo, then 抵達機場 and 航班起飛 at Narita
 * sixty kilometres out. The picture stayed zoomed to the whole Kantō plain and
 * the four city stops were one blob.
 */
describe('機場要不要畫在地圖上', () => {
  const lastDay: ItineraryItem[] = [
    stop('chavaty', '12:00', { latitude: 35.6659, longitude: 139.7105, title: 'CHAVATY' }),
    stop('tsutaya', '13:30', { latitude: 35.6489, longitude: 139.6998, title: '代官山 蔦屋書店' }),
    stop('sky', '17:15', { latitude: 35.6580, longitude: 139.7016, title: '澀谷 SKY' }),
    stop('to-airport', '19:15', {
      latitude: 35.7720, longitude: 140.3929, title: '抵達機場',
      derivedFromFlightAnchorId: 'anchor-1',
    }),
    stop('takeoff', '21:15', { latitude: 35.7720, longitude: 140.3929, title: '航班起飛', type: 'FLIGHT' }),
  ];

  it('預設不畫機場，而且說出來', () => {
    render(<DayMap items={lastDay} />);

    expect(screen.getByTestId('day-map-unmapped').textContent).toContain('機場（2 個）');
    expect(screen.queryByText('抵達機場')).toBeNull();
    expect(screen.getByText('CHAVATY')).toBeTruthy();
  });

  it('按一下就把機場加回來', () => {
    render(<DayMap items={lastDay} />);

    fireEvent.click(screen.getByTestId('toggle-airport-stops'));

    expect(screen.getByText('抵達機場')).toBeTruthy();
    expect(screen.getByTestId('toggle-airport-stops').textContent).toContain('不含機場');
  });

  /* A day with no airport has nothing to toggle. */
  it('沒有機場的那天不出現這顆按鈕', () => {
    render(<DayMap items={[lastDay[0], lastDay[1]]} />);

    expect(screen.queryByTestId('toggle-airport-stops')).toBeNull();
  });
});

/**
 * 「這是從收藏放上來的店 是不是要將收藏筆記也顯示在行程表上」.
 *
 * The notes were already being shown — Lonich simply has none saved, so its
 * card read as a name over a blank. The collection screen answered that with
 * `placeBasics` months ago and this screen never got it.
 */
describe('沒有筆記的行程卡', () => {
  afterEach(() => vi.unstubAllGlobals());

  const lonich = stop('lonich', '15:00', {
    title: 'Lonich', location: 'Lonich', placeId: 'ChIJ_lonich',
    latitude: 35.7040, longitude: 139.7930,
  });

  it('改用 Google 自己的那一行，而不是留白', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ basics: { kind: '酒吧', rating: 4.6, ratingCount: 180 } }),
    })) as never);

    render(<ItineraryCalendar items={[lonich]} startDate={DAY} endDate={DAY} />);

    const line = await screen.findByTestId('item-basics-lonich');
    expect(line.textContent).toContain('酒吧');
    expect(line.textContent).toContain('4.6');
  });

  /* A place that already carries notes keeps them and is not asked about. */
  it('有筆記的不會被這一行取代', () => {
    vi.stubGlobal('fetch', vi.fn() as never);

    render(<ItineraryCalendar
      items={[{ ...lonich, savedTravelNotes: [{ id: 'n1', text: '酒類買手店' }] } as never]}
      startDate={DAY}
      endDate={DAY}
    />);

    expect(screen.queryByTestId('item-basics-lonich')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

/**
 * 「住宿點的圖釘呢」.
 *
 * 朋友家 is a stay spanning several nights, not a stop on any one of them, so
 * a day with no 住宿 card drew no house at all — and the hotel is the thing
 * every other pin is read against.
 */
describe('the bed on the day map', () => {
  /* The pair the stay intake reads: 入住 on one day, 退房 on another. */
  const stay = (over: Partial<ItineraryItem> = {}): ItineraryItem[] => [
    {
      id: 'stay-in', title: '入住 朋友家', location: '朋友家', notes: '', type: 'HOTEL',
      date: DAY, time: '15:00', fixedEventKind: 'accommodation',
      latitude: 35.7100, longitude: 139.7950, ...over,
    },
    {
      id: 'stay-out', title: '退房 朋友家', location: '朋友家', notes: '', type: 'HOTEL',
      date: '2026-10-24', time: '10:00', fixedEventKind: 'accommodation',
      latitude: 35.7100, longitude: 139.7950, ...over,
    },
  ] as ItineraryItem[];

  it('draws the house from the stay, on a day with no 住宿 card', () => {
    render(<ItineraryCalendar
      items={[...stay(), stop('淺草寺', '10:30', { date: '2026-10-21' }), stop('晴空塔', '14:00', { date: '2026-10-21', longitude: 139.81 })]}
      startDate="2026-10-21"
      endDate="2026-10-24"
    />);

    fireEvent.click(screen.getByTestId('toggle-map-mode'));

    const src = (screen.getByTestId('day-map-image') as HTMLImageElement).src;
    expect(decodeURIComponent(src)).toContain('icons/lodging-pin.png');
  });

  /* Once, not twice: a day that carries its own 住宿 card already has a house. */
  it('does not add a second one on the check-in day', () => {
    render(<ItineraryCalendar items={[...stay(), stop('淺草寺', '18:00')]} startDate={DAY} endDate={DAY} />);

    fireEvent.click(screen.getByTestId('toggle-map-mode'));

    const src = decodeURIComponent((screen.getByTestId('day-map-image') as HTMLImageElement).src);
    expect(src.split('lodging-pin.png').length - 1).toBe(1);
  });

  it('names it in the list under the map', () => {
    render(<ItineraryCalendar
      items={[...stay(), stop('淺草寺', '10:30', { date: '2026-10-21' })]}
      startDate="2026-10-21"
      endDate="2026-10-24"
    />);

    fireEvent.click(screen.getByTestId('toggle-map-mode'));

    expect(screen.getByTestId('day-map-legend').textContent).toContain('朋友家');
  });

  /* A stay nobody resolved has no coordinates, and an invented pin is worse. */
  it('draws nothing for a stay with no location', () => {
    render(<ItineraryCalendar
      items={[...stay({ latitude: undefined, longitude: undefined }), stop('淺草寺', '10:30', { date: '2026-10-21' })]}
      startDate="2026-10-21"
      endDate="2026-10-24"
    />);

    fireEvent.click(screen.getByTestId('toggle-map-mode'));

    expect(decodeURIComponent((screen.getByTestId('day-map-image') as HTMLImageElement).src))
      .not.toContain('lodging-pin.png');
  });
});
