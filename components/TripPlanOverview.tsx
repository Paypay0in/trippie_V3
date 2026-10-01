import React, { useEffect, useState } from 'react';
import { HelpRequest } from '../services/serviceMatching';
import { classifyTask } from '../services/taskAssistance';
import { TaskBundleProposal } from '../services/taskBundling';
import { suggestTaskBundles } from '../services/serviceBundleSuggestion';
import { ActivityPlanProposal, fetchActivityPlans } from '../services/activityPlanProposal';
import ActivityPlanCards from './ActivityPlanCards';
import { tripDays, tripDaysBrief } from '../services/tripFreeDays';
import ServiceRequestSheet from './ServiceRequestSheet';
import { ServiceRequest } from '../types';
import { AlertTriangle, ArrowRight, ArrowUpRight, BadgeCheck, ChevronRight, ExternalLink, FileText, Lightbulb, Luggage, CalendarDays, CheckCircle2, Circle, Compass, MapPinned, Plane, Receipt, ShoppingBag, Sparkles, Users, ChevronDown, ChevronUp, Handshake } from 'lucide-react';
import { openAppWithFallback, browserLaunchEnvironment } from '../services/appLaunch';
import { CommunityPost, Expense, ItineraryItem, SavedTravelInspiration, ShoppingItem, TravelRules } from '../types';
import { fetchSuggestedPlaces } from '../services/preparationSuggestionService';
import { DestinationTip, getDestinationTips } from '../services/destinationTips';
import { findOfficialLink } from '../services/officialTravelLinks';

/**
 * Formalities you complete by filling something in. Only these carry a link.
 *
 * A link under 護照效期 pointed at the passport agency, which has nothing for
 * someone who only needs to check an expiry date — and a button that leads
 * somewhere useless teaches people to stop pressing the ones that are not.
 */
const FILLABLE_ACTIONS = new Set([
  'visa_or_eta',
  'health_declaration',
  'customs_declaration',
  'arrival_form',
]);

/**
 * The official page for one formality, when there is something to fill in.
 *
 * The research returns a source with each item, so that is what is shown: the
 * page the guidance was actually read from, rather than a second answer from a
 * table maintained here. The table stays as a fallback for items the lookup
 * returns without one — an application with nowhere to go is the gap that
 * sends people to a search engine full of paid intermediaries.
 */
const officialLinkFor = (
  task: ShoppingItem,
  country?: string,
): { label: string; url: string } | null => {
  if (!FILLABLE_ACTIONS.has(task.travelRuleActionType ?? '')) return null;
  const source = task.source;
  if (source?.url) {
    return { label: source.publisher || source.title || '官方網站', url: source.url };
  }
  return findOfficialLink(country, task.name);
};
import { splitSharedPrefix } from '../services/sharedLabelPrefix';
import { PASSPORT_OPTIONS } from '../services/passportOptions';
import { isGuidanceOutdated } from '../services/entryRuleFreshness';
import { communityHighlights } from '../services/communityHighlights';
import { todoLinksFor } from '../services/todoLinks';

interface Props {
  expenses: Expense[];
  shoppingList: ShoppingItem[];
  itinerary: ItineraryItem[];
  companionCount: number;
  dateRange: string;
  onContinuePlanning: () => void;
  onEnterTripMode: () => void;
  /**
   * Opens the traveller list from the 旅行成員 tile.
   *
   * The tile was the only place the count appeared and it led nowhere, so
   * 「2 人」 was a number with no way to ask who. On a trip where one of the two
   * had silently lost her seat four times, that was the question.
   */
  onManageMembers?: () => void;
  onExploreInspiration: () => void;
  destination?: string;
  destinationCountry?: string;
  travelRules?: TravelRules;
  /**
   * 'plan' is the whole pre-trip screen. 'reference' keeps only what stays
   * useful once the trip has started — the entry rules, the cautions, the
   * local know-how and the assistant — so a trip already under way shows them
   * instead of hiding them behind a phase it has passed.
   */
  variant?: 'plan' | 'reference';
  /** Hands a question or a to-do to the service tab, worded as the traveller wrote it. */
  onRequestHumanHelp?: (request: HelpRequest) => void;
  /**
   * Publishes one request covering the tasks the traveller selected. Publishing
   * is not completing: the checklist ticks stay theirs.
   */
  onPublishServiceRequest?: (
    draft: Omit<ServiceRequest, 'id' | 'tripId' | 'requestedByUserId' | 'createdAt' | 'status'>,
  ) => void;
  /** Whether a passport with a country code is on file, so the lookup can run. */
  hasPassport: boolean;
  /** The passport the lookup will use, named rather than assumed. */
  passportLabel?: string;
  /** Runs the entry-rules lookup with the default passport. */
  onResearchEntryRules: () => Promise<void> | void;
  /** Opens the full identity sheet, for choosing a different passport. */
  onOpenIdentity: () => void;
  /** Passports on file, so the picker is filled in place. */
  /** Country code of the passport the lookup will use, if any. */
  passportCountryCode?: string;
  /** Choosing a country creates or selects that passport. */
  onSelectPassportCountry: (countryCode: string) => void;
  onChangeDestination: (value: string) => void;
  /** Departure date, used to spot guidance whose period has already passed. */
  tripStartDate?: string;
  /**
   * Published posts about this destination, offered to the assistant as
   * first-hand experience. Travellers' accounts, not official rules — the
   * prompt is told the difference and the answer links back to whichever it
   * used, so a reader can judge the source themselves.
   */
  communityPosts: CommunityPost[];
  onOpenPost: (postId: string) => void;
  /** Saves across all posts, used to rank what travellers recommend here. */
  savedInspirations: SavedTravelInspiration[];
  onTogglePreparationItem: (id: string) => void;
  onAddPreparationItems: (items: string[]) => void;
  /** Applies a confirmed plan through the existing itinerary acceptance path. */
  onApplyPlanOption?: (items: ItineraryItem[]) => void;
  /** Trip origin, so travel time can be measured rather than guessed. */
  originLatitude?: number;
  originLongitude?: number;
  tripEndDate?: string;
  /** Behavioural events. Being shown an option is not evidence of preference. */
  onPlanOptionsShown?: (requestId: string, options: ActivityPlanProposal[]) => void;
  /** What the traveller asked to have changed, in their own words. */
  onPlanRevisionRequested?: (requestId: string, plan: ActivityPlanProposal, feedback: string) => void;
  onPlanOptionSelected?: (requestId: string, option: ActivityPlanProposal, shown: ActivityPlanProposal[]) => void;
  onPlanOptionDismissed?: (requestId: string, option: ActivityPlanProposal, shown: ActivityPlanProposal[]) => void;
  onPlanAddedToItinerary?: (
    requestId: string,
    option: ActivityPlanProposal,
    shown: ActivityPlanProposal[],
    itemIds: string[],
  ) => void;
  /**
   * What this traveller has actually spent per day on past trips, phrased as an
   * observation. Given to the planner as context, never as a stated budget.
   */
  budgetBrief?: string;
}

/* Tinted tiles, cycled. Colour here carries no meaning — it separates tiles
   at a glance, which is what the Founder's mockup is doing. */
const RULE_TONES = [
  { surface: 'bg-[#f3f0ff]', title_color: 'text-[#4c1d95]', icon_color: 'text-violet-600', icon: FileText },
  { surface: 'bg-[#eafaf1]', title_color: 'text-[#065f46]', icon_color: 'text-emerald-600', icon: BadgeCheck },
  { surface: 'bg-slate-100', title_color: 'text-[#11183d]', icon_color: 'text-slate-500', icon: Luggage },
];

/* One short line per kind of formality. The research's own description is a
   paragraph written to be read in full; cut to two lines on a card it stops
   mid-clause and says nothing. What the card needs is what this item is about,
   which the action type already tells us. */
const RULE_SUMMARIES: Record<string, string> = {
  visa_or_eta: '確認是否需要簽證、停留天數',
  passport_validity: '確認護照效期是否足夠',
  health_declaration: '出發前完成健康或檢疫申報',
  customs_declaration: '確認可攜帶物品與申報規定',
  arrival_form: '準備入境表格與所需文件',
  required_documents: '準備護照、回程機票等文件',
  onward_travel: '準備離境或轉機證明',
  other: '查看這項規定的細節',
};

const TIP_LABELS: Record<DestinationTip['kind'], string> = {
  app: 'APP',
  payment: '支付',
  transport: '交通',
  connectivity: '網路',
  custom: '當地習慣',
};

const TripPlanOverview: React.FC<Props> = ({ expenses, shoppingList, itinerary, companionCount, dateRange, onContinuePlanning, onEnterTripMode, onManageMembers, onExploreInspiration, destination, destinationCountry, travelRules, variant = 'plan', onRequestHumanHelp, onPublishServiceRequest, hasPassport, passportLabel, onResearchEntryRules, onOpenIdentity, passportCountryCode, onSelectPassportCountry, onChangeDestination, tripStartDate, communityPosts, onOpenPost, savedInspirations, onTogglePreparationItem, onAddPreparationItems, onApplyPlanOption, budgetBrief, originLatitude, originLongitude, tripEndDate, onPlanOptionsShown, onPlanRevisionRequested, onPlanOptionSelected, onPlanOptionDismissed, onPlanAddedToItinerary }) => {
  const shoppingPreTasks = shoppingList.filter(item => item.phase === 'pre');
  const preTasks = shoppingPreTasks;
  const completed = preTasks.filter(item => 'completed' in item ? item.completed : item.isPurchased);
  const pending = preTasks.filter(item => !('completed' in item ? item.completed : item.isPurchased));
  const preExpenses = expenses.filter(expense => expense.phase === 'pre');
  const total = preExpenses.reduce((sum, expense) => sum + expense.twdAmount, 0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  /** Venue site per to-do name, resolved from the map service. */
  const [taskVenues, setTaskVenues] = useState<Record<string, { name: string; websiteUrl?: string }>>({});
  /** To-dos picked out to hand to a person; nothing is published until confirmed. */
  const [selectedHelpTaskIds, setSelectedHelpTaskIds] = useState<string[]>([]);
  const [isPublishingHelp, setIsPublishingHelp] = useState(false);
  const [bundleProposal, setBundleProposal] = useState<TaskBundleProposal | null>(null);
  const [planOptions, setPlanOptions] = useState<ActivityPlanProposal[]>([]);
  const [planIntro, setPlanIntro] = useState('');
  const [planRequestId, setPlanRequestId] = useState('');
  const [planSources, setPlanSources] = useState<Array<{ title?: string; url?: string }>>([]);
  const [planError, setPlanError] = useState('');
  const [planGrounded, setPlanGrounded] = useState(true);
  const [isRevisingPlan, setIsRevisingPlan] = useState(false);
  const [showAllRules, setShowAllRules] = useState(false);
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState('');
  const context = destination?.trim();
  const localTips = getDestinationTips(destinationCountry || destination);
  // What the traveller last asked about, so the recommendations answer the
  // question rather than the country. Kept separate from the live textarea: the
  // list should not churn on every keystroke.
  const [askedTopic, setAskedTopic] = useState('');
  // Which days are free and which hold something pinned. Counted from the
  // itinerary, never asked of the model.
  const planDays = tripDays({ startDate: tripStartDate, endDate: tripEndDate, itinerary });
  const highlights = communityHighlights({
    posts: communityPosts,
    saved: savedInspirations,
    country: destinationCountry,
    destination,
    topic: askedTopic,
  });
  // Two different things had been sharing one list. Entry formalities come
  // from the travel-rules lookup and are what a country requires; everything
  // else is what this traveller decided to do. Calling the section 入境規定
  // made the mixing obvious — a ski-hire enquiry is not an entry rule.
  const travelRuleTasks = shoppingPreTasks.filter(task => task.sourceType === 'travel_rules');
  // Passport validity is not something the destination asks you to do on
  // arrival — it is a condition your own document has to meet before you
  // leave. It reads as a caution, so it belongs with the cautions.
  const isPassportRule = (task: ShoppingItem) => task.name.includes('護照');
  // Every formality the destination asks for stays here; three fit across a
  // phone and the rest scroll. Capping the list and spilling the remainder
  // into the cautions put 入境卡 — a requirement — under 注意事項, which reads
  // as optional.
  const entryRules = travelRuleTasks.filter(task => !isPassportRule(task));
  const advisoryTasks = travelRuleTasks.filter(isPassportRule);
  const ownTasks = shoppingPreTasks.filter(task => task.sourceType !== 'travel_rules');

  /**
   * Which to-dos may be handed to a person, decided by rule rather than by a
   * model: misreading a free lookup as errand work turns it into a request
   * someone pays for, and misreading errand work as a lookup silently removes
   * the only option that would have helped.
   */
  const helpEligibleIds = new Set(
    ownTasks
      .filter(
        task =>
          !task.isPurchased &&
          classifyTask(task, { hasResolvedVenue: Boolean(taskVenues[task.name]) }) === 'human',
      )
      .map(task => task.id),
  );
  const helpEligibleTasks = ownTasks.filter(task => helpEligibleIds.has(task.id));
  const selectedHelpTasks = ownTasks.filter(task => selectedHelpTaskIds.includes(task.id));
  const toggleHelpTask = (taskId: string) =>
    setSelectedHelpTaskIds(current =>
      current.includes(taskId) ? current.filter(id => id !== taskId) : [...current, taskId],
    );

  const helpEligibleKey = helpEligibleTasks.map(task => task.id).join('|');
  useEffect(() => {
    // Asked for once the traveller opens the sheet, never before: a grouping
    // suggestion nobody asked to see is a model call on every render.
    if (!isPublishingHelp) return;
    let cancelled = false;
    suggestTaskBundles(helpEligibleTasks, destinationCountry || destination).then(proposals => {
      if (cancelled) return;
      // The one that covers most of what is already selected, so the suggestion
      // answers the selection rather than replacing it.
      const best = proposals
        .slice()
        .sort(
          (a, b) =>
            b.taskIds.filter(id => selectedHelpTaskIds.includes(id)).length -
            a.taskIds.filter(id => selectedHelpTaskIds.includes(id)).length,
        )[0];
      setBundleProposal(best ?? null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublishingHelp, helpEligibleKey, destinationCountry, destination]);

  const ownTaskNames = ownTasks.map(task => task.name).join('|');
  useEffect(() => {
    // A to-do that names a venue deserves the venue's own booking page, not
    // just a pin. The site comes from the map service's record of the place —
    // a URL nobody wrote for this purpose and nobody can invent.
    const names = ownTaskNames ? ownTaskNames.split('|').filter(Boolean).slice(0, 6) : [];
    const place = destinationCountry || destination;
    if (!names.length || !place) return;
    let cancelled = false;
    void fetchSuggestedPlaces(names.map(name => `${name} ${place}`)).then(groups => {
      if (cancelled) return;
      const next: Record<string, { name: string; websiteUrl?: string }> = {};
      groups.forEach(group => {
        const taskName = names.find(name => group.query.startsWith(name));
        const top = group.places[0];
        if (taskName && top) next[taskName] = { name: top.name, websiteUrl: top.websiteUrl };
      });
      setTaskVenues(next);
    });
    return () => {
      cancelled = true;
    };
  }, [ownTaskNames, destination, destinationCountry]);

  // When every formality carries the same name, the tile keeps only what tells
  // them apart. The full official name is still in the detail panel, which is
  // where someone checks what to search for.
  const ruleLabels = splitSharedPrefix(entryRules.map(task => task.name));
  // Advisories: the part of the entry research that is not a task. It has been
  // fetched all along and shown nowhere, so travellers never saw the customs
  // limits and stay conditions behind the checklist items.
  // The narrative summary restates whatever the tiles already say — the same
  // visa rule in different words — so it is shown only when there are no tiles
  // to carry it. Deciding this by wording was tried and does not work: two
  // phrasings of one rule share barely more text than two unrelated rules.
  const entrySummary = (travelRules?.entry?.summary || travelRules?.entry?.guidance || '').trim();
  /**
   * Whether this trip has been looked up at all, which is not the same as
   * whether the lookup found anything.
   *
   * 「產出之後不該再能夠按查詢」 — a search that returned no required formalities
   * rendered the first-time call to action above its own result, so the one
   * screen said both 「nothing has been looked up」 and, underneath, what the
   * lookup had said.
   */
  const alreadyLooked = Boolean(entrySummary) || Boolean(travelRules?.generatedAt);
  /** The day the rules were written, so a stale list cannot pass for a current one. */
  const lookedUpOn = travelRules?.generatedAt ? String(travelRules.generatedAt).slice(0, 10) : '';
  const entrySources = travelRules?.entry?.sources ?? [];
  const expandedTask = shoppingPreTasks.find(task => task.id === expandedTaskId);
  const expandedLink = expandedTask ? officialLinkFor(expandedTask, destinationCountry || destination) : null;

  /**
   * A revised version of one plan, asked for in the traveller's own words.
   *
   * Goes through the same endpoint as the first request, so the revision is
   * held to the same rules — the derived duration, the preparation
   * cross-check, the price hierarchy. The revised plan keeps the original's
   * id so the card the traveller is reading stays open underneath them.
   */
  const handleRevisePlan = async (plan: ActivityPlanProposal, feedback: string) => {
    if (isRevisingPlan) return;
    setIsRevisingPlan(true);
    setPlanError('');
    try {
      const result = await fetchActivityPlans({
        intent: askedTopic || plan.title,
        destination: destinationCountry || destination,
        originLatitude,
        originLongitude,
        startDate: tripStartDate,
        endDate: tripEndDate,
        daysBrief: tripDaysBrief(planDays),
        budgetBrief,
        revising: { plan, feedback },
      });
      const revised = result.options[0];
      if (!revised) {
        setPlanError('這次沒能改出可用的版本，原本那版還在。');
        return;
      }
      onPlanRevisionRequested?.(planRequestId, plan, feedback);
      setPlanOptions(current => current.map(option => (
        option.id === plan.id ? { ...revised, id: plan.id } : option
      )));
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : '現在改不了，稍後再試一次。');
    } finally {
      setIsRevisingPlan(false);
    }
  };

  const handleGenerate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = prompt.trim();
    if (!question || isGenerating) return;

    setIsGenerating(true);
    setAskedTopic(question);
    setPlanOptions([]);
    setPlanError('');
    setPlanIntro('');
    setPlanSources([]);

    // One question, one answer. 「我想滑雪」 is a decision before it is a packing
    // list, so the only thing this asks for is plans — the preparation list
    // belongs to whichever plan gets chosen, and arrives with it.
    //
    // This used to call the older preparation endpoint alongside the planner.
    // Both answered the same question at their own speed, so the screen grew a
    // checklist, then shoved it down when the plans landed: two jumps for one
    // question, and a list of things to prepare for a trip nobody had decided
    // on yet.
    try {
      const result = await fetchActivityPlans({
        intent: question,
        destination: destinationCountry || destination,
        originLatitude,
        originLongitude,
        startDate: tripStartDate,
        endDate: tripEndDate,
        daysBrief: tripDaysBrief(planDays),
        budgetBrief,
      });
      setPlanOptions(result.options);
      setPlanIntro(result.intro || '');
      setPlanRequestId(result.requestId);
      setPlanSources(result.sources);
      setPlanGrounded(result.grounded);
      onPlanOptionsShown?.(result.requestId, result.options);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : '現在查不到資料，稍後再試一次。');
    } finally {
      setIsGenerating(false);
    }
  };

  const planOnly = variant === 'plan';

  return (
    <div className="space-y-3 pb-4">
      {planOnly && <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 text-xs font-black uppercase tracking-[.18em] text-violet-600">旅程準備度</div>
            {preTasks.length > 0 ? (
              <><div className="text-2xl font-black text-[#11183d]">已完成 {completed.length} 項</div><p className="mt-1 text-sm text-slate-500">還有 {pending.length} 項明確待辦需要處理</p></>
            ) : (
              <><div className="text-xl font-black text-[#11183d]">尚未建立準備待辦</div><p className="mt-1 text-sm text-slate-500">加入真正需要處理的項目，進度才會開始累積。</p></>
            )}
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><Plane size={27} /></div>
        </div>
        {preTasks.length > 0 && <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-violet-600" style={{ width: `${(completed.length / preTasks.length) * 100}%` }} /></div>}
      </section>}

      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Receipt size={18} /></span>
            <div>
              <h2 className="text-base font-black text-[#11183d]">入境規定</h2>
              <p className="mt-0.5 text-xs text-slate-500">確認並完成以下入境相關事項，確保旅程順利。</p>
              {/*
                When this was looked up, and a way to look it up again.

                Entry rules are kept once generated, and once a trip had any the
                panel showed only 收合 — so a checklist written against last
                year's K-ETA rules could not be refreshed from the screen at all.
                Nothing said how old it was either, so it read as current.
              */}
              {entryRules.length > 0 && lookedUpOn && (
                <p data-testid="entry-rules-age" className="mt-1 text-[11px] font-bold text-slate-400">
                  查詢於 {lookedUpOn}
                  <button
                    type="button"
                    disabled={researching}
                    onClick={async () => {
                      setResearching(true);
                      setResearchError('');
                      try {
                        await onResearchEntryRules();
                      } catch (error) {
                        setResearchError(error instanceof Error ? error.message : '查詢失敗，稍後再試');
                      } finally {
                        setResearching(false);
                      }
                    }}
                    className="ml-2 font-black text-violet-600 disabled:opacity-40"
                  >
                    {researching ? '查詢中…' : '重新查詢'}
                  </button>
                </p>
              )}
              {entryRules.length > 0 && researchError && (
                <p className="mt-1 text-[11px] font-bold text-rose-600">{researchError}</p>
              )}
            </div>
          </div>
          {entryRules.length > 0 && <button type="button" onClick={() => setShowAllRules(current => !current)} className="flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs font-black text-violet-600">{showAllRules ? '收合' : '查看完整規定'}<ChevronRight size={14} /></button>}
        </div>
        {entryRules.length === 0 ? (
          /* The lookup itself, here rather than behind a sheet somewhere else.
             Telling someone "fill in a destination and a passport" while the
             app knows both is a instruction where a button belongs. */
          <div className="rounded-2xl bg-slate-50 px-4 py-4">
            {/* Both fields edited in place. Sending someone to another screen
                to type one word, and to a sheet to pick from a list of one, is
                two interruptions for the two facts this card is about. */}
            <div className="grid grid-cols-2 gap-2">
              <label className="rounded-xl bg-white p-3 shadow-sm">
                <span className="block text-[10px] font-black text-slate-400">目的地</span>
                {/* One value, and it is the country: the sub-line repeating a
                    country under a city was two answers to a question with
                    one. Typing a city still resolves to its country. */}
                <input
                  value={destinationCountry || destination}
                  onChange={event => onChangeDestination(event.target.value)}
                  placeholder="例如：韓國"
                  className="mt-0.5 w-full bg-transparent text-sm font-black text-[#11183d] outline-none placeholder:font-bold placeholder:text-slate-300"
                />
                <span className="mt-0.5 block truncate text-[11px] text-slate-400">{destinationCountry ? '查詢會用這個國家' : '輸入國家或城市'}</span>
              </label>
              <label className="rounded-xl bg-white p-3 shadow-sm">
                <span className="block text-[10px] font-black text-slate-400">護照</span>
                {/* Every passport the app can look up, not only the ones already
                    saved: choosing one here is how a traveller gets their
                    first, without being sent to a sheet to create it. */}
                <select
                  value={passportCountryCode || ''}
                  onChange={event => onSelectPassportCountry(event.target.value)}
                  className="mt-0.5 w-full bg-transparent text-sm font-black text-[#11183d] outline-none"
                >
                  <option value="">選擇護照</option>
                  {PASSPORT_OPTIONS.map(option => (
                    <option key={option.countryCode} value={option.countryCode}>{option.passportLabel}</option>
                  ))}
                </select>
                <span className="mt-0.5 block truncate text-[11px] text-slate-400">{hasPassport ? '查詢會用這本' : '選一本才能查詢'}</span>
              </label>
            </div>
            {/*
              A lookup that has already run does not ask to be run again.

              A search returning no required formalities left this panel looking
              untouched — the full-width 查詢入境規定 call to action back on top
              of its own result, which sat underneath as 注意事項. Pressing it
              produced the same nothing, so the screen read as broken rather
              than as 「there is nothing you must do」.
            */}
            {alreadyLooked && (
              <p data-testid="entry-rules-empty" className="mt-3 rounded-xl bg-white px-3 py-2.5 text-xs font-bold leading-5 text-slate-600">
                這趟沒有查到必須事先辦理的手續。詳細說明在下方「注意事項」。
              </p>
            )}
            <button
              type="button"
              disabled={!destinationCountry || !hasPassport || researching}
              onClick={async () => {
                setResearching(true);
                setResearchError('');
                try {
                  await onResearchEntryRules();
                } catch (error) {
                  setResearchError(error instanceof Error ? error.message : '查詢失敗，稍後再試');
                } finally {
                  setResearching(false);
                }
              }}
              className={alreadyLooked
                ? 'mt-2 flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-500 disabled:opacity-40'
                : 'mt-3 flex min-h-11 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-black text-white disabled:opacity-40'}
            >
              {researching ? '查詢中…' : alreadyLooked ? '重新查詢' : '查詢入境規定'}
            </button>
            {researchError && <p className="mt-2 text-xs font-bold text-rose-600">{researchError}</p>}
            {!hasPassport && <p className="mt-2 text-xs text-slate-500">先在「更改」裡選擇護照，才能查這本護照的入境規定。</p>}
          </div>
        ) : (
          /* Laid out across rather than down: these are a handful of named
             formalities, and a row of tiles reads as "here is what this country
             asks of you" where a vertical checklist read as chores. Tapping one
             opens its detail underneath, so the tiles stay uniform. */
          <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
            {entryRules.map((task, index) => {
              const tone = RULE_TONES[index % RULE_TONES.length];
              const Icon = tone.icon;
              const isExpanded = expandedTaskId === task.id;
              return <button type="button" key={task.id} onClick={() => setExpandedTaskId(current => current === task.id ? null : task.id)} aria-expanded={isExpanded} className={`relative w-52 shrink-0 rounded-2xl border bg-white p-3 text-left transition ${isExpanded ? 'border-violet-300 ring-2 ring-violet-100' : 'border-slate-100'}`}>
                {/* Done is a mark added in the corner: the icon and the name say
                    which requirement this is, and both stay true afterwards. */}
                {task.isPurchased && <span aria-label="已完成" className="absolute right-2 top-2 text-sm leading-none">✅</span>}
                <div className="flex items-start gap-2.5">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.surface} ${tone.icon_color}`}><Icon size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="min-w-0 flex-1 truncate text-sm font-black text-[#11183d]">{ruleLabels.parts[index] || task.name}</span>
                      {!task.isPurchased && <ChevronRight size={14} className="shrink-0 text-slate-300" />}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-400">{task.timingText || '入境前'}</span>
                  </span>
                </div>
                <p className="mt-2.5 truncate text-[11px] leading-4 text-slate-400">{RULE_SUMMARIES[task.travelRuleActionType ?? 'other'] ?? RULE_SUMMARIES.other}</p>
              </button>;
            })}
          </div>
        )}
        {(expandedTask || showAllRules) && (
          <div className="mt-3 space-y-2">
            {/* entryRules, not every travel-rule task: 護照效期 lives in 注意事項
                and 查看完整規定 was pulling it back in, so it appeared twice on
                the same screen. */}
            {(showAllRules ? entryRules : expandedTask && entryRules.includes(expandedTask) ? [expandedTask] : []).map(ruleTask => {
              const ruleLink = officialLinkFor(ruleTask, destinationCountry || destination);
              return <div key={ruleTask.id} className="rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-xs text-slate-600">
                <div className="mb-1.5 flex items-start justify-between gap-3">
                  <p className="text-sm font-black text-[#11183d]">{ruleTask.name}</p>
                  {/* Completion lives here rather than on the tile: the tiles
                      are a statement of what the country requires, and a row of
                      checkboxes turned that back into a chore list. */}
                  <button type="button" onClick={() => onTogglePreparationItem(ruleTask.id)} className="flex shrink-0 items-center gap-1 text-[11px] font-black text-slate-500">
                    {ruleTask.isPurchased ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Circle size={16} className="text-amber-500" />}
                    {ruleTask.isPurchased ? '已完成' : '標記完成'}
                  </button>
                </div>
                {ruleTask.description && <p className="leading-5">{ruleTask.description}</p>}
                {ruleTask.description && isGuidanceOutdated(ruleTask.description, tripStartDate) && (
                  /* The text is not wrong, it is out of date — which reads the
                     same until you check the year. Say so and point at the
                     official page; claiming what the rule is now would be
                     inventing an answer nobody has checked. */
                  <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold leading-4 text-amber-700">
                    這段說明提到的期限早於你的出發日，可能已經失效。出發前請以官方網站為準。
                  </p>
                )}
                {/* The tile above already carries the timing; a boxed copy of
                    it under every card made five purple blocks that all say
                    something the reader just read. */}
                {ruleLink && <a href={ruleLink.url} target="_blank" rel="noreferrer noopener" className="mt-3 flex min-h-11 items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-black text-violet-700 ring-1 ring-violet-100"><span className="min-w-0 truncate">{ruleLink.label}</span><ExternalLink size={15} className="shrink-0" /></a>}
              </div>;
            })}
          </div>
        )}
      </section>

      {(advisoryTasks.length > 0 || (entrySummary && entryRules.length === 0)) && (
        /* Sits under the formalities it qualifies: these are the conditions and
           limits attached to them, not separate advice. */
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 font-black"><AlertTriangle size={18} className="text-amber-500" />注意事項</h2>
          <div className="space-y-2.5">
            {advisoryTasks.map(task => {
              const taskLink = officialLinkFor(task, destinationCountry || destination);
              return <div key={task.id} className="rounded-2xl bg-amber-50/70 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-black text-[#11183d]">{task.name}</p>
                  <button type="button" onClick={() => onTogglePreparationItem(task.id)} className="flex shrink-0 items-center gap-1 text-[11px] font-black text-slate-500">
                    {task.isPurchased ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Circle size={16} className="text-amber-500" />}
                    {task.isPurchased ? '已確認' : '標記確認'}
                  </button>
                </div>
                {task.description && <p className="mt-1 text-xs leading-5 text-slate-600">{task.description}</p>}
                {taskLink && <a href={taskLink.url} target="_blank" rel="noreferrer noopener" className="mt-2.5 flex min-h-11 items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-black text-violet-700 ring-1 ring-violet-100"><span className="min-w-0 truncate">{taskLink.label}</span><ExternalLink size={15} className="shrink-0" /></a>}
              </div>;
            })}
            {entrySummary && entryRules.length === 0 && (
              <p className="whitespace-pre-line rounded-2xl bg-amber-50/70 px-4 py-3 text-xs leading-5 text-slate-600">{entrySummary}</p>
            )}
          </div>
          {entrySources.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {entrySources.slice(0, 3).map(source => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer noopener" className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-black text-violet-700 ring-1 ring-violet-100">
                  <span className="min-w-0 truncate">{source.publisher || source.title}</span>
                  <ExternalLink size={15} className="shrink-0" />
                </a>
              ))}
            </div>
          )}
          {travelRules?.disclaimer && <p className="mt-3 text-[11px] leading-4 text-slate-400">{travelRules.disclaimer}</p>}
        </section>
      )}

      {ownTasks.length > 0 && (
        /* The traveller's own list, kept apart from what the country requires.
           Vertical, because this one genuinely is a list of chores. */
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          {/* Still here once the trip starts: 「查詢雪具租借」 is needed on
              the day you land, and hiding the list at departure loses the one
              thing on it that was never about departure. */}
          <h2 className="mb-3 flex items-center gap-2 font-black"><CheckCircle2 size={18} className="text-violet-600" />{planOnly ? '出發前待辦' : '待辦'}</h2>
          <div className="space-y-2">
            {ownTasks.map(task => {
              const links = todoLinksFor({
                taskName: task.name,
                destination: destinationCountry || destination,
                posts: communityPosts,
              });
              return (
              <div key={task.id} className="rounded-2xl border border-slate-100 bg-white">
                <div className="flex min-h-12 items-center gap-3 px-3 py-3">
                  <button type="button" onClick={() => onTogglePreparationItem(task.id)} aria-label={`${task.isPurchased ? '標記未完成' : '完成'}：${task.name}`} className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-violet-200">
                    {task.isPurchased ? <CheckCircle2 size={20} className="text-emerald-500" /> : <Circle size={20} className="text-amber-500" />}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-bold ${task.isPurchased ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{task.name}</span>
                    {task.description && <span className="mt-1 block text-xs leading-5 text-slate-500">{task.description}</span>}
                  </span>
                </div>
                {/* Somewhere to go from the task: the name is the answer to
                    "where", and without this the reader retypes it into a
                    search box. The map link is built from those same words, so
                    it always resolves; a post is offered only when it clearly
                    concerns the same thing. */}
                {links && (
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 px-3 py-2.5">
                    <a href={links.mapsUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-slate-50 px-2.5 text-[11px] font-black text-slate-600">
                      <MapPinned size={12} />在地圖上查看
                    </a>
                    {taskVenues[task.name]?.websiteUrl && (
                      <a href={taskVenues[task.name]!.websiteUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-emerald-50 px-2.5 text-[11px] font-black text-emerald-700">
                        <ExternalLink size={12} />官網預約
                      </a>
                    )}
                    {onPublishServiceRequest && helpEligibleIds.has(task.id) && (
                      /* Some to-dos end at a Japanese-only booking form or a
                         phone number. Selecting rather than publishing: three
                         related chores are one errand for one person, and
                         sending them separately asks three people to learn the
                         same context. */
                      <button type="button" onClick={() => toggleHelpTask(task.id)} className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-[11px] font-black ${selectedHelpTaskIds.includes(task.id) ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700'}`}>
                        <Handshake size={12} />{selectedHelpTaskIds.includes(task.id) ? '已加入協助任務' : '＋ 加入協助任務'}
                      </button>
                    )}
                    {links.relatedPost && (
                      <button type="button" onClick={() => onOpenPost(links.relatedPost!.id)} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-violet-50 px-2.5 text-[11px] font-black text-violet-700">
                        <Compass size={12} />旅人分享：{links.relatedPost.title.slice(0, 12)}
                      </button>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </section>
      )}

      {localTips.length > 0 && (
        /* Between the official checklist and the AI assistant on purpose: this
           is what other travellers tell you, which is neither a requirement nor
           a guess. */
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 font-black"><Lightbulb size={18} className="text-amber-500" />當地實用建議</h2>
          <p className="mb-3 text-xs leading-5 text-slate-500">{destinationCountry || destination} 的旅人通常會先準備這些。</p>
          {/* A table: the kind in a narrow left column, the advice on the right.
              Scanning for "what do I need an app for" should not mean reading
              every card. */}
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">
            {localTips.map(tip => (
              <div key={tip.title} className="flex gap-3 bg-white px-3 py-3">
                <div className="w-14 shrink-0 pt-0.5">
                  <span className="text-[10px] font-black text-slate-400">{TIP_LABELS[tip.kind]}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-800">{tip.title}</span>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{tip.detail}</p>
                  {tip.link && (
                    <a
                      href={tip.link.url}
                      target={tip.link.appUrl ? undefined : '_blank'}
                      rel="noreferrer noopener"
                      onClick={event => {
                        // Only intercepted when this tip names an app. The
                        // href stays the real page so a long-press, a copied
                        // link and a browser with JS off all still work.
                        if (!tip.link?.appUrl) return;
                        event.preventDefault();
                        openAppWithFallback(tip.link.appUrl, tip.link.url, browserLaunchEnvironment());
                      }}
                      className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-black text-violet-700"
                    >
                      {tip.link.label}
                      {tip.link.appUrl ? <ArrowUpRight size={14} /> : <ExternalLink size={14} />}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {highlights.length > 0 && (
        /* Counted, not generated: these are posts people actually kept
           something from, so the list can be shown before anyone asks and
           without an AI call that might be wrong about what exists. */
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 font-black"><Compass size={18} className="text-violet-600" />旅人最近推薦</h2>
          <p className="mb-3 text-xs text-slate-500">{askedTopic ? `社群裡跟「${askedTopic.slice(0, 12)}」有關的經驗。` : `去過 ${destinationCountry || destination} 的人寫下的經驗。`}</p>
          <div className="space-y-2">
            {highlights.map(({ post, savers }) => (
              <button key={post.id} type="button" onClick={() => onOpenPost(post.id)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-left">
                {post.coverImage && <img src={post.coverImage} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-[#11183d]">{post.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                    {[post.country, post.city].filter(Boolean).join('・')}
                    {savers > 0 ? `・${savers} 人收藏` : ''}
                  </span>
                </span>
                <ChevronRight size={15} className="shrink-0 text-slate-300" />
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-violet-100 bg-gradient-to-br from-white to-violet-50 p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2 font-black"><Sparkles size={18} className="text-violet-600" />AI 幫你決定要怎麼玩</div>
        <p className="mb-3 text-xs leading-5 text-slate-500">說一句你想做的事就好，會給你兩三個不同的方案。選定之後才談要準備什麼。</p>
        <form onSubmit={handleGenerate} className="space-y-2">
          <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={3} placeholder="例如：我想滑雪、想泡溫泉、想帶長輩看海.." className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
          <button type="submit" disabled={!prompt.trim() || isGenerating} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 text-sm font-black text-white shadow-lg shadow-violet-500/20 transition disabled:cursor-not-allowed disabled:opacity-50">{isGenerating ? '正在查資料、想方案…' : 'AI 幫我想方案'}<ArrowRight size={16} /></button>
        </form>
        {onRequestHumanHelp && (
          <button type="button" onClick={() => onRequestHumanHelp({ topic: prompt.trim() || '行前準備', destination: destinationCountry || destination })} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 text-sm font-black text-blue-700">
            <Handshake size={16} />需要真人協助
          </button>
        )}
        <ActivityPlanCards
          intro={planIntro}
          options={planOptions}
          grounded={planGrounded}
          sources={planSources}
          days={planDays}
          onSelect={plan => onPlanOptionSelected?.(planRequestId, plan, planOptions)}
          onDismiss={plan => {
            onPlanOptionDismissed?.(planRequestId, plan, planOptions);
            setPlanOptions(current => current.filter(option => option.id !== plan.id));
          }}
          onAddToItinerary={(plan, items) => {
            onApplyPlanOption?.(items);
            onPlanAddedToItinerary?.(planRequestId, plan, planOptions, items.map(item => item.id));
          }}
          onRequestHelp={taskName => onRequestHumanHelp?.({ topic: taskName, destination: destinationCountry || destination })}
          onAddPreparation={onAddPreparationItems}
          tripStartDate={tripStartDate}
          onRevise={handleRevisePlan}
          isRevising={isRevisingPlan}
          onRestoreOriginal={original => setPlanOptions(current => current.map(option => (
            option.id === original.id ? original : option
          )))}
        />
        {planError && <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-3 text-xs text-slate-600">{planError}</p>}
        {isGenerating && <p className="mt-3 rounded-2xl bg-white/70 px-3 py-3 text-sm text-slate-500">正在查資料並規劃方案…</p>}
      </section>

      {planOnly && <>
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-black"><Compass size={18} className="text-violet-600" />你儲存的旅遊靈感</h2>
          <button onClick={onExploreInspiration} className="text-xs font-black text-violet-600">探索靈感</button>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">尚未儲存旅遊靈感。到旅人社群探索並保存喜歡的旅程。</div>
      </section>

      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-black">快速總覽</h2>
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          {[[CalendarDays, dateRange || '未設定', '旅行日期'], [MapPinned, `${itinerary.length} 項`, '行程項目'], [Users, `${companionCount + 1} 人`, '旅行成員'], [ShoppingBag, `NT$ ${Math.round(total).toLocaleString()}`, '已記錄行前支出']].map(([Icon, value, label]) => {
            // The member count opens the list. Everything else here is a figure;
            // this one is a question — who is on this trip, and are they in.
            const opensMembers = label === '旅行成員' && Boolean(onManageMembers);
            const body = (
              <>
                <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white text-violet-600">{React.createElement(Icon as React.ElementType, { size: 17 })}</div>
                <div className="truncate text-sm font-black">{value as string}</div>
                <div className="mt-1 text-[10px] font-bold text-slate-400">{label as string}{opensMembers ? ' ›' : ''}</div>
              </>
            );
            return opensMembers ? (
              <button key={label as string} type="button" onClick={onManageMembers} aria-label="查看旅行成員" className="rounded-2xl bg-slate-50 p-3 text-center transition hover:bg-violet-50">
                {body}
              </button>
            ) : (
              <div key={label as string} className="rounded-2xl bg-slate-50 p-3">{body}</div>
            );
          })}
        </div>
      </section>

      <section className="flex items-center justify-between gap-4 rounded-3xl bg-violet-50 p-4">
        <div><div className="font-black">即將開啟你的旅程</div><div className="mt-1 text-xs text-slate-500">出發後可切換到即時旅行首頁。</div></div>
        <button onClick={onEnterTripMode} className="flex min-h-12 shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 text-sm font-black text-white shadow-lg shadow-violet-500/20">進入旅行模式<ArrowRight size={17} /></button>
      </section>
      </>}

      {onPublishServiceRequest && selectedHelpTaskIds.length > 0 && (
        /* A standing selection, not an action: the traveller keeps browsing the
           list and publishes once, when the set is right. */
        <div className="fixed bottom-24 left-1/2 z-40 w-[calc(100%-2rem)] -translate-x-1/2 md:max-w-xl">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#11183d] px-4 py-3 shadow-xl">
            <div className="min-w-0">
              <div className="text-xs font-black text-white">已選 {selectedHelpTaskIds.length} 項</div>
              <button type="button" onClick={() => setSelectedHelpTaskIds([])} className="text-[11px] font-bold text-slate-300">
                清除
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsPublishingHelp(true)}
              className="shrink-0 rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-black text-white"
            >
              整理成協助需求
            </button>
          </div>
        </div>
      )}

      {onPublishServiceRequest && isPublishingHelp && (
        <ServiceRequestSheet
          tasks={helpEligibleTasks}
          selectedTaskIds={selectedHelpTaskIds}
          onToggleTask={toggleHelpTask}
          proposal={bundleProposal}
          onAcceptProposal={proposal => setSelectedHelpTaskIds(proposal.taskIds)}
          destinationCountry={destinationCountry || destination}
          tripStartDate={tripStartDate}
          onClose={() => setIsPublishingHelp(false)}
          onPublish={draft => {
            onPublishServiceRequest(draft);
            setIsPublishingHelp(false);
            setSelectedHelpTaskIds([]);
          }}
        />
      )}
    </div>
  );
};

export default TripPlanOverview;
