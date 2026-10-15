/**
 * @vitest-environment jsdom
 *
 * 告訴我你的旅行計畫 — the questionnaire behind 「AI 幫我排行程」.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import TripPlanBriefScreen from '../components/TripPlanBriefScreen';

afterEach(cleanup);

/*
  An empty plan, so a test that only cares about the brief does not have to
  care about the preview. 「P1 — 生成直接建立並保存旅程」 — the brief now goes to
  `onPreview`, and `onGenerate` is what accepting the preview calls.
*/
const EMPTY_PLAN = { days: [], warnings: [] } as never;

const open = (props: Record<string, unknown> = {}) => {
  const onGenerate = vi.fn();
  const onPreview = vi.fn().mockResolvedValue(EMPTY_PLAN);
  render(
    <TripPlanBriefScreen
      onClose={vi.fn()}
      onPreview={onPreview}
      onGenerate={onGenerate}
      {...props}
    />,
  );
  return { onGenerate, onPreview };
};

const fill = (destination = '韓國 釜山') => {
  fireEvent.change(screen.getByTestId('brief-destination'), { target: { value: destination } });
  fireEvent.change(screen.getByTestId('brief-start'), { target: { value: '2026-10-02' } });
  fireEvent.change(screen.getByTestId('brief-end'), { target: { value: '2026-10-07' } });
};

describe('before anything is filled in', () => {
  /**
   * A disabled button with no reason beside it is a dead end the traveller
   * has to solve by guessing which field.
   */
  it('says what is missing instead of only greying the button', () => {
    open();
    expect(screen.getByTestId('brief-problems').textContent).toContain('還沒填要去哪裡');
    expect(screen.getByTestId('brief-generate').hasAttribute('disabled')).toBe(true);
  });

  it('starts on the defaults the design shows', () => {
    open();
    expect(screen.getByTestId('brief-travellers').textContent).toBe('2');
    expect(screen.getByTestId('brief-transport-walk').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('brief-transport-transit').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('brief-transport-drive').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('brief-pace-3').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('filling it in', () => {
  it('counts the days across the range', () => {
    open();
    fill();
    expect(screen.getByTestId('brief-days').textContent).toBe('6 天');
  });

  it('hands the whole brief over to the planner', () => {
    const { onPreview } = open();
    fill();
    fireEvent.click(screen.getByTestId('brief-transport-drive'));
    fireEvent.change(screen.getByTestId('brief-start-time'), { target: { value: '11:00' } });
    fireEvent.click(screen.getByTestId('brief-pace-2'));
    fireEvent.change(screen.getByTestId('brief-notes'), { target: { value: '想去汗蒸幕' } });
    fireEvent.click(screen.getByTestId('brief-generate'));

    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({
      destination: '韓國 釜山',
      startDate: '2026-10-02',
      endDate: '2026-10-07',
      travellers: 2,
      transport: ['walk', 'transit', 'drive'],
      dayStartTime: '11:00',
      pace: 2,
      notes: '想去汗蒸幕',
    }));
  });

  it('counts people up and down, never below one', () => {
    open();
    fireEvent.click(screen.getByTestId('brief-travellers-minus'));
    fireEvent.click(screen.getByTestId('brief-travellers-minus'));
    fireEvent.click(screen.getByTestId('brief-travellers-minus'));
    expect(screen.getByTestId('brief-travellers').textContent).toBe('1');
  });

  it('prefills a destination the traveller already named', () => {
    open({ initialDestination: '日本 東京' });
    expect((screen.getByTestId('brief-destination') as HTMLInputElement).value).toBe('日本 東京');
  });
});

describe('when the dates are not settled', () => {
  it('asks for a day count instead', () => {
    open();
    fireEvent.click(screen.getByTestId('brief-dates-unknown'));
    expect(screen.queryByTestId('brief-start')).toBeNull();
    expect(screen.getByTestId('brief-approx-days')).toBeTruthy();
  });

  /**
   * A date that still travels while the screen says the dates are unknown is
   * found when the day tabs are already wrong.
   */
  it('clears the dates rather than hiding them', () => {
    const { onPreview } = open();
    fill();
    fireEvent.click(screen.getByTestId('brief-dates-unknown'));
    fireEvent.change(screen.getByTestId('brief-approx-days'), { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('brief-generate'));

    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({
      startDate: undefined, endDate: undefined, approximateDays: 4,
    }));
  });

  it('is ready on a day count alone', () => {
    open();
    fireEvent.change(screen.getByTestId('brief-destination'), { target: { value: '釜山' } });
    fireEvent.click(screen.getByTestId('brief-dates-unknown'));
    fireEvent.change(screen.getByTestId('brief-approx-days'), { target: { value: '4' } });
    expect(screen.getByTestId('brief-generate').hasAttribute('disabled')).toBe(false);
  });
});

/**
 * 「不用合併」 — 匯入旅程資料 keeps its own door. The upload inside this form
 * shares those parsers and nothing else.
 */
describe('the booking upload inside the form', () => {
  it('hands off to the reader rather than duplicating it', () => {
    const onUploadBookings = vi.fn();
    open({ onUploadBookings });
    fireEvent.click(screen.getByTestId('brief-upload'));
    expect(onUploadBookings).toHaveBeenCalled();
  });

  /** A tile that cannot do anything should not look like it can. */
  it('is disabled when there is nothing to hand off to', () => {
    open();
    expect(screen.getByTestId('brief-upload').hasAttribute('disabled')).toBe(true);
  });
});

/**
 * 「P0 — AI 生成沒有產生日程」 and 「P1 — 生成直接建立並保存旅程」.
 *
 * The button said 生成, created an empty trip, saved it, and planned nothing.
 * Those are the same gap seen twice: planning and creating were one step with
 * nobody in between.
 */
describe('先看計畫，再決定要不要建立', () => {
  const PLAN = {
    days: [{
      date: '2026-10-02',
      items: [
        { id: 'p1', placeName: '甘川文化村', source: 'ai_suggestion', sourceInspirationIds: [], suggestedStartTime: '10:00' },
        { id: 'p2', placeName: '海雲台', source: 'ai_suggestion', sourceInspirationIds: [], suggestedStartTime: '14:00' },
      ],
    }],
    warnings: [],
  } as never;

  const start = () => {
    const onGenerate = vi.fn();
    const onPreview = vi.fn().mockResolvedValue(PLAN);
    render(<TripPlanBriefScreen onClose={vi.fn()} onPreview={onPreview} onGenerate={onGenerate} />);
    return { onGenerate, onPreview };
  };

  it('按生成只會排出計畫，不會建立旅程', async () => {
    const { onGenerate } = start();
    fill();

    fireEvent.click(screen.getByTestId('brief-generate'));

    expect(await screen.findByTestId('brief-preview')).toBeTruthy();
    expect(screen.getByTestId('brief-preview').textContent).toContain('甘川文化村');
    // The whole point: nothing exists yet.
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('按下建立才把計畫交出去', async () => {
    const { onGenerate } = start();
    fill();
    fireEvent.click(screen.getByTestId('brief-generate'));
    await screen.findByTestId('brief-preview');

    fireEvent.click(screen.getByTestId('brief-accept'));

    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ destination: '韓國 釜山' }),
      PLAN,
    );
  });

  it('取消就什麼都沒發生', async () => {
    const { onGenerate } = start();
    fill();
    fireEvent.click(screen.getByTestId('brief-generate'));
    await screen.findByTestId('brief-preview');

    fireEvent.click(screen.getByText('取消'));

    expect(screen.queryByTestId('brief-preview')).toBeNull();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  /* A planner that is down must not leave a half-made trip behind. */
  it('AI 失敗時說清楚，而且沒有建立任何東西', async () => {
    const onGenerate = vi.fn();
    render(
      <TripPlanBriefScreen
        onClose={vi.fn()}
        onPreview={vi.fn().mockRejectedValue(new Error('down'))}
        onGenerate={onGenerate}
      />,
    );
    fill();

    fireEvent.click(screen.getByTestId('brief-generate'));

    expect((await screen.findByTestId('brief-error')).textContent).toContain('沒有被建立');
    expect(onGenerate).not.toHaveBeenCalled();
  });
});
