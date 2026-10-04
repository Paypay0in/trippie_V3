/**
 * One colour per area of the city, shared by every screen that shows them.
 *
 * 「行程就需要也有分顏色 讓用戶知道大行程在哪區」 — the colour only means anything
 * if 海雲台 is the same colour on the plan as it is in the collection, so the
 * palette lives in one place rather than beside each list that paints with it.
 *
 * Six is enough for a city: a trip with more areas than that is not being
 * planned a day at a time, which is what the colours are for.
 */
export const AREA_COLORS = [
  { dot: 'bg-violet-500', bar: 'bg-violet-400', soft: 'bg-violet-50 text-violet-700' },
  { dot: 'bg-sky-500', bar: 'bg-sky-400', soft: 'bg-sky-50 text-sky-700' },
  { dot: 'bg-emerald-500', bar: 'bg-emerald-400', soft: 'bg-emerald-50 text-emerald-700' },
  { dot: 'bg-amber-500', bar: 'bg-amber-400', soft: 'bg-amber-50 text-amber-700' },
  { dot: 'bg-rose-500', bar: 'bg-rose-400', soft: 'bg-rose-50 text-rose-700' },
  { dot: 'bg-teal-500', bar: 'bg-teal-400', soft: 'bg-teal-50 text-teal-700' },
];

export const areaColor = (colorIndex: number) => AREA_COLORS[colorIndex % AREA_COLORS.length];
