import React, { useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { OVERLAY } from '../constants/layers';
import {
  AssistanceNeed,
  ServiceCategory,
  ServiceRequest,
  ServiceRequestType,
  ShoppingItem,
} from '../types';
import { TaskBundleProposal } from '../services/taskBundling';
import {
  defaultAssistanceNeeds,
  defaultLanguageNeeds,
  defaultRequestTitle,
  defaultServiceCategory,
} from '../services/serviceRequestDefaults';

/**
 * Turning a handful of to-dos into one job for a person.
 *
 * Everything the trip already knows is pre-filled and everything it does not is
 * left blank — above all the date, which is the field a helper would act on.
 * The suggested bundle arrives with its tasks ticked, and every tick can be
 * removed: a recommendation that cannot be refused is just an instruction.
 */

interface Props {
  tasks: ShoppingItem[];
  selectedTaskIds: string[];
  onToggleTask: (taskId: string) => void;
  /** Grouping worked out from the tasks, or by the model when it is available. */
  proposal?: TaskBundleProposal | null;
  onAcceptProposal?: (proposal: TaskBundleProposal) => void;
  destinationCountry?: string;
  tripStartDate?: string;
  onClose: () => void;
  onPublish: (draft: Omit<ServiceRequest, 'id' | 'tripId' | 'requestedByUserId' | 'createdAt' | 'status'>) => void;
}

const TYPE_LABELS: Array<{ value: ServiceRequestType; label: string }> = [
  { value: 'task_bundle', label: '待辦協助' },
  { value: 'consultation', label: '行前諮詢' },
  { value: 'accompaniment', label: '現場陪同' },
];

const CATEGORY_LABELS: Array<{ value: ServiceCategory; label: string }> = [
  { value: 'booking', label: '預約代訂' },
  { value: 'translation', label: '翻譯陪同' },
  { value: 'consultation', label: '行程諮詢' },
  { value: 'on_site', label: '現場協助' },
  { value: 'other', label: '其他' },
];

const NEED_LABELS: Array<{ value: AssistanceNeed; label: string }> = [
  { value: 'phone_call', label: '代打電話' },
  { value: 'on_site', label: '現場陪同' },
  { value: 'translation', label: '文件翻譯' },
  { value: 'multi_contact', label: '多方聯絡' },
  { value: 'other', label: '其他' },
];

const LANGUAGE_CHOICES = ['中文', '英文', '日文', '韓文', '泰文'];

const Chip: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`min-h-9 rounded-full px-3 text-xs font-bold transition ${
      active ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-600'
    }`}
  >
    {label}
  </button>
);

const ServiceRequestSheet: React.FC<Props> = ({
  tasks,
  selectedTaskIds,
  onToggleTask,
  proposal,
  onAcceptProposal,
  destinationCountry,
  tripStartDate,
  onClose,
  onPublish,
}) => {
  const selectedTasks = useMemo(
    () => tasks.filter(task => selectedTaskIds.includes(task.id)),
    [tasks, selectedTaskIds],
  );

  const [type, setType] = useState<ServiceRequestType>(
    selectedTasks.length > 0 ? 'task_bundle' : 'consultation',
  );
  const [title, setTitle] = useState(
    proposal?.suggestedTitle || defaultRequestTitle(selectedTasks),
  );
  const [goal, setGoal] = useState('');
  const [category, setCategory] = useState<ServiceCategory>(defaultServiceCategory(selectedTasks));
  const [location, setLocation] = useState(destinationCountry || '');
  const [requestedDate, setRequestedDate] = useState('');
  const [requestedTime, setRequestedTime] = useState('');
  const [languageNeeds, setLanguageNeeds] = useState<string[]>(defaultLanguageNeeds(destinationCountry));
  const [assistanceNeeds, setAssistanceNeeds] = useState<AssistanceNeed[]>(
    defaultAssistanceNeeds(selectedTasks),
  );

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter(item => item !== value) : [...list, value];

  const canPublish = title.trim().length > 0 && (selectedTasks.length > 0 || goal.trim().length > 0);

  return (
    <div className={`fixed inset-0 ${OVERLAY} flex items-end justify-center bg-black/40`}>
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 md:max-w-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-black text-[#11183d]">發佈協助需求</h2>
            <p className="mt-0.5 text-xs text-slate-500">整理成一份需求，交給同一個人處理。</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        {proposal && onAcceptProposal && (
          /* A suggestion, arriving with its tasks already ticked and every tick
             removable. Grouping is computed from the tasks' own words, so it
             never claims a connection the checklist does not show. */
          <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <div className="flex items-center gap-2 text-xs font-black text-violet-800">
              <Sparkles size={14} />建議合併為「{proposal.suggestedTitle}」
            </div>
            {proposal.reason && <p className="mt-1 text-[11px] leading-4 text-violet-700">{proposal.reason}</p>}
            <button
              type="button"
              onClick={() => {
                onAcceptProposal(proposal);
                setTitle(proposal.suggestedTitle);
              }}
              className="mt-2 min-h-9 rounded-full bg-violet-600 px-3 text-xs font-bold text-white"
            >
              套用這個建議
            </button>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-black text-[#11183d]">需求類型</div>
            <div className="flex flex-wrap gap-2">
              {TYPE_LABELS.map(option => (
                <Chip key={option.value} active={type === option.value} label={option.label} onClick={() => setType(option.value)} />
              ))}
            </div>
          </div>

          {tasks.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-black text-[#11183d]">需要協助的項目（已選 {selectedTasks.length} 項）</div>
              <div className="space-y-1.5">
                {tasks.map(task => {
                  const checked = selectedTaskIds.includes(task.id);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onToggleTask(task.id)}
                      className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                        checked ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                          checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                        }`}
                      >
                        {checked && '✓'}
                      </span>
                      <span className="text-xs font-bold text-slate-700">{task.name}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">發佈不會把待辦標成完成，勾選仍然由你決定。</p>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-black text-[#11183d]">標題</label>
            <input
              value={title}
              onChange={event => setTitle(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-black text-[#11183d]">你想達成什麼（選填）</label>
            <textarea
              value={goal}
              onChange={event => setGoal(event.target.value)}
              rows={2}
              placeholder="例如：想在出發前把雪場和裝備都確定好"
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
            />
          </div>

          <div>
            <div className="mb-2 text-xs font-black text-[#11183d]">服務類別</div>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_LABELS.map(option => (
                <Chip key={option.value} active={category === option.value} label={option.label} onClick={() => setCategory(option.value)} />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-black text-[#11183d]">需要的協助方式</div>
            <div className="flex flex-wrap gap-2">
              {NEED_LABELS.map(option => (
                <Chip
                  key={option.value}
                  active={assistanceNeeds.includes(option.value)}
                  label={option.label}
                  onClick={() => setAssistanceNeeds(current => toggle(current, option.value))}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-black text-[#11183d]">語言需求</div>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_CHOICES.map(language => (
                <Chip
                  key={language}
                  active={languageNeeds.includes(language)}
                  label={language}
                  onClick={() => setLanguageNeeds(current => toggle(current, language))}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-black text-[#11183d]">地點</label>
            <input
              value={location}
              onChange={event => setLocation(event.target.value)}
              placeholder="國家，可再補城市或場館"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-black text-[#11183d]">希望日期（選填）</label>
              <input
                type="date"
                value={requestedDate}
                onChange={event => setRequestedDate(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
              />
              {tripStartDate && !requestedDate && (
                /* Offered, never filled in: a helper acts on this date, so it
                   has to be one the traveller actually chose. */
                <button
                  type="button"
                  onClick={() => setRequestedDate(tripStartDate)}
                  className="mt-1 text-[11px] font-bold text-blue-600"
                >
                  用出發日 {tripStartDate}
                </button>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-black text-[#11183d]">時間（選填）</label>
              <input
                type="time"
                value={requestedTime}
                onChange={event => setRequestedTime(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300"
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={!canPublish}
          onClick={() =>
            onPublish({
              type,
              title: title.trim(),
              goal: goal.trim() || undefined,
              serviceCategory: category,
              location: location.trim(),
              requestedDate: requestedDate || undefined,
              requestedTime: requestedTime || undefined,
              languageNeeds,
              assistanceNeeds,
              tasks: selectedTasks.map((task, index) => ({
                sourceTaskId: task.id,
                taskName: task.name,
                position: index,
              })),
            })
          }
          className="mt-5 flex min-h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white disabled:opacity-40"
        >
          發佈協助需求
        </button>
        <p className="mt-2 pb-2 text-center text-[11px] text-slate-400">
          目前只有你看得到這份需求，尚未開放給服務提供者。
        </p>
      </div>
    </div>
  );
};

export default ServiceRequestSheet;
