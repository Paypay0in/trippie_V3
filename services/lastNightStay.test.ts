import { describe, expect, it } from 'vitest';
import { stayRowState } from './lastNightStay';

/**
 * 「最後一天的住宿資訊要寫成：今日退房」.
 *
 * The distinction these protect: an unbooked night in the middle of a trip is
 * a gap the traveller needs told, and an unbooked night on the last day is not
 * a night at all.
 */

describe('the accommodation row', () => {
  it('shows the room when there is one', () => {
    expect(stayRowState({ date: '2026-10-05', endDate: '2026-10-07', hasStay: true }))
      .toBe('booked');
  });

  /** The exact report: 退房 11:00 above an invitation to find a bed. */
  it('says you checked out on the last day instead of asking you to book', () => {
    expect(stayRowState({ date: '2026-10-07', endDate: '2026-10-07', hasStay: false }))
      .toBe('checked_out');
  });

  /**
   * Changing hotels on day three looks identical — checked out, nothing
   * booked — and that traveller genuinely has nowhere to sleep tonight. This
   * row is the only thing that would tell them.
   */
  it('still asks when there is a night left to book', () => {
    expect(stayRowState({ date: '2026-10-03', endDate: '2026-10-07', hasStay: false }))
      .toBe('missing');
  });

  it('says checked out on the day before the end, only once the end arrives', () => {
    expect(stayRowState({ date: '2026-10-06', endDate: '2026-10-07', hasStay: false }))
      .toBe('missing');
  });

  /** A day past the end has no night either. */
  it('treats a day beyond the end as checked out', () => {
    expect(stayRowState({ date: '2026-10-09', endDate: '2026-10-07', hasStay: false }))
      .toBe('checked_out');
  });

  /** A booking covering the last night wins: the room is the fact. */
  it('shows a room booked for the last night', () => {
    expect(stayRowState({ date: '2026-10-07', endDate: '2026-10-07', hasStay: true }))
      .toBe('booked');
  });

  /**
   * A trip with no dates is being planned, and that is exactly when an
   * unbooked night is most worth showing.
   */
  it('keeps the prompt when the trip has no end date', () => {
    expect(stayRowState({ date: '2026-10-07', hasStay: false })).toBe('missing');
  });

  it('keeps the prompt when the day is unknown', () => {
    expect(stayRowState({ endDate: '2026-10-07', hasStay: false })).toBe('missing');
  });
});
