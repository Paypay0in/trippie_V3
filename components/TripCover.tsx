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
import { PlacePhoto, fetchPlacePhoto } from '../services/placePhotoService';

interface Props {
  /**
   * The words printed across the picture, which are also what is searched.
   *
   * Two fields nothing keeps in agreement produced a Kyoto torii gate on a
   * trip called 沖繩. Searching what is shown cannot disagree with what is
   * shown.
   */
  query: string;
  /**
   * The Google place this trip resolved to, when it resolved to one.
   *
   * 「我覺得是台北車站還是太怪了」 — a 新莊 trip wearing a photograph of Taipei
   * Main Station. The old cover searched Pexels for the destination's name,
   * and a stock search beside a famous neighbour returns the famous
   * neighbour. Nothing could verify what came back.
   *
   * A photo Google holds AGAINST a placeId is a different kind of fact: it is
   * attached to the place, not ranked against its name. `/api/places/resolve`
   * already answers 新莊 with 新莊區 and `photoAvailable: true`, so the right
   * picture was one request away the whole time.
   *
   * Absent, or holding no photo, means the gradient — which this cover has
   * always had underneath. A plain gradient says nothing false.
   */
  placeId?: string;
  dateRange?: string;
  /** The badge under the dates: TRIP 旅行中, and such. */
  children?: React.ReactNode;
  /** Tailwind height, since the review's cover is shorter than the header's. */
  minHeight?: string;
}

const TripCover: React.FC<Props> = ({ query, placeId, dateRange, children, minHeight = 'min-h-48' }) => {
  const { t } = useTranslation();
  const [image, setImage] = useState<PlacePhoto | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setImage(null);
    setImageFailed(false);
    if (!placeId) return () => { active = false; };
    fetchPlacePhoto(placeId).then(result => {
      if (active) setImage(result);
    });
    return () => { active = false; };
  }, [placeId]);

  const shown = image && !imageFailed ? image : null;

  return (
    <div className={`relative ${minHeight} overflow-hidden rounded-[1.4rem] bg-gradient-to-br from-blue-700 via-indigo-700 to-violet-700`}>
      {/*
        「新北市 但圖片是台北」 — and the same thing here, on the trip cover: a
        Pexels search for a city returns whatever it ranks, which beside a
        famous neighbour is usually the famous neighbour.

        The alt said 「<city> destination scenery」, which is an assertion about
        what the photograph shows, and we cannot verify it. An empty alt is the
        specified way to say 「this image carries no information」 — true, once
        the picture is admitted to be decoration. Describing content we cannot
        vouch for is the actual accessibility defect, not the silence.

        Fixed on `SavedTravelDestinationDetail` first and not here, because I
        looked at one screen and called the rule done. Two homes again.
      */}
      {shown && (
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src={shown.imageUrl}
          alt=""
          aria-hidden="true"
          onError={() => setImageFailed(true)}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#101638]/90 via-[#101638]/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        <div className="mb-1 truncate text-3xl font-black tracking-tight">{query || t('trips.coverFallbackName')}</div>
        {dateRange && <div className="text-sm font-semibold text-white/90">{dateRange}</div>}
        {children}
      </div>
      {/*
        No 示意圖片 badge any more, and that is the point of the change rather
        than an omission: the badge existed to warn that the picture might not
        be the place. This one is held against the place's own id, so the
        warning would now be the false statement.
      */}
      {shown?.attribution?.displayName && (
        <div className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[9px] text-white backdrop-blur">
          {shown.attribution.uri
            ? <a className="underline" href={shown.attribution.uri} target="_blank" rel="noreferrer">{shown.attribution.displayName}</a>
            : shown.attribution.displayName}
        </div>
      )}
    </div>
  );
};

export default TripCover;
