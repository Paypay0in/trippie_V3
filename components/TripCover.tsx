/**
 * The picture at the top of a trip.
 *
 * It existed once, inside `TripWorkspaceShell`, and 旅程回顧 needed the same
 * thing — which is where this project's recurring defect starts: two screens
 * picturing one trip two different ways, drifting apart from the first time
 * somebody fixes only one of them. 「這不是沖繩」 was that bug the first time,
 * when the photo was searched on a field the traveller could not see.
 *
 * So there is one cover. It searches on the words printed across it, it falls
 * back to the gradient when there is no photo, and it carries Pexels'
 * attribution wherever it is drawn — the licence requires it, and a credit
 * that depends on which screen you are standing on is not a credit.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DestinationImage, fetchDestinationImage } from '../services/destinationImageService';

interface Props {
  /**
   * The words printed across the picture, which are also what is searched.
   *
   * Two fields nothing keeps in agreement produced a Kyoto torii gate on a
   * trip called 沖繩. Searching what is shown cannot disagree with what is
   * shown.
   */
  query: string;
  dateRange?: string;
  /** The badge under the dates: TRIP 旅行中, and such. */
  children?: React.ReactNode;
  /** Tailwind height, since the review's cover is shorter than the header's. */
  minHeight?: string;
}

const TripCover: React.FC<Props> = ({ query, dateRange, children, minHeight = 'min-h-48' }) => {
  const { t } = useTranslation();
  const [image, setImage] = useState<DestinationImage | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setImage(null);
    setImageFailed(false);
    if (!query) return () => { active = false; };
    fetchDestinationImage(query).then(result => {
      if (active) setImage(result);
    });
    return () => { active = false; };
  }, [query]);

  const shown = image && !imageFailed ? image : null;

  return (
    <div className={`relative ${minHeight} overflow-hidden rounded-[1.4rem] bg-gradient-to-br from-blue-700 via-indigo-700 to-violet-700`}>
      {shown && (
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src={shown.imageUrl}
          alt={`${shown.destinationQuery} destination scenery`}
          onError={() => setImageFailed(true)}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#101638]/90 via-[#101638]/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        <div className="mb-1 truncate text-3xl font-black tracking-tight">{query || t('trips.coverFallbackName')}</div>
        {dateRange && <div className="text-sm font-semibold text-white/90">{dateRange}</div>}
        {children}
      </div>
      {shown?.attributionRequired && (
        <div className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[9px] text-white backdrop-blur">
          Photo by <a className="underline" href={shown.photographerUrl} target="_blank" rel="noreferrer">{shown.photographer}</a> on <a className="underline" href={shown.sourceUrl} target="_blank" rel="noreferrer">Pexels</a>
        </div>
      )}
    </div>
  );
};

export default TripCover;
