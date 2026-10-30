import React from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Globe, Link2, Lock, Share2, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ItineraryItem, PublishedTrip, PublishedTripStop, ShareVisibility } from '../types';
import {
  TripShareFields,
  isTripPublished,
  publishTrip,
  tripShareLink,
  unpublishTrip,
} from '../services/tripPublishing';
import PublicTripView from './PublicTripView';

/**
 * 分享設定 and 預覽公開版本 for a trip.
 *
 * Two screens in the Founder's mock and one component, because they are the
 * same decision seen twice. The preview is not a mock-up of what publishing
 * would do — it is the visitor's own screen, `PublicTripView`, rendered over
 * the payload these switches would produce. 「預覽公開版本」 is worthless if the
 * preview and the publish can disagree.
 *
 * Nothing is published by opening this. The switches and the visibility are
 * held locally until 發布 is pressed, so a tap on 公開 does not quietly put
 * somebody's itinerary on the internet while they are still reading.
 *
 * What publishing a trip grants is reading of the days and nothing else. This
 * sheet says so in as many words, because a traveller agreeing to 公開 is
 * entitled to know the bills are not part of the bargain.
 */

interface Props {
  trip: TripShareFields;
  /** The trip's stops, as the owner holds them. */
  itinerary: ItineraryItem[];
  /** Where this app is served from, for building the link. */
  origin: string;
  onClose: () => void;
  /** Publishes at this visibility with these switches. */
  onPublish: (trip: TripShareFields) => void;
  /** Takes it back. The trip stays; the link stops answering. */
  onUnpublish: (trip: TripShareFields) => void;
}

const CHOICES: Array<{
  value: ShareVisibility;
  /**
   * Keys rather than strings. This list is built once at import, and a `t()`
   * called there would freeze the language to whatever was loaded first — the
   * sheet has to answer in the language the reader is in now.
   *
   * The three names are the same decision as a collection's, so they are the
   * same strings; only the two details that talk about a 行程 are the trip's own.
   */
  labelKey: string;
  detailKey: string;
  icon: React.ReactNode;
}> = [
  { value: 'public', labelKey: 'collectionShare.visibility.publicLabel', detailKey: 'tripShare.visibility.publicDetail', icon: <Globe size={15} /> },
  { value: 'link', labelKey: 'collectionShare.visibility.linkLabel', detailKey: 'collectionShare.visibility.linkDetail', icon: <Link2 size={15} /> },
  { value: 'private', labelKey: 'collectionShare.visibility.privateLabel', detailKey: 'tripShare.visibility.privateDetail', icon: <Lock size={15} /> },
];

/**
 * The payload these settings would produce, built the way the server builds it.
 *
 * Mirrors `read_public_trip`: a withheld field is absent rather than blank, so
 * the preview shows exactly the gap a visitor would see. Kept beside the sheet
 * that previews it, because the day it stops matching the function is the day
 * 預覽 starts lying — and it is asserted against that shape in the tests.
 */
export const previewPayload = (
  trip: TripShareFields,
  itinerary: ItineraryItem[],
  switches: { notes: boolean; photos: boolean; placeDetails: boolean },
): PublishedTrip => ({
  id: trip.id,
  ownerId: trip.ownerId ?? '',
  name: trip.name,
  ...(trip.destination ? { destination: trip.destination } : {}),
  ...(trip.startDate ? { startDate: trip.startDate } : {}),
  ...(trip.endDate ? { endDate: trip.endDate } : {}),
  stops: itinerary.map((item): PublishedTripStop => ({
    id: item.id,
    ...(item.date ? { date: item.date } : {}),
    time: item.time ?? '',
    title: item.title ?? '',
    type: item.type,
    ...(item.durationMinutes != null ? { durationMinutes: item.durationMinutes } : {}),
    ...(item.rating != null ? { rating: item.rating } : {}),
    ...(switches.placeDetails && item.placeId ? { placeId: item.placeId } : {}),
    ...(switches.placeDetails && item.location ? { location: item.location } : {}),
    ...(switches.placeDetails && item.address ? { address: item.address } : {}),
    ...(switches.placeDetails && item.latitude != null ? { latitude: item.latitude } : {}),
    ...(switches.placeDetails && item.longitude != null ? { longitude: item.longitude } : {}),
    ...(switches.notes && item.notes ? { notes: item.notes } : {}),
    ...(switches.photos && item.photos?.length ? { photos: item.photos } : {}),
  })),
});

const TripShareSheet: React.FC<Props> = ({
  trip, itinerary, origin, onClose, onPublish, onUnpublish,
}) => {
  const { t } = useTranslation();
  const [visibility, setVisibility] = React.useState<ShareVisibility>(trip.visibility ?? 'private');
  const [notes, setNotes] = React.useState(trip.sharesOwnNotes !== false);
  const [photos, setPhotos] = React.useState(trip.sharesPhotos !== false);
  const [placeDetails, setPlaceDetails] = React.useState(trip.sharesPlaceDetails !== false);
  const [previewing, setPreviewing] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const draft: TripShareFields = {
    ...trip,
    visibility,
    sharesOwnNotes: notes,
    sharesPhotos: photos,
    sharesPlaceDetails: placeDetails,
  };
  const link = tripShareLink(draft, origin);

  if (previewing) {
    return (
      <div className="fixed inset-0 z-[60] bg-[#f7f8fc]" data-testid="trip-share-preview">
        <PublicTripView
          trip={previewPayload(draft, itinerary, { notes, photos, placeDetails })}
          signedIn={false}
          onSaveStop={() => undefined}
          onSaveTrip={() => undefined}
          onClose={() => setPreviewing(false)}
        />
      </div>
    );
  }

  const toggle = (
    key: string, label: string, value: boolean, set: (next: boolean) => void, detail?: string,
  ) => (
    <label className="flex items-start justify-between gap-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold text-[#11183d]">{label}</span>
        {detail && <span className="mt-0.5 block text-[11px] text-slate-400">{detail}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        data-testid={`trip-share-${key}`}
        onClick={() => set(!value)}
        className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition ${
          value ? 'bg-[#5b3df5]' : 'bg-slate-200'
        }`}
      >
        <span className={`h-5 w-5 rounded-full bg-white transition ${value ? 'translate-x-5' : ''}`} />
      </button>
    </label>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/30" data-testid="trip-share-sheet">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white px-[var(--screen-pad)] pb-6 pt-4 md:mx-auto md:max-w-2xl md:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-black text-[#11183d]">
            <Share2 size={16} />{t('tripShare.title')}
          </h2>
          <button
            type="button"
            aria-label={t('common.close')}
            data-testid="trip-share-close"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mt-3 text-[13px] font-black text-[#11183d]">{trip.name}</p>

        <h3 className="mt-4 text-[12px] font-black text-slate-400">{t('tripShare.scopeHeading')}</h3>
        <div className="mt-1.5 space-y-2">
          {CHOICES.map(choice => (
            <button
              key={choice.value}
              type="button"
              data-testid={`trip-share-visibility-${choice.value}`}
              onClick={() => setVisibility(choice.value)}
              className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left ${
                visibility === choice.value
                  ? 'border-[#5b3df5] bg-violet-50/60'
                  : 'border-[#eceaf5] bg-white'
              }`}
            >
              <span className={visibility === choice.value ? 'text-[#5b3df5]' : 'text-slate-400'}>
                {choice.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-black text-[#11183d]">{t(choice.labelKey)}</span>
                <span className="block text-[11px] text-slate-400">{t(choice.detailKey)}</span>
              </span>
            </button>
          ))}
        </div>

        <h3 className="mt-5 text-[12px] font-black text-slate-400">{t('tripShare.contentHeading')}</h3>
        <div className="mt-0.5 divide-y divide-slate-100">
          {/*
            Always on and said so, rather than a switch that cannot be moved.
            The days are what is being shared; a trip with them withheld is
            not a published trip, it is a title.
          */}
          <p className="flex items-center justify-between py-2.5 text-[13px] font-bold text-[#11183d]">
            {t('tripShare.daysAndPlaces')}
            <span className="text-[11px] font-bold text-slate-400">{t('tripShare.alwaysIncluded')}</span>
          </p>
          {toggle('notes', t('tripShare.ownNotes'), notes, setNotes)}
          {toggle('photos', t('tripShare.photos'), photos, setPhotos)}
          {toggle(
            'details', t('tripShare.placeDetails'), placeDetails, setPlaceDetails,
            t('tripShare.placeDetailsHint'),
          )}
        </div>

        {/*
          The promise, in writing. Somebody agreeing to 公開 is entitled to
          know what is not part of the bargain — and this is not a reassurance
          invented here: `read_public_trip` has no access to these tables.
        */}
        <p
          data-testid="trip-share-never-shared"
          className="mt-4 rounded-2xl bg-[#f7f8fc] px-3 py-3 text-[11px] leading-5 text-slate-500"
        >
          {t('tripShare.neverShared')}
        </p>

        {link && (
          <div className="mt-4 rounded-2xl border border-[#eceaf5] p-3">
            <p className="text-[12px] font-black text-slate-400">{t('tripShare.linkHeading')}</p>
            <p data-testid="trip-share-link" className="mt-1 break-all text-[11px] text-slate-500">{link}</p>
            <div className="mt-2 flex items-center gap-3">
              <QRCodeSVG value={link} size={72} />
              <button
                type="button"
                data-testid="trip-share-copy"
                onClick={() => {
                  void navigator.clipboard?.writeText(link);
                  setCopied(true);
                }}
                className="flex min-h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-white text-[12px] font-black text-[#5b3df5] ring-1 ring-violet-200"
              >
                <Copy size={13} />{copied ? t('tripShare.copied') : t('tripShare.copyLink')}
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          data-testid="trip-share-preview-open"
          onClick={() => setPreviewing(true)}
          className="mt-4 min-h-12 w-full rounded-xl bg-white text-[13px] font-black text-[#5b3df5] ring-1 ring-violet-200"
        >
          {t('tripShare.previewPublic')}
        </button>

        {visibility === 'private' ? (
          /*
            Taking it back, when there was something to take back. A trip that
            was never published has nothing to revoke, and offering 取消公開 on
            it would suggest something is out there.
          */
          isTripPublished(trip) ? (
            <button
              type="button"
              data-testid="trip-share-unpublish"
              onClick={() => { onUnpublish(unpublishTrip(trip)); onClose(); }}
              className="mt-2 min-h-12 w-full rounded-xl bg-white text-[13px] font-black text-rose-500 ring-1 ring-rose-200"
            >
              {t('tripShare.unpublish')}
            </button>
          ) : null
        ) : (
          <button
            type="button"
            data-testid="trip-share-publish"
            onClick={() => { onPublish(publishTrip(draft, visibility)); onClose(); }}
            className="mt-2 min-h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-[13px] font-black text-white"
          >
            {isTripPublished(trip) ? t('tripShare.updateSettings') : t('tripShare.publish')}
          </button>
        )}
      </div>
    </div>
  );
};

export default TripShareSheet;
