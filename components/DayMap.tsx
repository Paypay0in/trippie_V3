import React, { useState } from 'react';
import { MapPinned } from 'lucide-react';
import { ItineraryItem } from '../types';
import { dayMapSrc, mappableStops } from '../services/dayMapImage';

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
  const stops = mappableStops(items);
  const unmapped = items.length - stops.length;

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
          src={dayMapSrc({ stops, encodedPaths, width: 640, height: 400 })}
          alt={`這一天 ${stops.length} 個地點的地圖`}
          className="block h-auto w-full"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      {unmapped > 0 && (
        <p data-testid="day-map-unmapped" className="px-3 py-2 text-[10px] font-bold leading-4 text-slate-400">
          還有 {unmapped} 個行程沒連結地圖，沒有畫在上面。
        </p>
      )}
    </div>
  );
};

export default DayMap;
