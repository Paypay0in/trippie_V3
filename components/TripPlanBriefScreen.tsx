import React, { useState } from 'react';
import { TripInspirationProposal } from '../services/itineraryPlanningService';
import {
  BedDouble, CalendarDays, Clock, ListOrdered, MapPin, Pencil, Plane, Sparkles, Users, Wand2, X,
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
import { briefFromSentence, parseSentence, unreadFields } from '../services/briefFromSentence';

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
  /**
   * Plans the trip the brief describes, without creating anything.
   *
   * 「P0 — AI 生成沒有產生日程」 and 「P1 — 生成直接建立並保存旅程」 are the same
   * gap seen twice: the button said 「生成」, created an empty trip, and saved
   * it. Planning and creating are now two steps with the traveller in between.
   */
  onPreview: (brief: TripPlanBrief) => Promise<TripInspirationProposal>;
  /** Creates the trip and writes the plan the traveller just accepted. */
  onGenerate: (brief: TripPlanBrief, proposal: TripInspirationProposal) => void;
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
  initialDestination, onClose, onPreview, onGenerate, onUploadBookings,
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
  /** The plan on screen, before any of it exists. See the preview below. */
  const [proposal, setProposal] = useState<TripInspirationProposal | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState('');

  const set = <K extends keyof TripPlanBrief>(key: K, value: TripPlanBrief[K]) =>
    setBrief(current => ({ ...current, [key]: value }));

  const toggleTransport = (mode: BriefTransport) =>
    setBrief(current => ({
      ...current,
      transport: current.transport.includes(mode)
        ? current.transport.filter(other => other !== mode)
        : [...current.transport, mode],
    }));

  const [sentence, setSentence] = useState('');
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState('');
  const [readBack, setReadBack] = useState<string[]>([]);
  const [stillAsking, setStillAsking] = useState<string[]>([]);

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

        {/*
          One sentence, for people who already know what they want.

          Above the form rather than instead of it. The parse fills the fields
          and shows what it read; the form is where that gets corrected, and a
          parse nobody can see is a parse nobody can disagree with.
        */}
        <section className="mt-4 rounded-3xl border border-violet-100 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-1.5 text-support font-black text-ink">
            <Wand2 size={16} className="text-violet-600" />一句話說完也可以
          </h2>
          <textarea
            value={sentence}
            data-testid="brief-sentence"
            aria-label="一句話描述你的旅行"
            onChange={event => setSentence(event.target.value.slice(0, 600))}
            rows={3}
            placeholder="例如：11 月去東京五天，兩個人，喜歡美術館、咖啡廳和購物，不想太趕。住宿在新宿，想去 teamLab。"
            className="mt-2.5 w-full resize-none rounded-field border border-hairline bg-[#fafafd] p-3 text-field leading-6 text-ink outline-none placeholder:text-slate-300 focus:border-violet-400"
          />
          <button
            type="button"
            data-testid="brief-read-sentence"
            disabled={!sentence.trim() || reading}
            onClick={() => {
              setReading(true);
              setReadError('');
              parseSentence(sentence.trim())
                .then(parse => {
                  const { brief: filled, read } = briefFromSentence(parse, brief);
                  setBrief(filled);
                  setReadBack(read);
                  setStillAsking(unreadFields(parse));
                })
                /* The server's own words: it names the way out — the form. */
                .catch((error: unknown) => setReadError(
                  error instanceof Error && error.message.trim()
                    ? error.message
                    : '這句話現在讀不出來，直接填下面的表單也可以。',
                ))
                .finally(() => setReading(false));
            }}
            className="mt-2.5 flex h-11 w-full items-center justify-center gap-1.5 rounded-control bg-violet-50 text-support font-black text-violet-700 disabled:bg-slate-50 disabled:text-slate-300"
          >
            <Wand2 size={15} />{reading ? '讀這句話…' : '幫我填好下面'}
          </button>

          {readError && (
            <p data-testid="brief-read-error" className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
              {readError}
            </p>
          )}

          {readBack.length > 0 && (
            <div data-testid="brief-read-back" className="mt-3 flex flex-wrap gap-1.5">
              {readBack.map(item => (
                <span key={item} className="rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-700">
                  {item}
                </span>
              ))}
            </div>
          )}

          {/*
            What the sentence never said. The fields below are filled from
            defaults, and a default that arrived without being mentioned looks
            exactly like an answer.
          */}
          {stillAsking.length > 0 && (
            <p data-testid="brief-still-asking" className="mt-2 text-[11px] leading-5 text-slate-400">
              這句話沒提到{stillAsking.join('、')}，下面是預設值，改一下。
            </p>
          )}
        </section>

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
          hint="若還沒訂可以先跳過，這一頁照樣排得出行程。但旅程建立後的「AI 調整行程」會需要它們——知道幾點落地才知道第一天剩多少時間，知道住哪裡才排得出同一區的動線。"
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
          disabled={!ready || planning}
          onClick={() => {
            setPlanning(true);
            setPlanError('');
            onPreview(brief)
              .then(result => setProposal(result))
              /*
                The server's own words, when it has any.

                This threw them away and said 「AI 行程規劃現在無法使用」 to
                everything — including a 400 that was saying, precisely,
                「請先選擇要排進行程的收藏靈感。」. One generic sentence over a
                specific answer cost a whole day of the planner looking dead
                rather than looking fussy, and nobody could tell which.
              */
              .catch((error: unknown) => setPlanError(
                error instanceof Error && error.message.trim()
                  ? `${error.message} 你的旅程沒有被建立。`
                  : 'AI 行程規劃現在無法使用，你的旅程沒有被建立。稍後再試一次。',
              ))
              .finally(() => setPlanning(false));
          }}
          className="mt-3 flex h-[var(--cta-h)] w-full items-center justify-center gap-2 rounded-control bg-violet-600 text-action font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          <Sparkles size={17} />{planning ? 'AI 正在排行程…' : '生成我的專屬行程 →'}
        </button>

        {planError && (
          <p data-testid="brief-error" className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
            {planError}
          </p>
        )}

        {/*
          The plan, before the trip exists.

          「生成直接建立並保存旅程」 — somebody filling this form is asking to see
          what the AI would do, and was given a saved trip whether they liked
          the answer or not. Nothing is written until 「建立這趟旅程」.
        */}
        {proposal && (
          <div data-testid="brief-preview" className="mt-3 rounded-2xl border border-[#e8e7f4] bg-white p-3">
            <h3 className="text-sm font-black text-[#11183d]">
              AI 排了 {proposal.days.reduce((total, day) => total + day.items.length, 0)} 個行程，共 {proposal.days.length} 天
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-400">看過再決定要不要建立。取消的話什麼都不會留下。</p>

            <ul className="mt-2 space-y-2">
              {proposal.days.map(day => (
                <li key={day.date}>
                  <p className="text-[11px] font-black text-[#5b3df5]">{day.date.slice(5).replace('-', '/')}</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {day.items.map(item => (
                      <li key={item.id} className="rounded-lg bg-[#faf9ff] px-2 py-1 text-xs leading-5 text-[#11183d]">
                        <span className="font-mono text-[10px] text-slate-400">{item.suggestedStartTime || '—'}</span>
                        {' '}{item.placeName}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            {proposal.warnings.length > 0 && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
                {proposal.warnings.join('；')}
              </p>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                data-testid="brief-accept"
                onClick={() => onGenerate(brief, proposal)}
                className="min-h-11 flex-1 rounded-control bg-violet-600 text-sm font-black text-white"
              >
                建立這趟旅程
              </button>
              <button
                type="button"
                onClick={() => setProposal(null)}
                className="min-h-11 rounded-control border border-slate-200 px-4 text-sm font-bold text-slate-500"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TripPlanBriefScreen;
