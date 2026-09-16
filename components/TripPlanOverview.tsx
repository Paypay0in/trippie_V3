import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, BadgeCheck, ChevronRight, ExternalLink, FileText, Lightbulb, Luggage, CalendarDays, CheckCircle2, Circle, Compass, MapPinned, Plane, Receipt, ShoppingBag, Sparkles, Users, ChevronDown, ChevronUp, Clock3 } from 'lucide-react';
import { Expense, ItineraryItem, ShoppingItem, TravelRules } from '../types';
import { fetchPreparationSuggestions, fetchSuggestedPlaces, PreparationSuggestionRequestError, SuggestedPlaceGroup } from '../services/preparationSuggestionService';
import { DestinationTip, getDestinationTips } from '../services/destinationTips';
import { findOfficialLink } from '../services/officialTravelLinks';
import { splitSharedPrefix } from '../services/sharedLabelPrefix';

interface Props {
  expenses: Expense[];
  shoppingList: ShoppingItem[];
  itinerary: ItineraryItem[];
  companionCount: number;
  dateRange: string;
  onContinuePlanning: () => void;
  onEnterTripMode: () => void;
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
  /** Whether a passport with a country code is on file, so the lookup can run. */
  hasPassport: boolean;
  /** Runs the entry-rules lookup with the default passport. */
  onResearchEntryRules: () => Promise<void> | void;
  /** Opens the full identity sheet, for choosing a different passport. */
  onOpenIdentity: () => void;
  onTogglePreparationItem: (id: string) => void;
  onAddPreparationItems: (items: string[]) => void;
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

const TripPlanOverview: React.FC<Props> = ({ expenses, shoppingList, itinerary, companionCount, dateRange, onContinuePlanning, onEnterTripMode, onExploreInspiration, destination, destinationCountry, travelRules, variant = 'plan', hasPassport, onResearchEntryRules, onOpenIdentity, onTogglePreparationItem, onAddPreparationItems }) => {
  const shoppingPreTasks = shoppingList.filter(item => item.phase === 'pre');
  const preTasks = shoppingPreTasks;
  const completed = preTasks.filter(item => 'completed' in item ? item.completed : item.isPurchased);
  const pending = preTasks.filter(item => !('completed' in item ? item.completed : item.isPurchased));
  const preExpenses = expenses.filter(expense => expense.phase === 'pre');
  const total = preExpenses.reduce((sum, expense) => sum + expense.twdAmount, 0);
  const [suggestions, setSuggestions] = useState<Array<{ item: string; reason: string }>>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([]);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [placeGroups, setPlaceGroups] = useState<SuggestedPlaceGroup[]>([]);
  const [showAllRules, setShowAllRules] = useState(false);
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState('');
  const context = destination?.trim();
  const localTips = getDestinationTips(destinationCountry || destination);
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
  const entrySources = travelRules?.entry?.sources ?? [];
  const expandedTask = shoppingPreTasks.find(task => task.id === expandedTaskId);
  const expandedLink = expandedTask ? findOfficialLink(destinationCountry || destination, expandedTask.name) : null;

  const handleGenerate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = prompt.trim();
    if (!question || isGenerating) return;

    setIsGenerating(true);
    setGenerationError(null);
    setSuggestions([]);
    const requestContext = [
      context ? `旅程目的地：${context}` : '',
      dateRange ? `旅行日期：${dateRange}` : '',
      itinerary.length > 0 ? `已有行程：${itinerary.map(item => `${item.date || ''} ${item.time} ${item.title}`).join('、')}` : '',
      `使用者問題：${question}`,
    ].filter(Boolean).join('\n');

    try {
      const { suggestions: items, placeQueries } = await fetchPreparationSuggestions(requestContext);
      setSuggestions(items.filter(item => typeof item?.item === 'string' && item.item.trim()).map(({ item, reason }) => ({ item: item.trim(), reason: typeof reason === 'string' ? reason : '' })));
      setSelectedSuggestions([]);
      // Shops load after the advice and never block it: the advice stands on
      // its own, and a slow or empty map lookup should not hold it back.
      setPlaceGroups([]);
      if (placeQueries.length) fetchSuggestedPlaces(placeQueries).then(setPlaceGroups);
    } catch (error) {
      setGenerationError(error instanceof PreparationSuggestionRequestError && error.status === 400
        ? '提供的旅行資訊太多，請縮短問題後再試一次。'
        : 'AI 旅程準備目前暫時無法使用，你仍可以手動建立待辦。');
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
            </div>
          </div>
          {entryRules.length > 0 && <button type="button" onClick={() => setShowAllRules(current => !current)} className="flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs font-black text-violet-600">{showAllRules ? '收合' : '查看完整規定'}<ChevronRight size={14} /></button>}
        </div>
        {entryRules.length === 0 ? (
          /* The lookup itself, here rather than behind a sheet somewhere else.
             Telling someone "fill in a destination and a passport" while the
             app knows both is a instruction where a button belongs. */
          <div className="rounded-2xl bg-slate-50 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#11183d]">{destination || '尚未設定目的地'}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{destinationCountry || '請先設定目的地'}{hasPassport ? '・台灣護照' : '・尚未選擇護照'}</p>
              </div>
              <button type="button" onClick={onOpenIdentity} className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-bold text-violet-700 shadow-sm">更改</button>
            </div>
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
              className="mt-3 flex min-h-11 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 text-sm font-black text-white disabled:opacity-40"
            >
              {researching ? '查詢中…' : '查詢入境規定'}
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
            {(showAllRules ? travelRuleTasks : expandedTask && entryRules.includes(expandedTask) ? [expandedTask] : []).map(ruleTask => {
              const ruleLink = findOfficialLink(destinationCountry || destination, ruleTask.name);
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
                {ruleTask.timingText && <div className="mt-3 flex gap-2 rounded-xl bg-white/70 p-2.5 text-violet-700"><Clock3 size={15} className="mt-0.5 shrink-0" /><span><strong className="font-bold">{ruleTask.timingText}</strong><span className="mt-0.5 block text-[11px] text-slate-500">若官方有明確申請期限，以官方規定為準。</span></span></div>}
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
              const taskLink = findOfficialLink(destinationCountry || destination, task.name);
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

      {planOnly && ownTasks.length > 0 && (
        /* The traveller's own list, kept apart from what the country requires.
           Vertical, because this one genuinely is a list of chores. */
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 font-black"><CheckCircle2 size={18} className="text-violet-600" />出發前待辦</h2>
          <div className="space-y-2">
            {ownTasks.map(task => (
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
              </div>
            ))}
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
                  {tip.link && <a href={tip.link.url} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-black text-violet-700">{tip.link.label}<ExternalLink size={14} /></a>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-violet-100 bg-gradient-to-br from-white to-violet-50 p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2 font-black"><Sparkles size={18} className="text-violet-600" />AI 幫助你做行前規劃</div>
        <p className="mb-3 text-xs leading-5 text-slate-500">說一句你在意的事就好。想滑雪，會幫你找雪具店；怕冷，會告訴你該帶什麼。</p>
        <form onSubmit={handleGenerate} className="space-y-2">
          <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={3} placeholder="例如：想滑雪、很怕冷、帶長輩同行、想找藥妝店.." className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
          <button type="submit" disabled={!prompt.trim() || isGenerating} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 text-sm font-black text-white shadow-lg shadow-violet-500/20 transition disabled:cursor-not-allowed disabled:opacity-50">{isGenerating ? '正在整理準備建議…' : 'AI 幫我整理'}<ArrowRight size={16} /></button>
        </form>
        {isGenerating && <p className="mt-3 rounded-2xl bg-white/70 px-3 py-3 text-sm text-slate-500">正在整理準備建議…</p>}
        {!isGenerating && generationError && <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-3 text-sm text-slate-600">{generationError}</p>}
        {!isGenerating && !generationError && suggestions.length > 0 && <div className="mt-3 space-y-2"><div className="text-xs font-black text-[#11183d]">AI 建議</div>{suggestions.map((suggestion, index) => { const alreadyAdded = shoppingPreTasks.some(task => task.name.trim().toLowerCase() === suggestion.item.trim().toLowerCase()); const selected = selectedSuggestions.includes(suggestion.item); return <button type="button" key={`${suggestion.item}-${index}`} disabled={alreadyAdded} onClick={() => setSelectedSuggestions(current => selected ? current.filter(item => item !== suggestion.item) : [...current, suggestion.item])} className={`w-full rounded-xl border px-3 py-3 text-left transition ${alreadyAdded ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-60' : selected ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white hover:border-violet-200'}`}><div className="flex items-start gap-3"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${alreadyAdded || selected ? 'border-violet-500 bg-violet-600 text-white' : 'border-slate-300 bg-white'}`}>{(alreadyAdded || selected) && '✓'}</span><span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-700">{suggestion.item}</span><span className="mt-1 block text-[11px] text-slate-400">{suggestion.reason}</span></span>{alreadyAdded && <span className="shrink-0 text-[10px] font-black text-slate-400">已加入</span>}</div></button>; })}<button type="button" disabled={selectedSuggestions.length === 0} onClick={() => { onAddPreparationItems(selectedSuggestions); setSelectedSuggestions([]); }} className="mt-2 flex min-h-11 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 text-sm font-black text-white shadow-lg shadow-violet-500/20 transition disabled:cursor-not-allowed disabled:opacity-40">加入待辦清單（{selectedSuggestions.length}）</button></div>}
        {placeGroups.length > 0 && <div className="mt-4 space-y-3">
          {/* Real shops, from the map service. The model only chose what to
              search for: asked for shop names it invents plausible ones, and a
              traveller who walks to an address that was never there has been
              failed worse than by no recommendation at all. */}
          <div className="text-xs font-black text-[#11183d]">當地店家</div>
          {placeGroups.map(group => <div key={group.query} className="space-y-2">
            <div className="text-[11px] font-bold text-slate-400">{group.query}</div>
            {group.places.map(place => <a key={place.mapsUrl} href={place.mapsUrl} target="_blank" rel="noreferrer noopener" className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
              <MapPinned size={16} className="mt-0.5 shrink-0 text-violet-600" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-slate-700">{place.name}{typeof place.rating === 'number' && <span className="ml-1.5 text-[11px] font-black text-amber-500">{place.rating.toFixed(1)}</span>}</span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-400">{place.address}</span>
              </span>
              <ExternalLink size={14} className="mt-0.5 shrink-0 text-slate-400" />
            </a>)}
          </div>)}
          <p className="text-[11px] leading-4 text-slate-400">店家資料來自 Google 地圖，營業時間與庫存請以店家公告為準。</p>
        </div>}
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
          {[[CalendarDays, dateRange || '未設定', '旅行日期'], [MapPinned, `${itinerary.length} 項`, '行程項目'], [Users, `${companionCount + 1} 人`, '旅行成員'], [ShoppingBag, `NT$ ${Math.round(total).toLocaleString()}`, '已記錄行前支出']].map(([Icon, value, label]) => <div key={label as string} className="rounded-2xl bg-slate-50 p-3"><div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white text-violet-600">{React.createElement(Icon as React.ElementType, { size: 17 })}</div><div className="truncate text-sm font-black">{value as string}</div><div className="mt-1 text-[10px] font-bold text-slate-400">{label as string}</div></div>)}
        </div>
      </section>

      <section className="flex items-center justify-between gap-4 rounded-3xl bg-violet-50 p-4">
        <div><div className="font-black">即將開啟你的旅程</div><div className="mt-1 text-xs text-slate-500">出發後可切換到即時旅行首頁。</div></div>
        <button onClick={onEnterTripMode} className="flex min-h-12 shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 text-sm font-black text-white shadow-lg shadow-violet-500/20">進入旅行模式<ArrowRight size={17} /></button>
      </section>
      </>}
    </div>
  );
};

export default TripPlanOverview;
