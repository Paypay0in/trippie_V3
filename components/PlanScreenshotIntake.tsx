import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { ParsedRental } from '../services/rentalIntake';
import { ItinerarySlice } from '../services/itineraryImageSlices';
import { FlightArrival, ParsedStay, stayToItineraryItems } from '../services/stayIntake';
import { linkStayItems, stayPlaceQuery } from '../services/stayPlaceLink';
import { resolvePlace } from '../services/placeService';
import { flightAnchorsFromParsed, normalizeParsedFlight } from '../services/flightIntake';
import { ItineraryItem, FlightAnchor } from '../types';
import { readScreenshot } from '../services/screenshotIntake';
import { AnchorContradiction, anchorContradictions, contradictionHeadline } from '../services/anchorContradictions';
import { ParsedFlight } from '../services/flightIntake';

/**
 * 有截圖就丟上來 — one entry, whatever the picture is.
 *
 * 「這格可以提示用戶目前若有什麼旅行靈感的截圖、租車或是訂了什麼旅遊票的截圖都可以
 *   上傳上來 協助安排行程 新增一個上傳截圖的入口」.
 *
 * It sits in the planning card because that is where the traveller is when
 * they realise they have the information: they are being asked what the trip
 * should be, and the answer is already in their camera roll. Making them
 * first work out which of five upload buttons a picture belongs to is the
 * step where it stops being worth doing.
 *
 * The picture is classified and then sent to the parser written for it, so a
 * hire keeps its pickup and drop-off dates instead of becoming a line of text
 * on a slice. See `screenshotIntake`.
 */

interface Props {
  destination?: string;
  destinationCountry?: string;
  /** The hire goes on the trip's 租車資訊 card; the caller owns persistence. */
  onAddRental: (rental: ParsedRental) => void;
  /** Places go to the collection, not onto a day. Returns how many landed. */
  onSavePlaces: (slices: ItinerarySlice[]) => Promise<number> | number;
  /** The booking's own cards, exactly as 住宿資訊 adds them. */
  onAddStayItems: (items: ItineraryItem[]) => void;
  /** Appended to the trip's anchors, as 航班資訊 would. */
  onAddFlightAnchors: (anchors: FlightAnchor[]) => void;
  /**
   * Starts a new trip from a ticket that belongs to a different journey.
   *
   * 「跳出問用戶是否建立新旅行 或是要捨棄這個紀錄」 — a ticket to 成田 on a 沖繩
   * trip is usually neither a mistake to discard nor a leg to file here. It
   * is the next trip, read before anybody made it. Omit to offer only the
   * other two answers.
   */
  onStartTripFromFlights?: (flights: ParsedFlight[]) => void;
  /** Lets a check-in time follow the landing time, as the stay card does. */
  flightArrivals?: FlightArrival[];
  /** Checked against what was read, so a ticket for another trip is queried. */
  tripStartDate?: string;
  tripEndDate?: string;
}

/**
 * A flight that was read, held back for an answer.
 *
 * 「應該要跳出提示詢問用戶」 — asked at the moment of the upload rather than
 * reported later on another card. Later is where it was, and a traveller
 * who has moved on reads it as the app being broken rather than as a
 * question about the picture they just chose.
 *
 * Never resolved automatically in either direction: a ticket to 成田 on a
 * 沖繩 trip is a mistake or a connection, and only the traveller knows
 * which.
 */
interface HeldFlight {
  /** The question, as one sentence. See `contradictionHeadline`. */
  headline: string;
  anchors: FlightAnchor[];
  /** The legs as read, kept so a new trip can be derived from them. */
  flights: ParsedFlight[];
  contradictions: AnchorContradiction[];
}

const makeId = () => `shot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const PlanScreenshotIntake: React.FC<Props> = ({
  destination,
  destinationCountry,
  onAddRental,
  onSavePlaces,
  onAddStayItems,
  onAddFlightAnchors,
  flightArrivals = [],
  onStartTripFromFlights,
  tripStartDate,
  tripEndDate,
}) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [held, setHeld] = useState<HeldFlight | null>(null);

  const handleFile = async (file: File) => {
    setError('');
    setDone('');
    setHeld(null);
    setBusy(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });

      const result = await readScreenshot({
        base64Data,
        mimeType: file.type,
        destination,
        destinationCountry,
      });

      if ('rental' in result) {
        onAddRental(result.rental);
        setDone(`讀到租車訂單：${result.rental.company}，已加到租車資訊。`);
        return;
      }

      /*
        Filed here, not redirected.

        「這個不能直接讓用戶在這個介面上傳」. This screen tells the traveller it
        cannot plan without their flights and their hotel, and the upload
        directly under that message used to refuse exactly those two and send
        them somewhere else. Two cards on one screen arguing with each other.

        Both go through the conversions their own cards use — the nights, and
        the two legs — so what lands is the same record, however it arrived.
      */
      if ('stay' in result) {
        const items = stayToItineraryItems(result.stay, makeId, flightArrivals) as ItineraryItem[];

        /*
          Linked to the place it is, before it lands — exactly as 住宿資訊 does.

          I claimed what lands here is the same record however it arrived, and
          without this it was not: a hotel with an address and no `placeId` is
          invisible downstream — no photo, no map, and no travel time into or
          out of the place they sleep, which reads as 「其中一個地點還沒連結地圖，
          無法計算交通時間」 on every leg touching it.

          Best effort, for the same reason the other card gives: a booking that
          never reaches the itinerary is a worse outcome than one with no photo.
        */
        const query = stayPlaceQuery(result.stay.hotelName, result.stay.address);
        if (query) {
          try {
            onAddStayItems(linkStayItems(items, await resolvePlace(query, destinationCountry)));
          } catch {
            onAddStayItems(items);
          }
        } else {
          onAddStayItems(items);
        }

        setDone(`讀到住宿：${result.stay.hotelName}，已加到行程。`);
        return;
      }

      if ('flights' in result) {
        // The route answers { OUTBOUND?, RETURN? }. The direction comes from
        // the key rather than the body: the key is what the server decided,
        // and a leg disagreeing with its own slot would file two outbounds
        // and lose the return date.
        const legs = result.flights as Record<string, unknown>;
        const read = (['OUTBOUND', 'RETURN'] as const).flatMap(direction => {
          const parsed = normalizeParsedFlight(legs?.[direction]);
          return parsed ? [{ ...parsed, direction }] : [];
        });
        const anchors = flightAnchorsFromParsed(read, makeId);
        if (anchors.length === 0) {
          setError('這張機票讀不出完整的日期與時間，請用航班資訊手動確認。');
          return;
        }
        /*
          Asked before it is filed, when it disagrees with the trip.

          「應該要跳出提示詢問用戶」. A ticket to 成田 on a 沖繩 trip is either
          the wrong picture or a connection, and filing it quietly means the
          planner is later told a landing time for a different journey as
          fact. The question costs one tap; the wrong answer costs a plan.
        */
        const against = anchorContradictions({ anchors, destination, tripStartDate, tripEndDate });
        if (against.length > 0) {
          const check = { anchors, destination, tripStartDate, tripEndDate };
          setHeld({
            headline: contradictionHeadline(against, check),
            anchors,
            flights: read,
            contradictions: against,
          });
          return;
        }

        onAddFlightAnchors(anchors);
        setDone(`讀到 ${anchors.length} 段航班，已加到航班資訊。`);
        return;
      }

      if (!('slices' in result)) return;
      const saved = await onSavePlaces(result.slices);
      setDone(`讀到 ${result.slices.length} 個地點，已存 ${saved} 個到收藏。`);
    } catch (caught) {
      // The server words these; whether retrying helps is the whole of what
      // the traveller needs from them.
      setError(caught instanceof Error ? caught.message : '現在無法辨識截圖，請稍後再試。');
    } finally {
      setBusy(false);
      // Clearing lets the same file be picked again after a failure.
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div data-testid="plan-screenshot-intake" className="mt-2">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="plan-screenshot-file"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      <button
        type="button"
        data-testid="plan-screenshot-upload"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-200 bg-violet-50/50 px-4 text-sm font-black text-violet-700 disabled:opacity-50"
      >
        {busy
          ? <Loader2 size={16} className="animate-spin" />
          : <ImagePlus size={16} />}
        {busy ? '讀取截圖中…' : '上傳截圖'}
      </button>
      <p className="mt-1.5 text-center text-[11px] leading-4 text-slate-400">
機票、訂房、租車訂單、旅行靈感截圖都可以，我讀出來放到對的地方
      </p>

      {/*
        The question, where the picture was chosen.

        Both answers are real: 「還是加入」 for a connection or a trip whose
        dates are about to change, 「取消」 for the wrong screenshot. Neither is
        the default, so nothing happens until the traveller says.
      */}
      {held && (
        <div data-testid="plan-flight-confirm" className="mt-2 rounded-xl bg-amber-50 px-3 py-2.5 text-left">
          <p data-testid="plan-flight-confirm-headline" className="text-xs font-black leading-5 text-amber-900">
            {held.headline || '這張機票跟這趟旅程對不起來'}
          </p>
          <ul className="mt-1.5 space-y-1">
            {held.contradictions.map(item => (
              <li key={`${item.anchorId}-${item.kind}`} className="text-[11px] leading-4 text-amber-800">
                {item.message}
              </li>
            ))}
          </ul>
          <div className="mt-2.5 space-y-2">
            {/*
              The outcome this usually is.

              「跳出問用戶是否建立新旅行 或是要捨棄這個紀錄」 — a ticket for
              another city and another month is rarely a mistake. It is the
              next trip, read before anybody made it, and discarding it
              throws away a booking somebody already paid for.

              Always offered once a flight is held, and that is not an
              oversight. `worthKeeping` guards the booking import against a
              readout with no date and no destination — but a leg only
              becomes an anchor at all if it has a date, so by the time it
              reaches this question the trip is always nameable. Calling it
              here would be a condition that cannot be false.
            */}
            {onStartTripFromFlights && (
              <button
                type="button"
                data-testid="plan-flight-new-trip"
                onClick={() => {
                  onStartTripFromFlights(held.flights);
                  setHeld(null);
                }}
                className="min-h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-3 text-xs font-black text-white"
              >
                用這張機票建立新旅程
              </button>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                data-testid="plan-flight-confirm-cancel"
                onClick={() => setHeld(null)}
                className="min-h-10 flex-1 rounded-xl border border-amber-300 bg-white px-3 text-xs font-black text-amber-800"
              >
                捨棄這筆紀錄
              </button>
              {/*
                Kept, quietly. A traveller connecting through 成田 to 那霸 is
                doing something real, and removing this answer would leave
                them no way to record a flight that is genuinely theirs.
              */}
              <button
                type="button"
                data-testid="plan-flight-confirm-add"
                onClick={() => {
                  onAddFlightAnchors(held.anchors);
                  setDone(`讀到 ${held.anchors.length} 段航班，已加到航班資訊。`);
                  setHeld(null);
                }}
                className="min-h-10 flex-1 rounded-xl px-3 text-xs font-bold text-amber-700 underline underline-offset-4"
              >
                還是加進這趟
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p data-testid="plan-screenshot-error" className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {error}
        </p>
      )}
      {done && (
        <p data-testid="plan-screenshot-done" className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
          {done}
        </p>
      )}
    </div>
  );
};

export default PlanScreenshotIntake;
