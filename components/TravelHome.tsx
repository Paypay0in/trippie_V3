import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
// The helpers above the component format dates and names before any component
// holds a `t`; the shared instance answers in the current language and the
// component's `useTranslation` is what re-renders them when it changes.
import i18n from "../i18n/config";
import ConfirmDialog from './ConfirmDialog';
import { localToday, phaseForDate } from '../services/tripPhaseByDate';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Compass,
  CloudCheck,
  CloudOff,
  Ellipsis,
  FileInput,
  MapPin,
  MapPinned,
  NotebookPen,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { CommunityPost, SavedTravelInspiration, Trip } from "../types";
import { TripDraft } from "../services/tripPersistence";
import { tripShelfBadgeText } from "../services/tripShelfBadge";
import {
  DestinationImage,
  fetchDestinationImage,
} from "../services/destinationImageService";
import AppBottomNav, { AppSection, BOTTOM_NAV_CLEARANCE } from "./AppBottomNav";
import { isSearching, matchesQuery } from "../services/travelHomeSearch";
import AppWordmark from "./AppWordmark";
import NotificationCenter from "./NotificationCenter";
import { DisputeNotice } from "../services/disputeInbox";
import { countryDisplayName, countryKey } from '../services/countryIdentity';
import { cityDisplayName } from '../services/cityNames';
import { coverImageQuery, fixtureImageFor } from '../services/destinationCoverImage';
import { IdentityDrift } from '../services/tripIdentityDrift';
import { RecoverableTrip, recoverableDates } from '../services/recoverableTrips';
import { CloudTripIds, cloudPresenceSummary, isOnlyOnThisDevice } from '../services/tripCloudPresence';

interface Props {
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
  onPlus: () => void;
  drafts: TripDraft[];
  tripHistory: Trip[];
  activeDraftId: string | null;
  onContinueDraft: (id: string) => void;
  onContinueTrip: (trip: Trip) => void;
  onCreateNew: () => void;
  onOpenPlanner: () => void;
  /**
   * Opens AI 匯入旅程資料. Previously wired to `() => undefined` — a tile that
   * looked live and answered nothing, beside two more of the same.
   */
  onAiImport?: () => void;
  savedTravelInspirations: SavedTravelInspiration[];
  communityPosts: CommunityPost[];
  onOpenSavedDestination: (country: string, city: string) => void;
  authStatus: "anonymous" | "authenticated" | "loading";
  authenticatedDisplayName?: string;
  /** Deletes one trip by stable id. Returns false when the delete failed. */
  onDeleteDraft?: (id: string) => boolean;
  /**
   * 「這個是「旅行」的通知 不是社群的通知」.
   *
   * A question about a shared bill, a flight that moved, an itinerary someone
   * changed — none of it is community activity, and it was reachable only from
   * the community header while the bell on this screen did nothing at all.
   */
  notices?: DisputeNotice[];
  onOpenNotice?: (notice: DisputeNotice) => void;
  /**
   * Trips whose name here disagrees with the cloud's. See `identityDrift`.
   *
   * 「我的釜山不見了」 — it was on this shelf under another trip's name, and the
   * shelf said nothing. Reported rather than repaired: a rename the traveller
   * meant drifts the same way, so he picks.
   */
  identityDrifts?: IdentityDrift[];
  onRestoreTripIdentity?: (drift: IdentityDrift) => void;
  /**
   * Trips the cloud still holds that this device deleted and will not re-add.
   *
   * 「釜山的旅冊怎麼都不見了」 — and it was neither renamed nor archived. The
   * refusal to put a deleted trip back is correct and was silent, which made
   * it indistinguishable from the trip being gone for good. See
   * `recoverableTrips`.
   */
  recoverable?: RecoverableTrip[];
  onRecoverTrip?: (trip: RecoverableTrip) => void;
  /**
   * The trip ids the account holds, once they are known.
   *
   * `undefined` until the fetch returns, which is the difference between
   * 「not uploaded」 and 「not asked yet」 — see `tripCloudPresence`.
   */
  cloudTripIds?: CloudTripIds;
  signedIn?: boolean;
}

type SavedNotesStorageStatus = "device_only" | "account_linked" | "cloud_synced";

const getSavedNotesStorageStatus = (authStatus: Props["authStatus"]): SavedNotesStorageStatus =>
  authStatus === "authenticated" ? "account_linked" : "device_only";

const formatDates = (start?: string, end?: string) => {
  if (!start && !end) return i18n.t("home.datesNotSet");
  const format = (value?: string) =>
    value ? value.slice(0, 10).replace(/-/g, "/") : i18n.t("home.dateUnset");
  return `${format(start)} - ${format(end)}`;
};

const formatTripDate = (date?: string) => {
  if (!date) return "";

  const parsed = new Date(`${date}T00:00:00`);

  // Formatted in the language the app is being read in, not a fixed locale.
  return new Intl.DateTimeFormat(i18n.language, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
};

const getTripDurationText = (startDate?: string, endDate?: string) => {
  if (!startDate || !endDate) return "";

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff =
    Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  if (diff <= 0) return "";

  return i18n.t("home.nightsAndDays", { days: diff, nights: Math.max(0, diff - 1) });
};

const duration = (start?: string, end?: string) => {
  if (!start || !end) return "";
  const days =
    Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / 86400000,
    ) + 1;
  return days > 0 ? i18n.t("trips.dayCount", { count: days }) : "";
};

interface DestinationImageLayerProps {
  destination?: string;
  explicitCover?: string;
  className?: string;
}

const DestinationImageLayer: React.FC<DestinationImageLayerProps> = ({
  destination,
  explicitCover,
  className = "",
}) => {
  const [serviceImage, setServiceImage] = useState<DestinationImage | null>(null);

  useEffect(() => {
    let active = true;
    setServiceImage(null);
    if (!destination?.trim() || explicitCover) return () => { active = false; };

    fetchDestinationImage(destination).then((result) => {
      if (active) setServiceImage(result);
    });
    return () => { active = false; };
  }, [destination, explicitCover]);

  const imageUrl = explicitCover || serviceImage?.imageUrl || fixtureImageFor(destination);
  return (
    <div
      className={`absolute inset-0 bg-cover bg-center ${className}`}
      style={{ backgroundImage: `url(${imageUrl})` }}
      role="img"
      aria-label={destination ? `${destination} destination scenery` : "travel destination"}
    />
  );
};

const TravelHome: React.FC<Props> = ({
  activeSection,
  onSectionChange,
  onPlus,
  drafts,
  tripHistory,
  activeDraftId,
  onContinueDraft,
  onContinueTrip,
  onCreateNew,
  onOpenPlanner,
  onAiImport,
  savedTravelInspirations,
  onOpenSavedDestination,
  authStatus,
  authenticatedDisplayName,
  onDeleteDraft,
  notices = [],
  onOpenNotice,
  identityDrifts = [],
  onRestoreTripIdentity,
  recoverable = [],
  onRecoverTrip,
  cloudTripIds,
  signedIn = false,
}) => {
  const { t } = useTranslation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const activeDraft =
    drafts.find((draft) => draft.id === activeDraftId) || drafts[0];
  const tripDurationText = getTripDurationText(
    activeDraft?.startDate,
    activeDraft?.endDate,
  );
  /*
    One rule for 「which part of this trip is it」, shared with the workspace.

    「目前旅程都已經完成了」 — this screen called 釜山 已結束的旅程 while the
    workspace header called the same trip RETURN 返程中, because each had
    written its own date comparison. One trip saying two things on two screens
    is worse than either being wrong: after that neither can be trusted, and
    the traveller has no way to tell which one is lying.

    `phaseForDate` is now the only place that decides. Both of its finished
    phases land on 已結束 here, because this card has three states and the
    difference between 返程中 and 結算 belongs inside the trip, not on a tile.
  */
  const tripStatus = (() => {
    const phase = phaseForDate(
      localToday(),
      activeDraft?.startDate,
      activeDraft?.endDate,
    );
    if (!phase) return "upcoming";
    if (phase === "pre") return "upcoming";
    if (phase === "during") return "during";
    return "completed";
  })();
  /*
    The badge says which of the three a trip is.

    「旅程」 was the label for a journey already over, which names the category
    rather than the state — every card is a 旅程. The design's wording for the
    live one is 進行中的旅程, and a finished one deserves the same courtesy of
    being told apart from a trip that has not started.
  */
  const tripStatusLabel =
    tripStatus === "during"
      ? t("home.statusDuring")
      : tripStatus === "upcoming"
        ? t("home.statusUpcoming")
        : t("home.statusFinished");
  const today = new Date();
  // Every other trip, not just the ones that have yet to start.
  //
  // Hiding trips whose departure has passed made a trip pulled down from the
  // cloud invisible here — someone joining a journey already under way sees an
  // empty home screen and concludes nothing synced. Upcoming trips still come
  // first; the ones already begun or finished follow, most recent first.
  const draftStartTime = (draft: TripDraft) =>
    draft.startDate ? new Date(`${draft.startDate}T00:00:00`).getTime() : undefined;

  const otherDrafts = drafts
    .filter((draft) => draft.id !== activeDraft?.id)
    .sort((a, b) => {
      const startA = draftStartTime(a);
      const startB = draftStartTime(b);
      const upcomingA = startA === undefined || startA >= today.getTime();
      const upcomingB = startB === undefined || startB >= today.getTime();
      if (upcomingA !== upcomingB) return upcomingA ? -1 : 1;
      if (startA === undefined) return 1;
      if (startB === undefined) return -1;
      // Soonest first among upcoming, most recent first among the rest.
      return upcomingA ? startA - startB : startB - startA;
    });
  const savedNotes = useMemo(() => {
    const groups = new Map<string, {
      /** As stored, for navigating and for matching records. */
      country: string; city: string;
      /** As read, in the app's own language. */
      countryLabel: string; cityLabel: string;
      count: number; id: string;
    }>();
    savedTravelInspirations.forEach((item) => {
      const country = item.country.trim();
      const city = item.city.trim();
      if (!country || !city) return;
      /*
        One key per country, whatever it was written as.

        「那這個問題點也可以限制在用戶成立旅冊」 — a place looked up after the fact
        comes back as 「Japan」 while everything saved before it says 「日本」, and
        this screen showed them as two different places to have been. The
        displayed name is still whichever the records use; only the grouping is
        normalised. See `countryKey`.
      */
      const key = `${countryKey(country)}::${city.toLocaleLowerCase()}`;
      const current = groups.get(key);
      /*
        Shown in the app's own language. 「語言一下 Japan 一下日本 這樣不 ok」 — the
        records honestly hold both, because Google answers 日本 and the airport
        directory stores Japan. See `countryDisplayName`.
      */
      /*
        Two names per group, and they are not interchangeable.

        「黃色點進去是空白的」 — the card was showing 釜山 and navigating with it,
        while the records say 「Busan」 and the detail screen matches on the
        stored text. What is read and what is matched have to be kept apart:
        the label is for the reader, the raw value is the record's own.
      */
      groups.set(key, current
        ? { ...current, count: current.count + 1 }
        : {
            country,
            city,
            countryLabel: countryDisplayName(country),
            cityLabel: cityDisplayName(city),
            count: 1,
            id: `saved-${key}`,
          });
    });
    return Array.from(groups.values());
  }, [savedTravelInspirations]);
  const savedNotesStorageStatus = getSavedNotesStorageStatus(authStatus);
  /** 「要全展開」 — the strip opens into a grid. Collapsed by default. */
  const [notesExpanded, setNotesExpanded] = useState(false);
  /*
    What is typed narrows every strip on the page at once, including the trip
    in progress — a hero card that stays put while everything under it filters
    reads as a result, and it is the one card a search is most likely to want.
  */
  const searching = isSearching(query);
  const heroMatches = !activeDraft
    || matchesQuery(query, activeDraft.name, activeDraft.destination);
  const visibleOtherDrafts = otherDrafts.filter((draft) =>
    matchesQuery(query, draft.name, draft.destination));
  /* Searchable by what is on the card and by what is in the record: somebody
     typing 「Busan」 and somebody typing 「釜山」 are looking for the same place. */
  const visibleSavedNotes = savedNotes.filter((note) =>
    matchesQuery(query, note.country, note.city, note.countryLabel, note.cityLabel,
      `${note.countryLabel}・${note.cityLabel}`));
  const visibleHistory = tripHistory.filter((trip) =>
    matchesQuery(query, trip.name, trip.destination));
  const nothingFound = searching
    && !heroMatches
    && visibleOtherDrafts.length === 0
    && visibleSavedNotes.length === 0
    && visibleHistory.length === 0;
  /** Which trip's overflow menu is open, and which is awaiting confirmation. */
  const [openMenuDraftId, setOpenMenuDraftId] = useState<string | null>(null);
  const [pendingDeleteDraft, setPendingDeleteDraft] = useState<TripDraft | null>(null);
  const [deleteError, setDeleteError] = useState("");

  /**
   * The name the traveller gave the trip, not the place it is going.
   *
   * Destination is now filled in automatically from the title, so preferring it
   * replaced 「韓國釜山之旅」 with 「釜山」 — the app overwriting someone's own
   * words with its own inference of them. The destination still drives the
   * cover image, where it is a search term rather than a label.
   */
  const draftLabel = (draft: TripDraft) =>
    draft.name?.trim() || draft.destination || i18n.t("home.untitledTrip");

  /**
   * The overflow menu for one trip card. Rendered only when a delete handler
   * exists, so the affordance never appears without something behind it.
   */
  const renderTripMenu = (draft: TripDraft) =>
    onDeleteDraft && openMenuDraftId === draft.id ? (
      <span
        role="menu"
        data-testid={`trip-menu-${draft.id}`}
        className="absolute right-3 top-14 z-40 w-36 overflow-hidden rounded-2xl bg-white p-1.5 text-left shadow-xl ring-1 ring-slate-200"
      >
        <button
          type="button"
          role="menuitem"
          data-testid={`delete-trip-${draft.id}`}
          onClick={(event) => {
            event.stopPropagation();
            setOpenMenuDraftId(null);
            setDeleteError("");
            // Destructive: nothing happens until the dialog is confirmed.
            setPendingDeleteDraft(draft);
          }}
          className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50"
        >
          <Trash2 size={16} />
          {t("trips.deleteTrip")}
        </button>
      </span>
    ) : null;
  const savedNotesTitle = authStatus === "authenticated"
    ? t("home.savedNotesTitleNamed", { name: authenticatedDisplayName?.trim() || t("home.savedNotesFallbackOwner") })
    : t("home.savedNotesTitle");

  return (
    <div className={`mx-auto flex min-h-screen w-full flex-col bg-[#f7f8fc] text-[#11183d] shadow-2xl md:max-w-2xl lg:max-w-2xl ${BOTTOM_NAV_CLEARANCE}`}>
      <header data-safe-top style={{ ["--safe-top-base" as string]: "var(--header-top)" }} className="bg-white px-[var(--screen-pad)] pb-2">
        <div className="flex items-center justify-between">
          <AppWordmark />
          <div className="flex gap-3 text-slate-600">
            <button
              type="button"
              data-testid="open-notifications"
              onClick={() => setNotificationsOpen(true)}
              className="relative flex h-12 w-12 items-center justify-center rounded-full bg-slate-50"
              aria-label={notices.length > 0 ? t("home.notificationsUnread", { count: notices.length }) : t("account.notifications")}
            >
              <Bell size={23} />
              {/* A dot, not a number: the count is in the list, and a badge that says 「12」 on a header is a demand rather than a signal. */}
              {notices.length > 0 && (
                <span
                  data-testid="notification-dot"
                  className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white"
                />
              )}
            </button>
            <button
              type="button"
              data-testid="focus-travel-search"
              onClick={() => searchRef.current?.focus()}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50"
              aria-label={t("home.search")}
            >
              <Search size={23} />
            </button>
            <button
              type="button"
              data-testid="travel-more"
              onClick={() => onSectionChange("profile")}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50"
              aria-label={t("common.more")}
            >
              <Ellipsis size={23} />
            </button>
          </div>
        </div>
        <p className="mt-3 text-base font-bold text-slate-400">{t("trips.greeting")}</p>
        <h1 className="mt-1 text-hero font-black tracking-tight">
          {t("trips.whereNext")}
        </h1>
        {/*
          The search the design puts directly under the question.

          It searches what the traveller already has — trips, saved notes, past
          journeys — rather than opening a destination catalogue that does not
          exist. A field that answers nothing is worse than no field, and this
          screen is mostly a list of the reader's own things, which is exactly
          what someone types a name into a box to find.
        */}
        <div className="mt-3 flex items-center gap-2 rounded-[1.6rem] border border-slate-100 bg-white px-4 py-1.5 shadow-[0_8px_26px_rgba(15,23,42,.07)]">
          <Search size={20} className="shrink-0 text-slate-300" />
          <input
            ref={searchRef}
            data-testid="travel-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("home.searchPlaceholder")}
            aria-label={t("home.searchAriaLabel")}
            className="min-w-0 flex-1 bg-transparent py-2 text-[15px] font-medium text-[#11183d] outline-none placeholder:text-slate-300"
          />
          {query.trim() ? (
            <button
              type="button"
              data-testid="clear-travel-search"
              onClick={() => setQuery("")}
              aria-label={t("home.clearSearch")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"
            >
              <X size={20} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenPlanner}
              aria-label={t("home.askAiToPlan")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-violet-500/25"
            >
              <ArrowRight size={20} />
            </button>
          )}
        </div>
      </header>
      <main className="flex-1 space-y-3 px-[var(--screen-pad)] pb-5 pt-3">
        {/*
          「我的釜山不見了」.

          It was on the shelf the whole time, under 東京's name — so the shelf
          is where this has to be said. Above the hero, because a trip the
          traveller cannot find is not something to scroll to.
        */}
        {identityDrifts.length > 0 && (
          <section data-testid="identity-drift" className="rounded-[20px] border border-amber-200 bg-amber-50 p-4">
            <h2 className="text-[13px] font-black text-amber-900">{t("home.cloudNameDiffers")}</h2>
            <p className="mt-1 text-[11px] font-bold leading-5 text-amber-700">
              {t("home.cloudNameDiffersBody")}
            </p>
            <ul className="mt-3 space-y-2">
              {identityDrifts.map((drift) => (
                <li
                  key={drift.id}
                  data-testid={`identity-drift-${drift.id}`}
                  className="flex items-center gap-3 rounded-[16px] bg-white px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1 text-[12px] font-bold leading-5">
                    <span className="block truncate text-slate-400 line-through">{drift.localName}</span>
                    <span className="block truncate text-[13px] font-black text-slate-800">{drift.cloudName}</span>
                  </span>
                  <button
                    type="button"
                    data-testid={`identity-drift-restore-${drift.id}`}
                    onClick={() => onRestoreTripIdentity?.(drift)}
                    className="shrink-0 rounded-full bg-amber-500 px-3.5 py-1.5 text-[11px] font-black text-white"
                  >
                    {t("home.restore")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {/*
          Trips this device is refusing to show.

          Above the hero for the same reason the drift banner is: a trip the
          traveller cannot find is not something to scroll to. It states the
          refusal and its reason rather than quietly restoring — a trip
          deleted on purpose coming back by itself is the bug this refusal
          was built to fix, and it is the worse of the two.
        */}
        {recoverable.length > 0 && (
          <section data-testid="recoverable-trips" className="rounded-[20px] border border-sky-200 bg-sky-50 p-4">
            <h2 className="text-[13px] font-black text-sky-900">{t("home.cloudStillHasTrips")}</h2>
            <p className="mt-1 text-[11px] font-bold leading-5 text-sky-700">
              {t("home.cloudStillHasTripsBody")}
            </p>
            <ul className="mt-3 space-y-2">
              {recoverable.map((trip) => (
                <li
                  key={trip.id}
                  data-testid={`recoverable-trip-${trip.id}`}
                  className="flex items-center gap-3 rounded-[16px] bg-white px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1 text-[12px] font-bold leading-5">
                    <span className="block truncate text-[13px] font-black text-slate-800">{trip.name || t("home.untitledTrip")}</span>
                    {recoverableDates(trip) && (
                      <span className="block truncate text-slate-400">{recoverableDates(trip)}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    data-testid={`recoverable-trip-restore-${trip.id}`}
                    onClick={() => onRecoverTrip?.(trip)}
                    className="shrink-0 rounded-full bg-sky-600 px-3.5 py-1.5 text-[11px] font-black text-white"
                  >
                    {t("home.pullBack")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {/* While searching, the hero is a result like any other. */}
        {(activeDraft ? heroMatches : !searching) && (
        <section data-testid="travel-hero">
          {activeDraft ? (
          <article className="relative overflow-hidden rounded-[22px] bg-slate-900 shadow-sm">
            <div className="relative h-[clamp(7rem,21vh,15.25rem)] w-full">
              <DestinationImageLayer destination={coverImageQuery(activeDraft.destination, activeDraft.name)} />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/65" />
              <div className="absolute left-4 top-4">
                <span className="inline-flex items-center rounded-full bg-black/45 px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur-sm">
                  {tripStatusLabel}
                </span>
              </div>
              <button
                type="button"
                className="absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-[22px] font-bold leading-none text-[#11183d] shadow-sm backdrop-blur-md transition hover:bg-white/90"
                aria-label={t("home.moreTripOptions")}
                aria-expanded={openMenuDraftId === activeDraft.id}
                data-testid={`trip-menu-button-${activeDraft.id}`}
                onClick={() =>
                  setOpenMenuDraftId((current) =>
                    current === activeDraft.id ? null : activeDraft.id,
                  )
                }
              >
                <Ellipsis size={20} />
              </button>
              {renderTripMenu(activeDraft)}
              <div className="absolute bottom-5 left-5 right-[150px] text-white">
                <h2 className="mb-2 text-[27px] font-black leading-none tracking-tight drop-shadow-sm">
                  {activeDraft.name?.trim() || activeDraft.destination || t("home.untitledTrip")}
                </h2>
                {/*
                  Three stacked rows, each on one line.

                  「比例要正確 這不正確」. They were one wrapping flex row, so on a
                  393pt phone the date broke across two lines and the three
                  facts reflowed into a ragged block that changes shape with
                  the trip. The design stacks them, which is also the only
                  arrangement where a date reads as a date.
                */}
                <div className="flex flex-col items-start gap-1 text-[13px] font-semibold text-white/95">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <CalendarDays className="h-4 w-4" />
                    {formatTripDate(activeDraft.startDate)}
                    {activeDraft.startDate && activeDraft.endDate ? " - " : ""}
                    {formatTripDate(activeDraft.endDate)}
                  </span>
                  {tripDurationText && (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span aria-hidden="true">◷</span>
                      {tripDurationText}
                    </span>
                  )}
                  <span
                    data-testid={`trip-shelf-badge-${activeDraft.id}`}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Users className="h-4 w-4" />
                    {tripShelfBadgeText(activeDraft)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onContinueDraft(activeDraft.id)}
                className="absolute bottom-4 right-4 inline-flex h-[48px] items-center gap-2 rounded-[15px] bg-white px-5 text-[14px] font-extrabold text-violet-600 shadow-[0_6px_18px_rgba(0,0,0,0.12)] transition active:scale-[0.98]"
              >
                {t("trips.continueTrip")}
                <span aria-hidden="true" className="text-xl leading-none">→</span>
              </button>
            </div>
          </article>
          ) : (
            <div className="rounded-[1.8rem] bg-white p-8 text-center shadow-sm">
              <MapPinned className="mx-auto text-violet-500" size={30} />
              <p className="mt-4 text-lg font-black">{t("home.noTripsYet")}</p>
              <button
                onClick={onCreateNew}
                className="mt-5 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white"
              >
                {t("trips.createFirstTrip")}
              </button>
            </div>
          )}
        </section>
        )}
        {nothingFound && (
          <div
            data-testid="travel-search-empty"
            className="rounded-[1.8rem] bg-white px-6 py-10 text-center shadow-sm"
          >
            <Search className="mx-auto text-slate-300" size={28} />
            <p className="mt-4 text-base font-black">{t("home.noSearchResults", { query: query.trim() })}</p>
            <p className="mt-2 text-sm font-medium text-slate-400">
              {t("home.searchScopeHint")}
            </p>
          </div>
        )}
        <section>
          {/*
            Only the tiles that do something.

            「新增行程要點哪一個」 came from the same shape one menu over: 新增地點
            and 新增筆記 were both `() => undefined` here — live-looking tiles
            wired to nothing, because no add-place or add-note feature exists to
            wire them to. A control that answers a tap with silence costs more
            trust than the blank space where it was.
          */}
          <div className="grid grid-cols-4 gap-2">
            {([
              [Sparkles, t("home.tileAiPlan"), t("home.tileAiPlanHint"), onOpenPlanner, "bg-violet-50 text-violet-600"],
              [FileInput, t("home.tileImport"), t("home.tileImportHint"), onAiImport || onCreateNew, "bg-blue-50 text-blue-600"],
              [Plus, t("trips.addTrip"), t("home.tileAddHint"), onCreateNew, "bg-pink-50 text-pink-600"],
              /*
                探索目的地 goes to the community feed, which is where the
                app's destination inspiration actually lives — 發現 and
                下一個目的地 are tabs there. A fourth tile pointing at a screen
                that does not exist would be the thing this list was trimmed
                to remove.
              */
              [Compass, t("home.tileExplore"), t("home.tileExploreHint"), () => onSectionChange("community"), "bg-teal-50 text-teal-600"],
            ] as [React.ElementType, string, string, () => void, string][])
              .map(([Icon, label, hint, action, color]) => (
              <button
                key={label}
                onClick={action}
                data-testid={`quick-start-${label}`}
                className="flex min-h-[94px] flex-col items-center justify-start gap-1.5 overflow-hidden rounded-[1.35rem] border border-slate-100 bg-white px-0.5 pb-2.5 pt-3 text-center shadow-[0_8px_22px_rgba(15,23,42,.05)]"
              >
                {/*
                  Measured off the reference rather than guessed.

                  「不改動比例」. At 393pt with the page's px-6 and a 8px gap each
                  tile lands on 80pt, which is what the design has; the parts
                  inside it are a 36pt icon, an 11px label and a 9px hint, and
                  the whole tile is 94pt tall. The first pass made the icon 44
                  and the tile 124 — nothing was cropped, so it looked fine on
                  its own, and wrong beside everything else on the page.
                */}
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${color}`}>
                  <Icon size={19} />
                </span>
                <span className="whitespace-nowrap text-[11px] font-black leading-4 tracking-tight">{label}</span>
                <span className="whitespace-nowrap text-[9px] font-bold leading-[0.85rem] tracking-tight text-slate-400">{hint}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="min-w-0 truncate text-lg font-black">{savedNotesTitle}</h2>
            <div className="ml-3 flex shrink-0 items-center gap-2">
              {savedNotesStorageStatus === "account_linked" ? (
                <span className="flex items-center gap-1 text-xs font-bold text-violet-600" title={t("home.accountLinkedHint")}>
                  <CloudCheck size={15} /> {t("home.accountLinked")}
                </span>
              ) : savedNotesStorageStatus === "cloud_synced" ? (
                <span className="flex items-center gap-1 text-xs font-bold text-violet-600"><CloudCheck size={15} /> {t("home.syncedToTrippie")}</span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-bold text-slate-400"><CloudOff size={15} /> {t("home.deviceOnly")}</span>
              )}
              <span className="text-xs font-bold text-slate-400">{t("home.noteCount", { count: savedNotes.length })}</span>
            </div>
          </div>
          {/*
            「這只能顯示三個？要全展開」 — nothing was being cut off, the row scrolls,
            but three at a time out of nine means swiping to find out what is
            even in there. Collapsed it stays a strip, which is right when there
            are two or three; expanded it wraps into a grid and shows the lot.
          */}
          {visibleSavedNotes.length > 3 && (
            <button
              type="button"
              data-testid="toggle-saved-notes"
              onClick={() => setNotesExpanded((open) => !open)}
              className="mb-2 text-xs font-black text-[#5b3df5]"
            >
              {notesExpanded ? t("home.collapse") : t("home.expandAll", { count: visibleSavedNotes.length })}
            </button>
          )}
          {visibleSavedNotes.length ? (
            <div className={notesExpanded
              ? "grid grid-cols-3 gap-3 pb-1"
              : "flex gap-3 overflow-x-auto pb-1"}>
              {visibleSavedNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => onOpenSavedDestination(note.country, note.city)}
                  className={`relative h-[clamp(5rem,15vh,8.5rem)] overflow-hidden rounded-[1.35rem] shadow-md ${
                    notesExpanded
                      // The grid sets the width; a min-width would overflow it.
                      ? "w-full"
                      : "w-[calc((100%-24px)/3)] min-w-[108px] shrink-0"
                  }`}
                >
                  <DestinationImageLayer destination={`${note.country} ${note.city}`} />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#11183d]/85 to-transparent" />
                  <button
                    className="absolute right-3 top-3 text-white"
                    aria-label={t("home.moreNotes")}
                  >
                    <Ellipsis size={19} />
                  </button>
                  <div className="absolute bottom-4 left-4 right-4 text-white">
                    {/* 韓國・韓國: a place that only knows its country gets the
                        country copied into the city, and the label said it
                        twice. A city equal to its own country is not a city. */}
                    <p className="truncate text-base font-black">
                      {note.cityLabel && note.cityLabel !== note.countryLabel
                        ? `${note.countryLabel}・${note.cityLabel}`
                        : note.countryLabel || note.cityLabel}
                    </p>
                    <p className="mt-1 flex items-center gap-1 truncate text-xs text-white/75">
                      <MapPin size={12} />
                      {t("home.noteCount", { count: note.count })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm font-bold text-slate-400">{t("home.noSavedNotes")}</div>}
        </section>
        {visibleOtherDrafts.length > 0 && (
          <section>
            <div className="mb-4 flex items-baseline justify-between gap-2">
              <h2 className="text-xl font-black">{t("home.tripsBeingEdited")}</h2>
              {/*
                The two counts, when they disagree.

                「本機的還是沒有」 — a trip sat on one browser, absent from the
                account, and nothing anywhere said so. The numbers existed
                behind `?sync=1`, which is a thing a developer types.
              */}
              {cloudPresenceSummary(drafts.map(draft => draft.id), cloudTripIds, signedIn).text && (
                <span
                  data-testid="cloud-presence-summary"
                  className="shrink-0 text-[11px] font-bold text-amber-600"
                >
                  {cloudPresenceSummary(drafts.map(draft => draft.id), cloudTripIds, signedIn).text}
                </span>
              )}
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {visibleOtherDrafts.map((draft) => (
                <div
                  key={draft.id}
                  /*
                    The same size as the strip of finished trips below it.

                    「橘色跑版了吧？」 — this was the one card on the page with a
                    fixed width. `w-52` is 208px, which on a phone is more than
                    half the screen, beside two strips that fit three cards
                    across. Both strips hold trip cards; they should measure
                    the same.
                  */
                  className="relative h-48 w-[calc((100%-24px)/3)] min-w-[150px] shrink-0 overflow-hidden rounded-[1.35rem] shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => onContinueDraft(draft.id)}
                    className="absolute inset-0 h-full w-full text-left"
                    aria-label={t("home.openTrip", { name: draftLabel(draft) })}
                  >
                    <DestinationImageLayer destination={coverImageQuery(draft.destination, draft.name)} />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#11183d]/85 to-transparent" />
                    <div className="absolute bottom-4 left-4 text-white">
                      <b className="block truncate text-base">
                        {draftLabel(draft)}
                      </b>
                      <small className="mt-1 block text-xs text-white/75">
                        {formatDates(draft.startDate, draft.endDate)}
                      </small>
                      {/* The line that tells two identically-named trips apart. */}
                      <small
                        data-testid={`trip-shelf-badge-${draft.id}`}
                        className="mt-1 block text-[11px] font-bold text-white/90"
                      >
                        {tripShelfBadgeText(draft)}
                      </small>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={t("trips.moreActions", { name: draftLabel(draft) })}
                    aria-expanded={openMenuDraftId === draft.id}
                    data-testid={`trip-menu-button-${draft.id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenuDraftId((current) =>
                        current === draft.id ? null : draft.id,
                      );
                    }}
                    className="absolute right-2 top-2 z-30 flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/20"
                  >
                    <Ellipsis size={19} />
                  </button>
                  {/*
                    A trip the account has never been told about.

                    A trip publishes when it is opened while signed in, so one
                    that was made and never reopened lives on this device only
                    — and looked identical to every other card.
                  */}
                  {isOnlyOnThisDevice(draft.id, cloudTripIds, signedIn) && (
                    <span
                      data-testid={`trip-not-uploaded-${draft.id}`}
                      className="absolute left-2 top-2 z-20 flex items-center gap-1 rounded-full bg-amber-500/95 px-2 py-0.5 text-[10px] font-black text-white shadow-sm"
                    >
                      <CloudOff size={11} />{t("home.notUploaded")}
                    </span>
                  )}
                  {renderTripMenu(draft)}
                </div>
              ))}
            </div>
          </section>
        )}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-black">{t("home.yourMemories")}</h2>
            <CalendarDays size={20} className="text-violet-500" />
          </div>
          {visibleHistory.length ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {visibleHistory.slice(0, 6).map((trip) => (
                <button
                  key={trip.id}
                  onClick={() => onContinueTrip(trip)}
                  className="relative h-48 w-[calc((100%-24px)/3)] min-w-[150px] shrink-0 overflow-hidden rounded-[1.35rem] text-left shadow-md"
                >
                  <DestinationImageLayer
                    destination={coverImageQuery(trip.destination, trip.name)}
                    explicitCover={trip.travelBook?.coverPhoto}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#11183d]/90 to-transparent" />
                  <Ellipsis
                    className="absolute right-3 top-3 text-white"
                    size={19}
                  />
                  <div className="absolute bottom-4 left-4 text-white">
                    <b className="block truncate text-base">
                      {trip.destination || trip.name}
                    </b>
                    <span className="mt-1 block text-xs text-white/75">
                      {formatDates(trip.startDate, trip.endDate)}
                      {duration(trip.startDate, trip.endDate) &&
                        ` · ${duration(trip.startDate, trip.endDate)}`}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm font-bold text-slate-400">{t("home.noMemoriesYet")}</div>}
        </section>
      </main>
      <ConfirmDialog
        request={
          pendingDeleteDraft
            ? {
                title: t("trips.deleteConfirmTitle"),
                description: t("trips.deleteConfirmBody", { name: draftLabel(pendingDeleteDraft) }),
                confirmLabel: t("trips.deleteTrip"),
                tone: "danger",
                icon: "trash",
              }
            : null
        }
        error={deleteError}
        requireTypedText={t("trips.deleteTypedConfirmation")}
        dialogTestId="delete-trip-dialog"
        cancelTestId="cancel-delete-trip"
        confirmTestId="confirm-delete-trip"
        inputTestId="delete-trip-confirm-input"
        titleId="delete-trip-title"
        onCancel={() => {
          setPendingDeleteDraft(null);
          setDeleteError("");
        }}
        onConfirm={() => {
          if (!pendingDeleteDraft) return;
          // Identity is the stable id, never the name or the position.
          if (onDeleteDraft && onDeleteDraft(pendingDeleteDraft.id)) {
            setPendingDeleteDraft(null);
            setDeleteError("");
            return;
          }
          // The card stays, and the dialog explains why.
          setDeleteError(t("trips.deleteFailed"));
        }}
      />
      <AppBottomNav
        active={activeSection}
        onChange={onSectionChange}
        onPlus={onPlus}
      />
      {notificationsOpen && (
        <NotificationCenter
          notices={notices}
          onClose={() => setNotificationsOpen(false)}
          onOpen={(notice) => {
            setNotificationsOpen(false);
            onOpenNotice?.(notice);
          }}
        />
      )}
    </div>
  );
};

export default TravelHome;
