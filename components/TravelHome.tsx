import React, { useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from './ConfirmDialog';
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
import AppBottomNav, { AppSection } from "./AppBottomNav";
import { isSearching, matchesQuery } from "../services/travelHomeSearch";
import NotificationCenter from "./NotificationCenter";
import { DisputeNotice } from "../services/disputeInbox";

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
}

type SavedNotesStorageStatus = "device_only" | "account_linked" | "cloud_synced";

const getSavedNotesStorageStatus = (authStatus: Props["authStatus"]): SavedNotesStorageStatus =>
  authStatus === "authenticated" ? "account_linked" : "device_only";

const formatDates = (start?: string, end?: string) => {
  if (!start && !end) return "日期尚未設定";
  const format = (value?: string) =>
    value ? value.slice(0, 10).replace(/-/g, "/") : "未定";
  return `${format(start)} - ${format(end)}`;
};

const formatTripDate = (date?: string) => {
  if (!date) return "";

  const parsed = new Date(`${date}T00:00:00`);

  return new Intl.DateTimeFormat("zh-TW", {
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

  return `${diff} 天 ${Math.max(0, diff - 1)} 夜`;
};

const duration = (start?: string, end?: string) => {
  if (!start || !end) return "";
  const days =
    Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / 86400000,
    ) + 1;
  return days > 0 ? `${days} 天` : "";
};

const destinationImageFixtures: Record<string, string> = {
  東京: "photo-1493976040374-85c8e12f0c0e",
  日本: "photo-1493976040374-85c8e12f0c0e",
  大阪: "photo-1528360983277-13d401cdc186",
  京都: "photo-1492571350019-22de08371fd3",
  釜山: "photo-1538485399081-7c897a0c8d7b",
  濟州島: "photo-1539650116574-75c0c6d73f6e",
  沖繩: "photo-1507527514-7b7b0c5a7d5a",
  巴黎: "photo-1502602898657-3e91760cbb34",
  聖托里尼: "photo-1570077188670-e3a8d69ac5ff",
};

const fixtureImageFor = (destination?: string) => {
  const normalized = destination?.trim() || "";
  const fixtureId = Object.entries(destinationImageFixtures).find(([name]) =>
    normalized.includes(name),
  )?.[1] || "photo-1500534623283-312aade485b7";

  return `https://images.unsplash.com/${fixtureId}?auto=format&fit=crop&w=1000&q=85`;
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
}) => {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const activeDraft =
    drafts.find((draft) => draft.id === activeDraftId) || drafts[0];
  const tripDurationText = getTripDurationText(
    activeDraft?.startDate,
    activeDraft?.endDate,
  );
  const tripStatus = activeDraft?.startDate && activeDraft?.endDate
    ? (() => {
        const today = new Date();
        const start = new Date(`${activeDraft.startDate}T00:00:00`);
        const end = new Date(`${activeDraft.endDate}T23:59:59`);
        return today >= start && today <= end
          ? "during"
          : today < start
            ? "upcoming"
            : "completed";
      })()
    : "upcoming";
  const tripStatusLabel =
    tripStatus === "during"
      ? "旅行中"
      : tripStatus === "upcoming"
        ? "即將出發"
        : "旅程";
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
    const groups = new Map<string, { country: string; city: string; count: number; id: string }>();
    savedTravelInspirations.forEach((item) => {
      const country = item.country.trim();
      const city = item.city.trim();
      if (!country || !city) return;
      const key = `${country.toLocaleLowerCase()}::${city.toLocaleLowerCase()}`;
      const current = groups.get(key);
      groups.set(key, current ? { ...current, count: current.count + 1 } : { country, city, count: 1, id: `saved-${key}` });
    });
    return Array.from(groups.values());
  }, [savedTravelInspirations]);
  const savedNotesStorageStatus = getSavedNotesStorageStatus(authStatus);
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
  const visibleSavedNotes = savedNotes.filter((note) =>
    matchesQuery(query, note.country, note.city, `${note.country}・${note.city}`));
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
    draft.name?.trim() || draft.destination || "未命名旅程";

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
          刪除旅程
        </button>
      </span>
    ) : null;
  const savedNotesTitle = authStatus === "authenticated"
    ? `${authenticatedDisplayName?.trim() || "我的"} 儲存的旅行筆記`
    : "我的儲存旅行筆記";

  return (
    <div className="mx-auto flex min-h-screen w-full flex-col bg-[#f7f8fc] pb-28 text-[#11183d] shadow-2xl md:max-w-2xl lg:max-w-2xl">
      <header data-safe-top style={{ ["--safe-top-base" as string]: "1.5rem" }} className="bg-white px-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[2rem] font-black tracking-tight">
            <span className="text-3xl text-violet-600">✈</span>Trippie
          </div>
          <div className="flex gap-3 text-slate-600">
            <button
              type="button"
              data-testid="open-notifications"
              onClick={() => setNotificationsOpen(true)}
              className="relative flex h-12 w-12 items-center justify-center rounded-full bg-slate-50"
              aria-label={notices.length > 0 ? `通知（${notices.length} 則未讀）` : '通知'}
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
              aria-label="搜尋"
            >
              <Search size={23} />
            </button>
            <button
              type="button"
              data-testid="travel-more"
              onClick={() => onSectionChange("profile")}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50"
              aria-label="更多"
            >
              <Ellipsis size={23} />
            </button>
          </div>
        </div>
        <p className="mt-5 text-lg font-bold text-slate-400">嗨，旅人 👋</p>
        <h1 className="mt-1.5 text-[2.65rem] font-black leading-[1.05] tracking-tight">
          下一趟去哪裡？
        </h1>
        {/*
          The search the design puts directly under the question.

          It searches what the traveller already has — trips, saved notes, past
          journeys — rather than opening a destination catalogue that does not
          exist. A field that answers nothing is worse than no field, and this
          screen is mostly a list of the reader's own things, which is exactly
          what someone types a name into a box to find.
        */}
        <div className="mt-5 flex items-center gap-2 rounded-[1.6rem] border border-slate-100 bg-white px-4 py-2.5 shadow-[0_8px_26px_rgba(15,23,42,.07)]">
          <Search size={20} className="shrink-0 text-slate-300" />
          <input
            ref={searchRef}
            data-testid="travel-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋目的地、景點或想做的事..."
            aria-label="搜尋你的旅程與筆記"
            className="min-w-0 flex-1 bg-transparent py-2 text-[15px] font-medium text-[#11183d] outline-none placeholder:text-slate-300"
          />
          {query.trim() ? (
            <button
              type="button"
              data-testid="clear-travel-search"
              onClick={() => setQuery("")}
              aria-label="清除搜尋"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"
            >
              <X size={20} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenPlanner}
              aria-label="讓 AI 幫我排行程"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-violet-500/25"
            >
              <ArrowRight size={20} />
            </button>
          )}
        </div>
      </header>
      <main className="flex-1 space-y-5 px-6 py-5">
        {/* While searching, the hero is a result like any other. */}
        {(activeDraft ? heroMatches : !searching) && (
        <section data-testid="travel-hero">
          {activeDraft ? (
          <article className="relative overflow-hidden rounded-[22px] bg-slate-900 shadow-sm">
            <div className="relative h-[244px] w-full">
              <DestinationImageLayer destination={activeDraft.destination || activeDraft.name} />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/65" />
              <div className="absolute left-4 top-4">
                <span className="inline-flex items-center rounded-full bg-black/45 px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur-sm">
                  {tripStatusLabel}
                </span>
              </div>
              <button
                type="button"
                className="absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-[22px] font-bold leading-none text-[#11183d] shadow-sm backdrop-blur-md transition hover:bg-white/90"
                aria-label="更多旅程選項"
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
                  {activeDraft.name?.trim() || activeDraft.destination || "未命名旅程"}
                </h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold text-white/95">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" />
                    {formatTripDate(activeDraft.startDate)}
                    {activeDraft.startDate && activeDraft.endDate ? " - " : ""}
                    {formatTripDate(activeDraft.endDate)}
                  </span>
                  {tripDurationText && (
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true">◷</span>
                      {tripDurationText}
                    </span>
                  )}
                  <span
                    data-testid={`trip-shelf-badge-${activeDraft.id}`}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Users className="h-4 w-4" />
                    {tripShelfBadgeText(activeDraft)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onContinueDraft(activeDraft.id)}
                className="absolute bottom-4 right-4 inline-flex h-[48px] items-center gap-2 rounded-[15px] bg-white px-5 text-[14px] font-extrabold text-[#11183d] shadow-[0_6px_18px_rgba(0,0,0,0.12)] transition active:scale-[0.98]"
              >
                繼續旅程
                <span aria-hidden="true" className="text-xl leading-none">→</span>
              </button>
            </div>
          </article>
          ) : (
            <div className="rounded-[1.8rem] bg-white p-8 text-center shadow-sm">
              <MapPinned className="mx-auto text-violet-500" size={30} />
              <p className="mt-4 text-lg font-black">還沒有旅程</p>
              <button
                onClick={onCreateNew}
                className="mt-5 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white"
              >
                建立第一趟旅程
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
            <p className="mt-4 text-base font-black">找不到「{query.trim()}」</p>
            <p className="mt-2 text-sm font-medium text-slate-400">
              這裡搜尋的是你自己的旅程、筆記與回憶
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
              [Sparkles, "AI 幫我排行程", "快速生成專屬行程", onOpenPlanner, "bg-violet-50 text-violet-600"],
              [FileInput, "匯入旅程資料", "機票・住宿・訂單", onAiImport || onCreateNew, "bg-blue-50 text-blue-600"],
              [Plus, "新增旅程", "開始規劃下一趟", onCreateNew, "bg-pink-50 text-pink-600"],
              /*
                探索目的地 goes to the community feed, which is where the
                app's destination inspiration actually lives — 發現 and
                下一個目的地 are tabs there. A fourth tile pointing at a screen
                that does not exist would be the thing this list was trimmed
                to remove.
              */
              [Compass, "探索目的地", "發現靈感", () => onSectionChange("community"), "bg-teal-50 text-teal-600"],
            ] as [React.ElementType, string, string, () => void, string][])
              .map(([Icon, label, hint, action, color]) => (
              <button
                key={label}
                onClick={action}
                data-testid={`quick-start-${label}`}
                className="flex min-h-[124px] flex-col items-center justify-start gap-2 rounded-[1.35rem] border border-slate-100 bg-white px-1.5 pb-3 pt-4 text-center shadow-[0_8px_22px_rgba(15,23,42,.05)]"
              >
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${color}`}>
                  <Icon size={22} />
                </span>
                <span className="text-[11px] font-black leading-4">{label}</span>
                <span className="text-[9px] font-bold leading-3 text-slate-400">{hint}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="min-w-0 truncate text-xl font-black">{savedNotesTitle}</h2>
            <div className="ml-3 flex shrink-0 items-center gap-2">
              {savedNotesStorageStatus === "account_linked" ? (
                <span className="flex items-center gap-1 text-xs font-bold text-violet-600" title="目前僅代表已連結帳號，尚未啟用雲端同步">
                  <CloudCheck size={15} /> 已連結帳號
                </span>
              ) : savedNotesStorageStatus === "cloud_synced" ? (
                <span className="flex items-center gap-1 text-xs font-bold text-violet-600"><CloudCheck size={15} /> 已同步至 Trippie</span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-bold text-slate-400"><CloudOff size={15} /> 僅儲存在此裝置</span>
              )}
              <span className="text-xs font-bold text-slate-400">{savedNotes.length} 則</span>
            </div>
          </div>
          {visibleSavedNotes.length ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {visibleSavedNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => onOpenSavedDestination(note.country, note.city)}
                  className="relative h-52 w-[calc((100%-36px)/4)] min-w-[120px] shrink-0 overflow-hidden rounded-[1.35rem] shadow-md"
                >
                  <DestinationImageLayer destination={`${note.country} ${note.city}`} />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#11183d]/85 to-transparent" />
                  <button
                    className="absolute right-3 top-3 text-white"
                    aria-label="更多筆記"
                  >
                    <Ellipsis size={19} />
                  </button>
                  <div className="absolute bottom-4 left-4 right-4 text-white">
                    <p className="truncate text-base font-black">
                      {note.country}・{note.city}
                    </p>
                    <p className="mt-1 flex items-center gap-1 truncate text-xs text-white/75">
                      <MapPin size={12} />
                      {note.count} 則
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm font-bold text-slate-400">尚未儲存旅行筆記</div>}
        </section>
        {visibleOtherDrafts.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-black">編輯中的旅行</h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {visibleOtherDrafts.map((draft) => (
                <div
                  key={draft.id}
                  className="relative h-40 w-52 shrink-0 overflow-hidden rounded-[1.35rem] shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => onContinueDraft(draft.id)}
                    className="absolute inset-0 h-full w-full text-left"
                    aria-label={`開啟 ${draftLabel(draft)}`}
                  >
                    <DestinationImageLayer destination={draft.destination || draft.name} />
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
                    aria-label={`${draftLabel(draft)} 更多旅程選項`}
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
                  {renderTripMenu(draft)}
                </div>
              ))}
            </div>
          </section>
        )}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-black">你的旅行回憶</h2>
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
                    destination={trip.destination || trip.name}
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
          ) : <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm font-bold text-slate-400">尚未完成旅行回憶</div>}
        </section>
      </main>
      <ConfirmDialog
        request={
          pendingDeleteDraft
            ? {
                title: "刪除這趟旅程？",
                description: `「${draftLabel(pendingDeleteDraft)}」刪除後，這趟旅程的行程、記帳與相關資料將從目前的 Trip 資料中移除。`,
                confirmLabel: "刪除旅程",
                tone: "danger",
                icon: "trash",
              }
            : null
        }
        error={deleteError}
        requireTypedText="刪除"
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
          setDeleteError("旅程刪除失敗，這趟旅程沒有被移除，請再試一次。");
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
