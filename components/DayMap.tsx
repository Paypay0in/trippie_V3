import React, { useState } from 'react';
import { MapPinned } from 'lucide-react';
import { ItineraryItem } from '../types';
import { dayMapSrc, mappableStops, stopsOnTheGround } from '../services/dayMapImage';

/**
 * The day, drawn.
 *
 * 「行程的地圖模式」. The picture comes from our own server, which is the only
 * thing holding a Maps key — see `/api/maps/day`. That is why this is an `img`
 * and not a map you can drag: the Founder chose the version that ships without
 * a browser-side key.
 *
 * Stops with no coordinates are not drawn and are not hidden either: the count
 * is stated, because a day that shows four pins for five stops is a day the
 * traveller has to count twice.
 */
interface Props {
  items: ItineraryItem[];
  /** Road geometry per consecutive pair, when it has been fetched. */
  encodedPaths?: string[];
}

const DayMap: React.FC<Props> = ({ items, encodedPaths }) => {
  const [failed, setFailed] = useState(false);
  /*
    「最後一天會跨國！」 — a day ending with 航班抵達 abroad drew one line across
    the sea and squashed four real stops in Tokyo into a dot. A day's map is
    about moving between places on the ground. See `stopsOnTheGround`.
  */
  /*
    「機場這張 我覺得有跟沒有一樣 … 因為這樣根本無法判斷市區其他景點的相對距離」.

    Dropping the landing abroad was only half of it: 成田 is still sixty
    kilometres out, so the picture stayed zoomed to the whole Kantō plain and
    the four stops in Tokyo were one blob. A map of a day answers 「how far apart
    are these」, and at that zoom it cannot answer anything.

    Off by default, because the city is the part of the day being looked at.
    The airport is one tap away and every stop stays in the list below either
    way — this hides a pin, never an item.
  */
  const [withAirport, setWithAirport] = useState(false);
  const isAirportStop = (item: ItineraryItem) =>
    item.type === 'FLIGHT' || Boolean(item.derivedFromFlightAnchorId);
  const airportCount = items.filter(isAirportStop).length;
  const shown = withAirport ? items : items.filter(item => !isAirportStop(item));

  /*
    「住宿點在地圖上可以是放一個小房子嗎」 — a hotel is where the day starts and
    ends rather than the third thing you do, and a numbered pin says 「go here,
    third」 about the building you woke up in. See `lodging`.
  */
  const stops = mappableStops(stopsOnTheGround(shown))
    .map(stop => (stop.item.type === 'HOTEL' || stop.item.fixedEventKind === 'accommodation'
      ? { ...stop, lodging: true }
      : stop));
  const unmapped = shown.length - stops.length;

  if (stops.length === 0) {
    return (
      <div data-testid="day-map-empty" className="rounded-[22px] border border-dashed border-[#e6e3f3] bg-white px-4 py-8 text-center">
        <MapPinned size={18} className="mx-auto text-slate-300" />
        <p className="mt-2 text-xs font-bold text-slate-400">
          {items.length === 0 ? '這一天還沒有行程' : '這一天的行程都還沒連結地圖'}
        </p>
      </div>
    );
  }

  return (
    <div data-testid="day-map" className="overflow-hidden rounded-[22px] border border-[#eceaf5] bg-white">
      {failed ? (
        <div data-testid="day-map-failed" className="px-4 py-8 text-center text-xs font-bold text-slate-400">
          現在畫不出地圖，請稍後再試。
        </div>
      ) : (
        <img
          data-testid="day-map-image"
          /* Static Maps fetches a custom icon itself, so it needs an absolute URL. */
          src={dayMapSrc({
            stops,
            encodedPaths,
            width: 640,
            height: 400,
            origin: typeof window === 'undefined' ? undefined : window.location.origin,
          })}
          alt={`這一天 ${stops.length} 個地點的地圖`}
          className="block h-auto w-full"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      {/*
        Which pin is which.

        「雖地圖不能用但我希望我去點 1 的時候會出現地名」. The map is a PNG, so the
        pins carry no events and nothing can be attached to them — but a
        numbered pin whose name is nowhere on the screen is a riddle, and the
        Founder's own mock had this list under the map from the start.

        Tapping a row scrolls to that stop's card, which is the thing he was
        reaching for when he pressed the pin: the times, the notes, the photo.
      */}
      <ul data-testid="day-map-legend" className="divide-y divide-slate-100 border-t border-slate-100">
        {stops.map(stop => (
          <li key={stop.id}>
            <button
              type="button"
              data-testid={`day-map-legend-${stop.id}`}
              onClick={() => document
                .querySelector(`[data-item-id="${stop.id}"]`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5b3df5] text-[10px] font-black text-white">
                {stop.number}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-black text-[#11183d]">
                  {stop.item.title || stop.item.location}
                </span>
                {stop.item.location && stop.item.location !== stop.item.title && (
                  <span className="block truncate text-[10px] font-medium text-slate-400">{stop.item.location}</span>
                )}
              </span>
              {stop.item.time && (
                <span className="shrink-0 font-mono text-[10px] font-black text-slate-400">{stop.item.time}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {(unmapped > 0 || airportCount > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
          <p data-testid="day-map-unmapped" className="text-[10px] font-bold leading-4 text-slate-400">
            {unmapped > 0 && `還有 ${unmapped} 個行程沒連結地圖，沒有畫在上面。`}
            {/*
              Says what is hidden rather than hiding it quietly: a map showing
              four pins for a six-stop day is a day the traveller counts twice.
            */}
            {airportCount > 0 && !withAirport && `機場（${airportCount} 個）沒有畫在上面，這樣才看得出市區的距離。`}
          </p>
          {airportCount > 0 && (
            <button
              type="button"
              data-testid="toggle-airport-stops"
              aria-pressed={withAirport}
              onClick={() => setWithAirport(value => !value)}
              className="shrink-0 rounded-lg border border-[#e6e3f3] px-2 py-1 text-[10px] font-black text-[#5b3df5]"
            >
              {withAirport ? '不含機場' : '含機場'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default DayMap;
