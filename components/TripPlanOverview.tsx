import React, { useState } from 'react';
import { ArrowRight, ExternalLink, Lightbulb, CalendarDays, CheckCircle2, Circle, Compass, MapPinned, Plane, Receipt, ShoppingBag, Sparkles, Users, ChevronDown, ChevronUp, Clock3 } from 'lucide-react';
import { Expense, ItineraryItem, ShoppingItem } from '../types';
import { fetchPreparationSuggestions, fetchSuggestedPlaces, PreparationSuggestionRequestError, SuggestedPlaceGroup } from '../services/preparationSuggestionService';
import { DestinationTip, getDestinationTips } from '../services/destinationTips';
import { findOfficialLink } from '../services/officialTravelLinks';

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
  onTogglePreparationItem: (id: string) => void;
  onAddPreparationItems: (items: string[]) => void;
}

const TIP_LABELS: Record<DestinationTip['kind'], string> = {
  app: 'APP',
  payment: '支付',
  transport: '交通',
  connectivity: '網路',
  custom: '當地習慣',
};

const TripPlanOverview: React.FC<Props> = ({ expenses, shoppingList, itinerary, companionCount, dateRange, onContinuePlanning, onEnterTripMode, onExploreInspiration, destination, destinationCountry, onTogglePreparationItem, onAddPreparationItems }) => {
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
  const context = destination?.trim();
  const localTips = getDestinationTips(destinationCountry || destination);
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

  return (
    <div className="space-y-3 pb-4">
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
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
      </section>

      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 font-black"><Receipt size={18} className="text-violet-600" />入境規定</h2>
        {preTasks.length === 0 ? <p className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">目前沒有明確待辦。這裡不會把沒有紀錄的項目假設為未完成。</p> : (
          /* Laid out across rather than down: these are a handful of named
             formalities, and a row of tiles reads as "here is what this country
             asks of you" where a vertical checklist read as chores. Tapping one
             opens its detail underneath, so the tiles stay uniform. */
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {shoppingPreTasks.map(item => {
              const task = item;
              const taskId = item.id;
              const completedState = item.isPurchased;
              const officialLink = findOfficialLink(destinationCountry || destination, task.name);
              const hasDetails = Boolean(task.description || task.timingText || officialLink);
              const isExpanded = expandedTaskId === taskId;
              return <button type="button" key={taskId} onClick={() => setExpandedTaskId(current => current === taskId ? null : taskId)} aria-expanded={isExpanded} className={`min-h-24 w-32 shrink-0 rounded-2xl border px-3 py-3 text-left transition ${isExpanded ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white'}`}>
                <span className="flex items-start justify-between gap-1">
                  <span className={`block text-xs font-black leading-4 ${completedState ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.name}</span>
                  <span role="button" tabIndex={0} aria-label={`${completedState ? '標記未完成' : '完成'}：${task.name}`} onClick={event => { event.stopPropagation(); onTogglePreparationItem(item.id); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onTogglePreparationItem(item.id); } }} className="shrink-0">
                    {completedState ? <CheckCircle2 size={17} className="text-emerald-500" /> : <Circle size={17} className="text-amber-500" />}
                  </span>
                </span>
                {task.timingText && <span className="mt-1.5 block text-[11px] leading-4 text-violet-600">{task.timingText}</span>}
                {hasDetails && <span className="mt-1.5 block text-[10px] font-bold text-slate-400">{isExpanded ? '收合' : '查看'}</span>}
              </button>;
            })}
          </div>
        )}
        {expandedTask && (
          <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-xs text-slate-600">
            <p className="mb-1.5 text-sm font-black text-[#11183d]">{expandedTask.name}</p>
            {expandedTask.description && <p className="leading-5">{expandedTask.description}</p>}
            {expandedTask.timingText && <div className="mt-3 flex gap-2 rounded-xl bg-white/70 p-2.5 text-violet-700"><Clock3 size={15} className="mt-0.5 shrink-0" /><span><strong className="font-bold">{expandedTask.timingText}</strong><span className="mt-0.5 block text-[11px] text-slate-500">若官方有明確申請期限，以官方規定為準。</span></span></div>}
            {expandedLink && <a href={expandedLink.url} target="_blank" rel="noreferrer noopener" className="mt-3 flex min-h-11 items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-black text-violet-700 ring-1 ring-violet-100"><span className="min-w-0 truncate">{expandedLink.label}</span><ExternalLink size={15} className="shrink-0" /></a>}
          </div>
        )}
      </section>

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
    </div>
  );
};

export default TripPlanOverview;
