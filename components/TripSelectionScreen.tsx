import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OVERLAY } from '../constants/layers';
import ConfirmDialog from './ConfirmDialog';
import {
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  CheckCircle,
  ChevronRight,
  Clock3,
  Loader2,
  MapPin,
  MoreHorizontal,
  Plane,
  Plus,
  Share2,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Trip } from '../types';
import { TripDraft } from '../services/tripPersistence';
import {
  DestinationImage,
  fetchDestinationImage,
} from '../services/destinationImageService';
import { fetchShoppingSuggestions } from '../services/geminiService';

interface Props {
  currentDraftExpenses: any[];
  draftName: string;
  draftStartDate?: string;
  draftEndDate?: string;
  currentLoadedTripId: string | null;
  activeDraftId: string | null;
  forceDraftEmptyState: boolean;
  currentCountry?: string;
  currentDestination?: string;
  userName?: string;
  tripHistory: Trip[];
  drafts: TripDraft[];
  onOpenDraft: (draftId: string) => void;
  onOpenTrip: (trip: Trip) => void;
  onCreateNew: () => void;
  /** Deletes one trip by stable id. Returns false when the delete failed. */
  onDeleteDraft: (id: string) => boolean;
  onRenameTrip: (id: string | null, newName: string) => void;
  /**
   * Reads a batch of photographs. The progress callback is how the overlay
   * says which of them it is on — 「解析到第幾張要顯示出來」.
   */
  onSmartScan: (
    files: FileList,
    onProgress?: (done: number, total: number) => void,
  ) => Promise<void>;
  onBatchAddShoppingItems: (
    items: string[],
    targetTripId: string | 'new' | 'draft',
    newTripName?: string,
    detectedCountry?: string,
  ) => void;
  onShare: () => void;
}

type PrimaryTrip = {
  key: string;
  trip?: Trip;
  draft?: TripDraft;
  name: string;
  startDate?: string;
  endDate?: string;
  country?: string;
  destinationImageQuery?: string;
  status: string;
  isDraft: boolean;
  hasDestination: boolean;
};

const TECHNICAL_DRAFT_NAME = /^(?:destination\s*tbd|tbd|unknown|n\/?a)$/i;

const getDraftDisplayName = (draft: TripDraft) => {
  const name = draft.name.trim();
  return name && !TECHNICAL_DRAFT_NAME.test(name) ? name : '下一趟旅程去哪？';
};

const getCompletedTripDisplayName = (trip: Trip) => {
  const name = typeof trip.name === 'string' ? trip.name.trim() : '';
  if (name && !TECHNICAL_DRAFT_NAME.test(name)) return name;
  const destination = trip.destination?.trim();
  return destination || '旅程紀錄';
};

const getDestinationImageQuery = (destination?: string, country?: string) => {
  const reliableDestination = destination?.trim().replace(/\s+/g, ' ');
  if (reliableDestination) return reliableDestination;

  const reliableCountry = country?.trim();
  return reliableCountry || undefined;
};

type JourneyThumbnailProps = {
  destination?: string;
  country?: string;
  fallbackClassName: string;
};

const JourneyThumbnail: React.FC<JourneyThumbnailProps> = ({
  destination,
  country,
  fallbackClassName,
}) => {
  const query = getDestinationImageQuery(destination, country);
  const [image, setImage] = useState<DestinationImage | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setImage(null);
    setImageFailed(false);

    if (!query) {
      return () => {
        active = false;
      };
    }

    fetchDestinationImage(query).then((result) => {
      if (active) setImage(result);
    });

    return () => {
      active = false;
    };
  }, [query]);

  return (
    <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl ${fallbackClassName}`}>
      {image && !imageFailed ? (
        <img
          src={image.imageUrl}
          alt={`${query} destination thumbnail`}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <MapPin size={20} />
      )}
    </span>
  );
};

const parseDate = (value?: string) => {
  if (!value) return null;
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dayStart = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const formatDate = (value?: string) => {
  const date = parseDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'short',
    day: 'numeric',
  }).format(date);
};

const getDateRange = (start?: string, end?: string) => {
  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  if (!startLabel && !endLabel) return '';
  if (!endLabel || startLabel === endLabel) return startLabel;
  return `${startLabel} – ${endLabel}`;
};

const getDuration = (start?: string, end?: string) => {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) return '';
  const milliseconds = dayStart(endDate).getTime() - dayStart(startDate).getTime();
  if (milliseconds < 0) return '';
  const days = Math.floor(milliseconds / 86_400_000) + 1;
  return `${days} 天`;
};

const TripSelectionScreen: React.FC<Props> = ({
  currentDraftExpenses,
  draftName,
  draftStartDate,
  draftEndDate,
  currentLoadedTripId,
  activeDraftId,
  forceDraftEmptyState,
  currentCountry,
  currentDestination,
  userName,
  tripHistory,
  drafts,
  onOpenDraft,
  onOpenTrip,
  onCreateNew,
  onDeleteDraft,
  onRenameTrip: _onRenameTrip,
  onSmartScan,
  onBatchAddShoppingItems,
  onShare,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);
  const [tripDescription, setTripDescription] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const [suggestions, setSuggestions] = useState<
    Array<{ item: string; reason: string; selected: boolean }>
  >([]);
  const [plannedCountry, setPlannedCountry] = useState('');
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [destinationImage, setDestinationImage] = useState<DestinationImage | null>(null);
  const [destinationImageFailed, setDestinationImageFailed] = useState(false);
  const [openDraftMenuId, setOpenDraftMenuId] = useState<string | null>(null);
  /** The trip awaiting an explicit delete confirmation. */
  const [pendingDeleteDraft, setPendingDeleteDraft] = useState<TripDraft | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const activeDraft = activeDraftId
    ? drafts.find(draft => draft.id === activeDraftId)
    : undefined;
  const hasActiveDraft = Boolean(activeDraft);

  const primaryTrip = useMemo<PrimaryTrip | null>(() => {
    if (activeDraft) {
      const hasDestination = Boolean(activeDraft.destination?.trim());
      const name = hasDestination
        ? getDraftDisplayName(activeDraft)
        : '下一趟旅程去哪？';
      const country = activeDraft.travelCountry || activeDraft.taxRule?.country;
      return {
        key: activeDraft.id,
        draft: activeDraft,
        name,
        startDate: activeDraft.startDate,
        endDate: activeDraft.endDate,
        country,
        destinationImageQuery: getDestinationImageQuery(activeDraft.destination, country),
        status: '旅程草稿',
        isDraft: true,
        hasDestination,
      };
    }

    return null;
  }, [
    activeDraft,
  ]);

  const otherDrafts = useMemo(
    () => drafts
      .filter(draft => draft.id !== primaryTrip?.draft?.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [drafts, primaryTrip?.draft?.id],
  );

  const otherTrips = useMemo(
    () =>
      tripHistory
        .sort(
          (a, b) =>
            (parseDate(b.startDate)?.getTime() || parseDate(b.archivedAt)?.getTime() || 0) -
            (parseDate(a.startDate)?.getTime() || parseDate(a.archivedAt)?.getTime() || 0),
        ),
    [tripHistory],
  );

  const historyTotal = tripHistory.reduce((sum, trip) => sum + (trip.totalCost || 0), 0);
  const selectedCount = suggestions.filter((suggestion) => suggestion.selected).length;

  useEffect(() => {
    let active = true;
    setDestinationImage(null);
    setDestinationImageFailed(false);

    if (!primaryTrip?.destinationImageQuery?.trim()) {
      return () => {
        active = false;
      };
    }

    fetchDestinationImage(primaryTrip.destinationImageQuery).then((image) => {
      if (active) setDestinationImage(image);
    });

    return () => {
      active = false;
    };
  }, [primaryTrip?.destinationImageQuery]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    setIsScanning(true);
    setScanProgress({ current: 0, total: files.length });
    try {
      await onSmartScan(files, (current, total) => setScanProgress({ current, total }));
    } finally {
      setIsScanning(false);
      setScanProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGetSuggestions = async () => {
    if (!tripDescription.trim()) return;
    setIsPlanning(true);
    setSuggestions([]);
    setPlannedCountry('');
    try {
      const { suggestions: items, country } = await fetchShoppingSuggestions(tripDescription);
      setSuggestions(items.map((item) => ({ ...item, selected: false })));
      if (country) setPlannedCountry(country);
    } finally {
      setIsPlanning(false);
    }
  };

  const toggleSelection = (index: number) => {
    setSuggestions((current) =>
      current.map((suggestion, suggestionIndex) =>
        suggestionIndex === index
          ? { ...suggestion, selected: !suggestion.selected }
          : suggestion,
      ),
    );
  };

  const handleConfirmAddToTrip = (targetId: string | 'new' | 'draft') => {
    const itemsToAdd = suggestions
      .filter((suggestion) => suggestion.selected)
      .map((suggestion) => suggestion.item);
    const potentialName = targetId === 'new' ? `${tripDescription} 之旅` : undefined;
    onBatchAddShoppingItems(
      itemsToAdd,
      targetId,
      potentialName,
      targetId === 'new' ? plannedCountry : undefined,
    );
    setIsTargetModalOpen(false);
    setSuggestions([]);
    setTripDescription('');
    setPlannedCountry('');
  };

  const openPrimaryTrip = () => {
    if (!primaryTrip) return;
    if (primaryTrip.isDraft) {
      if (primaryTrip.draft) onOpenDraft(primaryTrip.draft.id);
      return;
    }
    if (primaryTrip.trip) onOpenTrip(primaryTrip.trip);
  };

  const renderDraftMenu = (draft: TripDraft) => {
    const displayName = getDraftDisplayName(draft);
    const isOpen = openDraftMenuId === draft.id;

    return (
      <span className="relative z-30 shrink-0">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpenDraftMenuId(current => current === draft.id ? null : draft.id);
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label={`${displayName} 更多操作`}
          aria-expanded={isOpen}
        >
          <MoreHorizontal size={19} />
        </button>
        {isOpen && (
          <span
            role="menu"
            className="absolute right-0 top-11 z-40 w-36 overflow-hidden rounded-2xl bg-white p-1.5 text-left shadow-xl ring-1 ring-slate-200"
          >
            <button
              type="button"
              role="menuitem"
              data-testid={`delete-trip-${draft.id}`}
              onClick={(event) => {
                event.stopPropagation();
                setOpenDraftMenuId(null);
                setDeleteError('');
                // Destructive: nothing happens until the dialog is confirmed.
                setPendingDeleteDraft(draft);
              }}
              className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50"
            >
              <Trash2 size={16} />
              刪除旅程
            </button>
          </span>
        )}
      </span>
    );
  };

  return (
    <div data-safe-top className="min-h-full bg-[#fbfcff] px-4 pb-10 text-[#10204a] sm:px-6">
      {isScanning && (
        <div className={`fixed inset-0 ${OVERLAY.sheet} flex flex-col items-center justify-center bg-[#08152f]/80 text-white backdrop-blur-sm`}>
          <Loader2 size={44} className="mb-4 animate-spin text-cyan-300" />
          <h3 className="text-lg font-bold">
            {scanProgress && scanProgress.total > 1
              ? `正在批次處理… 第 ${Math.min(scanProgress.current + 1, scanProgress.total)}/${scanProgress.total} 張`
              : '正在分析圖片…'}
          </h3>
          <p className="mt-2 text-sm text-white/70">AI 正在辨識內容並歸入適合的旅程</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="mx-auto w-full max-w-xl space-y-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 text-white shadow-lg shadow-blue-200/60">
              <Sparkles size={18} />
            </div>
            <span className="text-2xl font-black tracking-tight text-[#10245c]">Trippie</span>
          </div>
          <button
            type="button"
            onClick={onShare}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md"
            aria-label="分享旅程"
          >
            <Share2 size={18} />
          </button>
        </header>

        <section className="pt-1">
          <p className="text-lg font-black tracking-tight text-[#10204a]">
            {userName && userName !== '旅人' ? `嗨，${userName} 👋` : '嗨，旅人 👋'}
          </p>
          <h1 className="mt-0.5 text-[25px] font-semibold leading-tight tracking-tight text-[#0d1d43]">
            下一趟去哪裡？
          </h1>
        </section>

        {primaryTrip ? (
          <section className="relative min-h-[265px] overflow-hidden rounded-[26px] bg-gradient-to-br from-[#155eef] via-[#2685f5] to-[#42c7e9] p-5 text-white shadow-[0_16px_40px_-24px_rgba(30,94,238,0.8)] sm:p-6">
            {destinationImage && !destinationImageFailed && (
              <>
                <img
                  src={destinationImage.imageUrl}
                  alt={`${primaryTrip.destinationImageQuery} destination scenery`}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={() => setDestinationImageFailed(true)}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#071a3d]/95 via-[#0a3470]/60 to-[#0b3b78]/30" />
              </>
            )}

            <div className="relative z-20 flex items-center justify-between gap-4">
              <span className="rounded-full bg-white/18 px-3 py-1 text-xs font-bold backdrop-blur">
                {primaryTrip.status}
              </span>
              <span className="flex items-center gap-1.5">
                {primaryTrip.country && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-white/80">
                    <MapPin size={13} />
                    {primaryTrip.country}
                  </span>
                )}
                {primaryTrip.draft && renderDraftMenu(primaryTrip.draft)}
              </span>
            </div>

            <div className="relative z-10 mt-10">
              <p className="text-sm font-semibold text-cyan-50">Your next trip</p>
              <h2 className="mt-1 text-3xl font-black tracking-tight">{primaryTrip.name}</h2>
              {(getDateRange(primaryTrip.startDate, primaryTrip.endDate) ||
                getDuration(primaryTrip.startDate, primaryTrip.endDate)) && (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold text-white/85">
                  {getDateRange(primaryTrip.startDate, primaryTrip.endDate) && (
                    <span className="flex items-center gap-1.5">
                      <CalendarDays size={15} />
                      {getDateRange(primaryTrip.startDate, primaryTrip.endDate)}
                    </span>
                  )}
                  {getDuration(primaryTrip.startDate, primaryTrip.endDate) && (
                    <span className="flex items-center gap-1.5">
                      <Clock3 size={15} />
                      {getDuration(primaryTrip.startDate, primaryTrip.endDate)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {destinationImage && !destinationImageFailed && (
              <p className="relative z-10 mt-5 text-[10px] font-medium text-white/75">
                Photo by{' '}
                <a
                  href={destinationImage.photographerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-white/40 underline-offset-2 hover:text-white"
                >
                  {destinationImage.photographer}
                </a>{' '}
                on{' '}
                <a
                  href={destinationImage.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-white/40 underline-offset-2 hover:text-white"
                >
                  Pexels
                </a>
              </p>
            )}

            <button
              type="button"
              onClick={openPrimaryTrip}
              className="relative z-10 mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-black text-blue-700 shadow-lg shadow-blue-900/10 transition hover:-translate-y-0.5"
            >
              {primaryTrip.isDraft && !primaryTrip.hasDestination ? '繼續規劃' : '繼續旅程'}
              <ArrowRight size={17} />
            </button>
          </section>
        ) : (
          <section
            className="relative h-[188px] overflow-hidden rounded-[26px] bg-gradient-to-br from-[#dff5ff] via-[#b9e5ff] to-[#7dc7f4]"
            aria-label="旅行靈感插畫"
          >
            <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/55 blur-sm" />
            <div className="absolute right-9 top-8 h-14 w-14 rounded-full bg-[#fff3bd]/90 shadow-[0_0_34px_rgba(255,239,160,0.75)]" />

            <svg
              className="absolute inset-x-0 top-4 h-24 w-full text-white/80"
              viewBox="0 0 390 96"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M28 72C91 20 153 76 216 38C269 6 319 26 357 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="5 8"
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute right-6 top-3 rotate-12 text-white drop-shadow-sm">
              <Plane size={28} strokeWidth={1.8} />
            </span>

            <div className="absolute inset-x-0 bottom-0 h-[96px] bg-gradient-to-t from-[#75b8a7] to-[#96d7c0] [clip-path:polygon(0_55%,14%_38%,27%_52%,43%_17%,58%_49%,73%_27%,100%_58%,100%_100%,0_100%)]" />
            <div className="absolute inset-x-0 bottom-0 h-[74px] bg-gradient-to-t from-[#246a72] to-[#4ca1a0] [clip-path:polygon(0_60%,18%_31%,34%_64%,53%_20%,68%_58%,86%_34%,100%_52%,100%_100%,0_100%)]" />
            <div className="absolute -bottom-10 left-1/2 h-28 w-16 -translate-x-1/2 rotate-6 rounded-[50%] bg-gradient-to-t from-[#f8dfad] via-[#fff3d5] to-white/80 blur-[0.5px]" />

          </section>
        )}

        <section className="space-y-3">
          {!primaryTrip && (
            <p className="max-w-sm text-sm leading-6 text-slate-500">
              建立旅程，或直接用截圖開始整理下一趟旅行。
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCreateNew}
              className={`flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${
                primaryTrip
                  ? 'order-2 shrink-0 bg-slate-100 text-slate-600 hover:bg-slate-200'
                  : 'order-1 flex-1 bg-blue-600 text-white shadow-[0_12px_24px_-16px_rgba(37,99,235,0.9)] hover:bg-blue-700'
              }`}
            >
              <Plus size={18} />
              {primaryTrip ? '新增旅程' : '建立第一趟旅程'}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-700 transition hover:bg-cyan-100 ${
                primaryTrip ? 'order-1 flex-1' : 'order-2 shrink-0'
              }`}
            >
              <Camera size={18} />
              AI 匯入
            </button>
          </div>
          <p className="flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
            <Sparkles size={12} className="text-purple-500" />
            AI 可從行程截圖或單據協助整理真實資料
          </p>
        </section>

        <section id="ai-trip-planner" className="scroll-m-6 overflow-hidden rounded-2xl bg-purple-50/55">
          <div className="p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-purple-600">
                <Sparkles size={17} />
              </span>
              <div>
                <h2 className="text-sm font-black text-[#10204a]">AI Trip Planner</h2>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-400">
                  需要靈感時，再請 AI 協助整理準備事項。
                </p>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <MapPin
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300"
                  size={16}
                />
                <input
                  value={tripDescription}
                  onChange={(event) => setTripDescription(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleGetSuggestions()}
                  placeholder="例如：冬天去北海道滑雪"
                  className="w-full rounded-xl bg-white/90 py-2.5 pl-10 pr-3 text-sm text-slate-700 outline-none transition focus:ring-2 focus:ring-purple-300"
                />
              </div>
              <button
                type="button"
                onClick={handleGetSuggestions}
                disabled={isPlanning || !tripDescription.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white transition hover:bg-purple-700 disabled:opacity-40"
                aria-label="取得 AI 建議"
              >
                {isPlanning ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              </button>
            </div>

            {suggestions.length > 0 && (
              <div className="mt-4 space-y-2">
                {suggestions.map((suggestion, index) => (
                  <button
                    type="button"
                    key={`${suggestion.item}-${index}`}
                    onClick={() => toggleSelection(index)}
                    className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition ${
                      suggestion.selected
                        ? 'bg-purple-600 text-white ring-purple-600'
                        : 'bg-white text-slate-700 ring-slate-100 hover:ring-purple-200'
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        suggestion.selected
                          ? 'bg-white text-purple-600'
                          : 'bg-purple-50 text-purple-500'
                      }`}
                    >
                      {suggestion.selected ? <Check size={14} /> : <Plus size={14} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{suggestion.item}</span>
                      <span
                        className={`mt-0.5 block text-[11px] leading-4 ${
                          suggestion.selected ? 'text-purple-100' : 'text-slate-400'
                        }`}
                      >
                        {suggestion.reason}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {selectedCount > 0 && (
              <button
                type="button"
                onClick={() => setIsTargetModalOpen(true)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#10204a] px-4 py-3 text-sm font-black text-white"
              >
                <ShoppingBag size={16} />
                將 {selectedCount} 個項目加入旅程
              </button>
            )}
          </div>
        </section>

        {otherDrafts.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-500">
                  More journeys
                </p>
                <h2 className="mt-1 text-lg font-black text-[#10204a]">其他旅程</h2>
              </div>
            </div>
            <div className="space-y-2.5">
              {otherDrafts.map((draft) => (
                <div
                  key={draft.id}
                  className="relative flex w-full items-center rounded-2xl bg-white pr-1 shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => onOpenDraft(draft.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
                  >
                    <JourneyThumbnail
                      destination={draft.destination}
                      country={draft.travelCountry || draft.taxRule?.country}
                      fallbackClassName="bg-gradient-to-br from-purple-50 to-blue-50 text-purple-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-[#10204a]">
                        {getDraftDisplayName(draft)}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span>旅程草稿</span>
                        {getDateRange(draft.startDate, draft.endDate) && (
                          <span>· {getDateRange(draft.startDate, draft.endDate)}</span>
                        )}
                      </span>
                    </span>
                    <ChevronRight size={17} className="shrink-0 text-slate-300" />
                  </button>
                  {renderDraftMenu(draft)}
                </div>
              ))}
            </div>
          </section>
        )}

        {otherTrips.length > 0 && (
          <section>
            <div className="mb-3">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-500">
                Completed Journeys
              </p>
              <h2 className="mt-1 text-lg font-black text-[#10204a]">已完成的旅程</h2>
            </div>
            <div className="space-y-2.5">
              {otherTrips.map((trip) => {
                const dateSummary = getDateRange(trip.startDate, trip.endDate) || formatDate(trip.archivedAt);
                return (
                  <button
                    type="button"
                    key={trip.id}
                    onClick={() => onOpenTrip(trip)}
                    className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <JourneyThumbnail
                      destination={trip.destination}
                      fallbackClassName="bg-gradient-to-br from-blue-50 to-slate-50 text-blue-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-[#10204a]">
                        {getCompletedTripDisplayName(trip)}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1 text-blue-600">
                          <CheckCircle size={12} /> 已完成
                        </span>
                        {dateSummary && <span>· {dateSummary}</span>}
                      </span>
                    </span>
                    <ChevronRight size={17} className="shrink-0 text-slate-300" />
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {tripHistory.length > 0 && (
          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <CalendarDays size={16} />
              </span>
              <p className="mt-4 text-2xl font-black text-[#10204a]">{tripHistory.length}</p>
              <p className="text-xs font-semibold text-slate-400">已記錄旅程</p>
            </div>
            {historyTotal > 0 && (
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
                  <ShoppingBag size={16} />
                </span>
                <p className="mt-4 truncate text-xl font-black text-[#10204a]">
                  ${Math.round(historyTotal).toLocaleString()}
                </p>
                <p className="text-xs font-semibold text-slate-400">歷史旅費 TWD</p>
              </div>
            )}
          </section>
        )}
      </div>

      <ConfirmDialog
        request={
          pendingDeleteDraft
            ? {
                title: '刪除這趟旅程？',
                description: `「${getDraftDisplayName(pendingDeleteDraft)}」刪除後，這趟旅程的行程、記帳與相關資料將從目前的 Trip 資料中移除。`,
                confirmLabel: '刪除旅程',
                tone: 'danger',
                icon: 'trash',
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
          setDeleteError('');
        }}
        onConfirm={() => {
          if (!pendingDeleteDraft) return;
          // Identity is the stable id, never the name or the position.
          if (onDeleteDraft(pendingDeleteDraft.id)) {
            setPendingDeleteDraft(null);
            setDeleteError('');
            return;
          }
          // The card stays, and the dialog explains why.
          setDeleteError('旅程刪除失敗，這趟旅程沒有被移除，請再試一次。');
        }}
      />

      {isTargetModalOpen && (
        <div className={`fixed inset-0 ${OVERLAY.modal} flex items-center justify-center bg-[#08152f]/70 p-4 backdrop-blur-sm`}>
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <h2 className="flex items-center gap-2 font-black text-[#10204a]">
                <ShoppingBag size={18} className="text-purple-600" />
                選擇目標旅程
              </h2>
              <button
                type="button"
                onClick={() => setIsTargetModalOpen(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
                aria-label="關閉"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 p-5">
              <p className="text-sm text-slate-500">
                將 <span className="font-black text-purple-600">{selectedCount}</span> 個建議加入：
              </p>
              <button
                type="button"
                onClick={() => handleConfirmAddToTrip('new')}
                className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-purple-200 p-4 text-left transition hover:bg-purple-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                  <Plus size={18} />
                </span>
                <span>
                  <span className="block text-sm font-black text-[#10204a]">建立新旅程</span>
                  <span className="text-xs text-slate-400">{tripDescription || '新旅程'}</span>
                </span>
              </button>

              {drafts.map((draft) => (
                <button
                  type="button"
                  key={draft.id}
                  onClick={() => handleConfirmAddToTrip(draft.id)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-4 text-left"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <CheckCircle size={18} />
                  </span>
                  <span>
                    <span className="block text-sm font-black text-[#10204a]">
                      {getDraftDisplayName(draft)}
                    </span>
                    <span className="text-xs text-slate-400">加入這趟旅程草稿</span>
                  </span>
                </button>
              ))}

              {tripHistory.map((trip) => (
                <button
                  type="button"
                  key={trip.id}
                  onClick={() => handleConfirmAddToTrip(trip.id)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-4 text-left"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
                    <MapPin size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-[#10204a]">{trip.name}</span>
                    <span className="text-xs text-slate-400">
                      {getDateRange(trip.startDate, trip.endDate)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TripSelectionScreen;
