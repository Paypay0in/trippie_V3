import { StaySpan } from './stayIntake';

/**
 * Where the day starts from.
 *
 * 「每天第一個行程要記得由旅館到第一個行程的交通要顯示在行程表」.
 *
 * The timeline drew a journey between every pair of stops and nothing before
 * the first one, so the one leg a traveller actually plans their morning around
 * — get out of the hotel, get to the first place — was the only leg missing.
 *
 * The hotel is the one they *woke up* in, which is the stay holding the
 * previous night. Not `stayForNight(date)`: on the morning they check out that
 * returns nothing, even though they unmistakably start that day at the hotel —
 * and on the day they check in it would claim they came from a room they had
 * not reached yet, when what they actually came from is the airport, which the
 * transfer card already covers.
 */
export const stayDepartedFrom = (stays: StaySpan[], date: string): StaySpan | undefined => {
  if (!date) return undefined;
  const previous = (() => {
    const parsed = new Date(`${date}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return undefined;
    parsed.setDate(parsed.getDate() - 1);
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  })();
  return previous ? stays.find(stay => stay.nights.includes(previous)) : undefined;
};

/** Whether a stay can be one end of a real journey. */
export const stayIsLocated = (stay?: StaySpan): boolean =>
  Boolean(stay
    && typeof stay.latitude === 'number' && Number.isFinite(stay.latitude)
    && typeof stay.longitude === 'number' && Number.isFinite(stay.longitude));
