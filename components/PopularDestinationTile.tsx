import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { PopularDestination } from '../services/tripScope';
import {
  DestinationImage,
  fetchDestinationImage,
} from '../services/destinationImageService';

/**
 * One tappable place in the 熱門目的地 row.
 *
 * Its own component because the photo is fetched per tile and a tile that is
 * still loading, or whose lookup came back empty, must still be tappable and
 * still read as the place it names. A grid that renders four spinners and
 * nothing else is a grid that cannot be used offline.
 *
 * The photo never carries meaning on its own: city and country are text under
 * it, so a failed image costs decoration and not information.
 */
const PopularDestinationTile: React.FC<{
  place: PopularDestination;
  onSelect: (place: PopularDestination) => void;
}> = ({ place, onSelect }) => {
  const [image, setImage] = useState<DestinationImage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setImage(null);
    setFailed(false);
    fetchDestinationImage(place.query).then(found => {
      if (active) setImage(found);
    });
    return () => {
      active = false;
    };
  }, [place.query]);

  return (
    <button
      type="button"
      onClick={() => onSelect(place)}
      data-testid={`popular-destination-${place.id}`}
      className="group flex w-[5.5rem] shrink-0 flex-col gap-1.5 text-left"
    >
      <span className="relative block h-[4.5rem] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100 to-blue-50">
        {image && !failed ? (
          <img
            src={image.imageUrl}
            alt=""
            onError={() => setFailed(true)}
            className="h-full w-full object-cover transition group-hover:scale-[1.03]"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-slate-300">
            <ImageOff size={18} strokeWidth={1.6} />
          </span>
        )}
      </span>
      <span className="block truncate text-support font-semibold text-ink">{place.city}</span>
      <span className="-mt-1 block truncate text-meta font-medium text-ink-soft">{place.country}</span>
    </button>
  );
};

export default PopularDestinationTile;
