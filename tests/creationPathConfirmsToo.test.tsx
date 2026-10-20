/**
 * @vitest-environment jsdom
 *
 * 「標示待確認資訊」 — on the path a trip is actually created through.
 *
 * It was built once and wired to one of the two planning paths. So
 * `/api/activity-plans` refused to quote a price it had not verified, scrubbed
 * any the model wrote anyway, and said which places sell out — while
 * `/api/itinerary-proposals`, the one behind 生成我的專屬行程, did none of it.
 * Two standards inside one product, and the weaker one is the default.
 *
 * The services are shared rather than copied, so the two cannot drift into
 * disagreeing about what needs confirming. These hold the client half: the
 * preparation list survives the normaliser and reaches the screen.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TripPlanBriefScreen from '../components/TripPlanBriefScreen';
import { normalizeTripInspirationProposal } from '../services/itineraryPlanningService';

afterEach(cleanup);

const input = {
  destination: '東京',
  startDate: '2026-11-03',
  endDate: '2026-11-05',
  today: '2026-10-19',
  selections: [],
} as never;

describe('the proposal carries what has to be booked', () => {
  it('keeps the preparation the server derived', () => {
    const proposal = normalizeTripInspirationProposal({
      days: [],
      warnings: [],
      preparation: [{ name: '先買 teamLab 門票', leadTimeDays: 7 }],
    }, input);

    expect(proposal.preparation).toEqual([{ name: '先買 teamLab 門票', leadTimeDays: 7 }]);
  });

  /* A task with no name is not a task. */
  it('drops anything that does not name a chore', () => {
    const proposal = normalizeTripInspirationProposal({
      days: [], warnings: [], preparation: [{ name: '  ' }, 'nonsense', null],
    }, input);

    expect(proposal.preparation).toBeUndefined();
  });

  it('says nothing when the plan requires nothing', () => {
    expect(normalizeTripInspirationProposal({ days: [], warnings: [] }, input).preparation)
      .toBeUndefined();
  });
});

describe('the preview, before the trip exists', () => {
  const PLAN = {
    days: [{
      date: '2026-11-03',
      items: [{ id: 'p1', placeName: 'teamLab', source: 'ai_suggestion', sourceInspirationIds: [], suggestedStartTime: '10:00' }],
    }],
    warnings: [],
    preparation: [{ name: '先買 teamLab 門票', leadTimeDays: 7 }],
  } as never;

  const fill = () => {
    fireEvent.change(screen.getByTestId('brief-destination'), { target: { value: '日本 東京' } });
    fireEvent.change(screen.getByTestId('brief-start'), { target: { value: '2026-11-03' } });
    fireEvent.change(screen.getByTestId('brief-end'), { target: { value: '2026-11-05' } });
  };

  /*
    Before the trip is created, not discovered inside it. 「要先買票」 decides
    whether a day is possible, and the plan reads as a finished answer without
    it.
  */
  it('says what has to be booked first', async () => {
    render(
      <TripPlanBriefScreen
        onClose={vi.fn()}
        onPreview={vi.fn().mockResolvedValue(PLAN)}
        onGenerate={vi.fn()}
      />,
    );
    fill();

    fireEvent.click(screen.getByTestId('brief-generate'));

    const prep = await screen.findByTestId('brief-preparation');
    expect(prep.textContent).toContain('先買 teamLab 門票');
    expect(prep.textContent).toContain('提前 7 天');
  });

  it('shows no such box when there is nothing to book', async () => {
    render(
      <TripPlanBriefScreen
        onClose={vi.fn()}
        onPreview={vi.fn().mockResolvedValue({ days: [], warnings: [] } as never)}
        onGenerate={vi.fn()}
      />,
    );
    fill();

    fireEvent.click(screen.getByTestId('brief-generate'));

    await screen.findByTestId('brief-preview');
    expect(screen.queryByTestId('brief-preparation')).toBeNull();
  });
});
