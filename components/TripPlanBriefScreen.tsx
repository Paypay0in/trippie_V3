import React, { useState } from 'react';
import {
  BedDouble, CalendarDays, Clock, ListOrdered, MapPin, Pencil, Plane, Sparkles, Users, X,
} from 'lucide-react';
import { OVERLAY } from '../constants/layers';
import {
  BriefTransport,
  DEFAULT_BRIEF,
  PACE_LABEL,
  TRANSPORT_LABEL,
  TravelPace,
  TripPlanBrief,
  briefDayCount,
  briefIsReady,
  briefProblems,
} from '../services/tripPlanBrief';

/**
 * 告訴我你的旅行計畫 — the questionnaire behind 「AI 幫我排行程」.
 *
 * The planner that exists works from places already saved to a trip; its
 * button counts them and is disabled at zero. This is the other end of the
 * journey: no trip, no collection, somebody who has decided to go and nothing
 * else.
 *
 * Every field here used to be a sentence somebody had to remember to write
 * into one paragraph — 「每天 11 點後出門，有租車，不要排太滿」 — and then hope
 * the model read all three. Asked as fields they arrive whole. 補充描述 keeps
 * the paragraph, for what is genuinely prose.
 *
 * Deliberately not here: 匯入旅程資料 stays its own tile. 「不用合併」. The
 * upload below shares those parsers and nothing else.
 */

interface Props {
  /** Prefilled when the traveller already named a destination elsewhere. */
  initialDestination?: string;
  onClose: () => void;
  onGenerate: (brief: TripPlanBrief) => void;
  /** Opens the flight/stay reader, which fills the dates and destination. */
  onUploadBookings?: () => void;
}

const Section: React.FC<{
  icon: React.ReactNode; title: string; hint?: string; optional?: boolean;
  children: React.ReactNode;
}> = ({ icon, title, hint, optional, children }) => (
  <section className="mt-3 rounded-card border border-hairline bg-white p-3.5">
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-field font-bold text-ink">
          {title}
          {optional && <span className="ml-1.5 text-meta font-semibold text-ink-soft">（選填）</span>}
        </p>
        {hint && <p className="mt-0.5 text-meta text-ink-soft">{hint}</p>}
        <div className="mt-2.5">{children}</div>
      </div>
    </div>
  </section>
);

const TripPlanBriefScreen: React.FC<Props> = ({
  initialDestination, onClose, onGenerate, onUploadBookings,
}) => {
  const [brief, setBrief] = useState<TripPlanBrief>({
    ...DEFAULT_BRIEF,
    destination: initialDestination || '',
  });
  /*
    「尚未確定日期，我只知道大約天數」 lives in the form, not on the trip. Ticking
    it clears the dates rather than hiding them, so what is sent is what is on
    screen — a hidden date that still travels is the kind of thing nobody
    finds until the day tabs are wrong.
  */
  const [datesUnknown, setDatesUnknown] = useState(false);

  const set = <K extends keyof TripPlanBrief>(key: K, value: TripPlanBrief[K]) =>
    setBrief(current => ({ ...current, [key]: value }));

  const toggleTransport = (mode: BriefTransport) =>
    setBrief(current => ({
      ...current,
      transport: current.transport.includes(mode)
        ? current.transport.filter(other => other !== mode)
        : [...current.transport, mode],
    }));

  const days = briefDayCount(brief);
  const problems = briefProblems(brief);
  const ready = briefIsReady(brief);

  return (
    <div className={`fixed inset-0 overflow-y-auto bg-[#f3f2fb] ${OVERLAY.sheet}`}>
      <div
        data-safe-top
        style={{ ['--safe-top-base' as string]: '1rem' }}
        className="mx-auto w-full max-w-md px-[var(--screen-pad)] pb-[calc(env(safe-area-inset-bottom)+6.5rem)]"
      >
        <div className="flex items-start justify-between gap-3 pt-1">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-support font-black text-violet-600">
              <Sparkles size={15} />AI 幫我排行程
            </p>
            <h1 className="mt-1 text-hero font-black tracking-tight text-ink">
              告訴我你的旅行計畫
            </h1>
            <p className="mt-1 text-support leading-6 text-ink-soft">
              輸入幾個簡單的資訊，<br />我會為你生成專屬行程 ✨
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-400"
          >
            <X size={19} />
          </button>
        </div>

        <Section icon={<Users size={16} />} title="幾人旅行？" hint="包含你自己">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              aria-label="減少人數"
              data-testid="brief-travellers-minus"
              onClick={() => set('travellers', Math.max(1, brief.travellers - 1))}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-lg font-black text-ink"
            >
              −
            </button>
            <span data-testid="brief-travellers" className="min-w-8 text-center text-section font-black text-ink">
              {brief.travellers}
            </span>
            <button
              type="button"
              aria-label="增加人數"
              data-testid="brief-travellers-plus"
              onClick={() => set('travellers', Math.min(20, brief.travellers + 1))}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-lg font-black text-ink"
            >
              ＋
            </button>
          </div>
        </Section>

        <Section icon={<MapPin size={16} />} title="要去哪裡？" hint="可搜尋國家、城市或多個地點">
          <input
            value={brief.destination}
            data-testid="brief-destination"
            aria-label="要去哪裡"
            onChange={event => set('destination', event.target.value)}
            placeholder="例如：日本 東京、韓國 釜山"
            className="h-[var(--control-h)] w-full rounded-field border border-hairline bg-[#fafafd] px-3.5 text-field font-medium text-ink outline-none placeholder:text-slate-300 focus:border-violet-400"
          />
        </Section>

        <Section icon={<CalendarDays size={16} />} title="幾天的行程？">
          {datesUnknown ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={60}
                data-testid="brief-approx-days"
                aria-label="大約幾天"
                value={brief.approximateDays ?? ''}
                onChange={event => set('approximateDays', Number(event.target.value) || undefined)}
                className="h-[var(--control-h)] w-24 rounded-field border border-hairline bg-[#fafafd] px-3 text-field font-bold text-ink outline-none focus:border-violet-400"
              />
              <span className="text-field font-bold text-ink">天</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                data-testid="brief-start"
                aria-label="出發日期"
                value={brief.startDate || ''}
                onChange={event => set('startDate', event.target.value || undefined)}
                className="h-[var(--control-h)] min-w-0 flex-1 rounded-field border border-hairline bg-[#fafafd] px-2.5 text-support font-bold text-ink outline-none focus:border-violet-400"
              />
              <span className="shrink-0 text-ink-soft">～</span>
              <input
                type="date"
                data-testid="brief-end"
                aria-label="回程日期"
                value={brief.endDate || ''}
                min={brief.startDate || undefined}
                onChange={event => set('endDate', event.target.value || undefined)}
                className="h-[var(--control-h)] min-w-0 flex-1 rounded-field border border-hairline bg-[#fafafd] px-2.5 text-support font-bold text-ink outline-none focus:border-violet-400"
              />
              {days !== null && (
                <span data-testid="brief-days" className="shrink-0 text-field font-black text-ink">
                  {days} 天
                </span>
              )}
            </div>
          )}

          <label className="mt-2.5 flex items-center gap-2 text-support font-medium text-ink-soft">
            <input
              type="checkbox"
              data-testid="brief-dates-unknown"
              checked={datesUnknown}
              onChange={event => {
                const unknown = event.target.checked;
                setDatesUnknown(unknown);
                // Cleared, not hidden: a date that still travels while the
                // screen says it is unknown is found when the day tabs are
                // already wrong.
                setBrief(current => unknown
                  ? { ...current, startDate: undefined, endDate: undefined }
                  : { ...current, approximateDays: undefined });
              }}
              className="h-4 w-4 accent-violet-600"
            />
            尚未確定日期，我只知道大約天數
          </label>
        </Section>

        <Section
          icon={<Plane size={16} />}
          title="機票與住宿資訊"
          optional
          hint="上傳機票與住宿可以讓行程更精準，若還沒訂可以先跳過"
        >
          <div className="flex gap-2.5">
            <button
              type="button"
              data-testid="brief-upload"
              onClick={onUploadBookings}
              disabled={!onUploadBookings}
              className="flex min-h-[4.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-card border border-dashed border-violet-200 bg-violet-50/40 px-2 text-violet-700 disabled:opacity-40"
            >
              <Plane size={17} />
              <span className="text-support font-bold">上傳機票 / 航班資訊</span>
              <span className="text-meta text-ink-soft">可上傳截圖或訂位信</span>
            </button>
            <button
              type="button"
              data-testid="brief-upload-stay"
              onClick={onUploadBookings}
              disabled={!onUploadBookings}
              className="flex min-h-[4.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-card border border-dashed border-violet-200 bg-violet-50/40 px-2 text-violet-700 disabled:opacity-40"
            >
              <BedDouble size={17} />
              <span className="text-support font-bold">上傳住宿資訊</span>
              <span className="text-meta text-ink-soft">可上傳訂房確認信</span>
            </button>
          </div>
        </Section>

        <Section icon={<MapPin size={16} />} title="主要交通工具（可複選）" hint="告訴我你會使用哪些交通方式">
          <div className="flex gap-2">
            {(['walk', 'drive', 'transit'] as BriefTransport[]).map(mode => {
              const on = brief.transport.includes(mode);
              return (
                <button
                  key={mode}
                  type="button"
                  data-testid={`brief-transport-${mode}`}
                  aria-pressed={on}
                  onClick={() => toggleTransport(mode)}
                  className={`min-h-11 flex-1 rounded-field border text-support font-bold ${
                    on
                      ? 'border-violet-300 bg-violet-50 text-violet-700'
                      : 'border-hairline bg-white text-ink-soft'
                  }`}
                >
                  {TRANSPORT_LABEL[mode]}{on ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
        </Section>

        <Section icon={<Clock size={16} />} title="每天幾點開始安排行程？" hint="選擇你平均希望每天開始玩耍的時間">
          <input
            type="time"
            data-testid="brief-start-time"
            aria-label="每天幾點開始"
            value={brief.dayStartTime}
            onChange={event => set('dayStartTime', event.target.value || '09:00')}
            className="h-[var(--control-h)] w-full rounded-field border border-hairline bg-[#fafafd] px-3.5 text-field font-bold text-ink outline-none focus:border-violet-400"
          />
        </Section>

        <Section icon={<ListOrdered size={16} />} title="一天大約安排幾個行程？" hint="根據你的旅行節奏調整行程安排">
          <div className="flex gap-2">
            {([2, 3, 4] as TravelPace[]).map(pace => (
              <button
                key={pace}
                type="button"
                data-testid={`brief-pace-${pace}`}
                aria-pressed={brief.pace === pace}
                onClick={() => set('pace', pace)}
                className={`min-h-[3.25rem] flex-1 rounded-field border px-1 ${
                  brief.pace === pace
                    ? 'border-violet-300 bg-violet-50'
                    : 'border-hairline bg-white'
                }`}
              >
                <span className={`block text-support font-black ${brief.pace === pace ? 'text-violet-700' : 'text-ink'}`}>
                  {PACE_LABEL[pace].title}
                </span>
                <span className="block text-meta text-ink-soft">{PACE_LABEL[pace].hint}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section icon={<Pencil size={16} />} title="補充描述" optional hint="可以描述想做什麼事，AI 會幫你提案">
          <textarea
            rows={3}
            maxLength={500}
            data-testid="brief-notes"
            aria-label="補充描述"
            value={brief.notes || ''}
            onChange={event => set('notes', event.target.value)}
            placeholder="例如：想去咖啡廳、逛當地市集、拍照景點、美食、自然景觀、特別體驗…"
            className="w-full resize-none rounded-field border border-hairline bg-[#fafafd] px-3.5 py-2.5 text-support leading-6 text-ink outline-none placeholder:text-slate-300 focus:border-violet-400"
          />
          <p className="mt-1 text-right text-meta text-ink-soft">{(brief.notes || '').length}/500</p>
        </Section>

        {/*
          What is missing, named. A disabled button with no reason beside it is
          a dead end the traveller has to solve by guessing which field.
        */}
        {problems.length > 0 && (
          <p data-testid="brief-problems" className="mt-3 rounded-card bg-amber-50 px-3 py-2 text-support font-medium text-amber-800">
            {problems.join('・')}
          </p>
        )}

        <button
          type="button"
          data-testid="brief-generate"
          disabled={!ready}
          onClick={() => onGenerate(brief)}
          className="mt-3 flex h-[var(--cta-h)] w-full items-center justify-center gap-2 rounded-control bg-violet-600 text-action font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          <Sparkles size={17} />生成我的專屬行程 →
        </button>
      </div>
    </div>
  );
};

export default TripPlanBriefScreen;
