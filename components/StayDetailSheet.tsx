import React, { useEffect, useState } from 'react';
import { BedDouble, X, MapPin, Phone, ExternalLink, Copy, Check, CalendarDays, Hash, Info } from 'lucide-react';
import { StaySpan, formatStayDates, stayMapUrl } from '../services/stayIntake';

interface Props {
  stay: StaySpan;
  /** The booking's own notes, which hold the reference and any warning. */
  notes?: string;
  onClose: () => void;
}

interface PlaceFacts {
  address?: string;
  phone?: string;
  website?: string;
  mapsUri?: string;
  photoUrl?: string;
  /** Google requires the photographer to be credited wherever the photo shows. */
  photoAttribution?: { displayName?: string; uri?: string };
}

/**
 * What the traveller needs about tonight's room, in one sheet.
 *
 * Deliberately not the generic itinerary edit form, which is what the banner
 * opened before: standing outside a hotel at 23:00, the questions are where is
 * it, what is the number, and what name is the booking under — not which of
 * fourteen fields to change.
 *
 * Everything Google adds — the photo, the phone, the website — is best effort.
 * Each renders only when it arrived, so a place that cannot be resolved shows
 * a smaller sheet rather than a row of buttons that do nothing.
 */
const StayDetailSheet: React.FC<Props> = ({ stay, notes, onClose }) => {
  const [facts, setFacts] = useState<PlaceFacts>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const resolved = await fetch('/api/places/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: [stay.name, stay.address].filter(Boolean).join(' ') }),
        });
        if (!resolved.ok) return;
        const place = await resolved.json() as { placeId?: string; address?: string };
        if (cancelled || !place.placeId) return;

        // Address from Google only when the booking did not carry one: what
        // the confirmation said is what the traveller will be looking for.
        setFacts(current => ({ ...current, address: current.address ?? place.address }));

        const [details, photo] = await Promise.all([
          fetch('/api/places/details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ placeId: place.placeId }),
          }),
          fetch('/api/places/photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ placeId: place.placeId }),
          }),
        ]);
        if (cancelled) return;

        if (details.ok) {
          const data = await details.json() as PlaceFacts;
          setFacts(current => ({ ...current, phone: data.phone, website: data.website, mapsUri: data.mapsUri }));
        }
        if (photo.ok) {
          // The endpoint nests it: { photo: { imageUrl, attribution } }.
          // Reading imageUrl off the top level silently found nothing and the
          // sheet fell back to the bed icon, which looks like a place with no
          // photograph rather than a bug.
          const data = await photo.json() as { photo?: { imageUrl?: string; attribution?: { displayName?: string; uri?: string } } };
          if (data.photo?.imageUrl) {
            setFacts(current => ({
              ...current,
              photoUrl: data.photo!.imageUrl,
              photoAttribution: data.photo!.attribution,
            }));
          }
        }
      } catch {
        // A sheet with the booking's own details is still useful; nothing here
        // is worth an error message.
      }
    })();

    return () => { cancelled = true; };
  }, [stay.name, stay.address]);

  const address = stay.address || facts.address;

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Safari refuses the clipboard outside a user gesture it recognises.
      // The address is on screen and selectable, so this fails quietly.
    }
  };

  const reference = (notes || '')
    .split('\n')
    .find(line => line.startsWith('訂房編號：'))
    ?.replace('訂房編號：', '');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-label="住宿詳情">
      <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-[28px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-black text-[#111A4A]">住宿詳情</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e8e7f4] text-slate-400"
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex gap-3">
          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-[#f3f0ff] text-[#6b4df6]">
            {facts.photoUrl
              ? <img src={facts.photoUrl} alt="" className="h-full w-full object-cover" />
              : <BedDouble size={26} />}
            {facts.photoAttribution?.uri && (
              <a
                href={facts.photoAttribution.uri}
                target="_blank"
                rel="noreferrer"
                aria-label="查看照片來源"
                className="absolute bottom-1 right-1 rounded bg-black/55 p-0.5 text-white"
              >
                <Info size={10} />
              </a>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black leading-snug text-[#111A4A]">{stay.name}</p>
            {address && (
              <p className="mt-1 flex items-start gap-1 text-xs leading-relaxed text-slate-500">
                <MapPin size={13} className="mt-0.5 shrink-0" />
                <span>{address}</span>
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={stayMapUrl({ name: stay.name, address, mapsUri: facts.mapsUri })}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#e8e7f4] px-3 text-xs font-black text-[#5b3df5]"
          >
            <MapPin size={14} /> 在地圖中查看
          </a>
          {facts.phone && (
            <a
              href={`tel:${facts.phone.replace(/\s/g, '')}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#e8e7f4] px-3 text-xs font-black text-[#5b3df5]"
            >
              <Phone size={14} /> 致電
            </a>
          )}
          {facts.website && (
            <a
              href={facts.website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#e8e7f4] px-3 text-xs font-black text-[#5b3df5]"
            >
              <ExternalLink size={14} /> 前往官網
            </a>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-3 rounded-[18px] bg-[#fbfaff] px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#6b4df6]">
              <CalendarDays size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-black text-slate-400">入住日期</p>
              <p className="text-sm font-black text-[#111A4A]">{formatStayDates(stay)}</p>
            </div>
          </div>

          {address && (
            <div className="flex items-center gap-3 rounded-[18px] bg-[#fbfaff] px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#6b4df6]">
                <MapPin size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black text-slate-400">地址</p>
                <p className="truncate text-sm font-black text-[#111A4A]">{address}</p>
              </div>
              <button
                type="button"
                onClick={copyAddress}
                aria-label="複製地址"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400"
              >
                {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
              </button>
            </div>
          )}

          {reference && (
            <div className="flex items-center gap-3 rounded-[18px] bg-[#fbfaff] px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#6b4df6]">
                <Hash size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-black text-slate-400">訂房編號</p>
                <p className="truncate text-sm font-black text-[#111A4A]">{reference}</p>
              </div>
            </div>
          )}
        </div>

        {notes?.includes('請核對') && (
          <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
            截圖辨識不完全，出發前請再核對一次。
          </p>
        )}
      </div>
    </div>
  );
};

export default StayDetailSheet;
