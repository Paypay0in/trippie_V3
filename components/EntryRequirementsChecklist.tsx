import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Clock3 } from 'lucide-react';
import { EntryActionableItem, TravelRuleTaskState } from '../types';
import { composeTravelRuleTasks } from '../services/travelRuleTaskComposer';

interface Props {
  actionableItems?: EntryActionableItem[];
  travelRuleTaskState?: TravelRuleTaskState;
  onToggleTravelRuleTask: (taskKey: string) => void;
}

const EntryRequirementsChecklist: React.FC<Props> = ({ actionableItems, travelRuleTaskState, onToggleTravelRuleTask }) => {
  const tasks = composeTravelRuleTasks(actionableItems, travelRuleTaskState);
  const [expandedTaskKey, setExpandedTaskKey] = useState<string | null>(null);
  if (tasks.length === 0) return null;
  return <section className="rounded-3xl border border-violet-100 bg-violet-50/30 p-5 shadow-sm">
    <h2 className="mb-3 font-black text-[#11183d]">入境準備</h2>
    <div className="space-y-2">
      {tasks.map(({ action, key, completed }) => {
        const hasDetails = Boolean(action.description || action.timingText);
        const expanded = expandedTaskKey === key;
        return <div key={key} className="rounded-2xl border border-slate-100 bg-white">
          <div className="flex min-h-12 items-center gap-3 px-3 py-3">
            <button type="button" onClick={() => onToggleTravelRuleTask(key)} aria-label={`${completed ? '標記未完成' : '完成'}：${action.title}`} className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-violet-200">
              {completed ? <CheckCircle2 size={20} className="text-emerald-500" /> : <Circle size={20} className="text-amber-500" />}
            </button>
            <button type="button" disabled={!hasDetails} onClick={() => hasDetails && setExpandedTaskKey(current => current === key ? null : key)} aria-expanded={hasDetails ? expanded : undefined} className={`min-w-0 flex-1 text-left ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}>
              <span className={`block text-sm font-bold ${completed ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{action.title}</span>
              {action.timingText && <span className="mt-1 block text-xs text-violet-600">{action.timingText}</span>}
            </button>
            {hasDetails && <button type="button" aria-label={expanded ? '收合入境待辦詳情' : '查看入境待辦詳情'} aria-expanded={expanded} onClick={() => setExpandedTaskKey(current => current === key ? null : key)} className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-violet-50 hover:text-violet-600">{expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>}
          </div>
          {expanded && <div className="border-t border-violet-100 bg-violet-50/60 px-4 py-3 text-xs text-slate-600">
            {action.description && <p className="leading-5">{action.description}</p>}
            {action.timingText && <div className="mt-3 flex gap-2 rounded-xl bg-white/70 p-2.5 text-violet-700"><Clock3 size={15} className="mt-0.5 shrink-0" /><span className="font-bold">{action.timingText}</span></div>}
          </div>}
        </div>;
      })}
    </div>
  </section>;
};

export default EntryRequirementsChecklist;
