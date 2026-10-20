/**
 * @vitest-environment jsdom
 *
 * 「一句話說完也可以」.
 *
 * The spec's ideal is one sentence in, a full draft out. The form was asking
 * the traveller to take their own sentence apart: destination here, dates
 * there, a stepper for the people, a radio for the pace, and the rest into a
 * box at the bottom.
 *
 * The box is above the form, not instead of it — what was read is shown back,
 * and the fields below are where it gets corrected.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TripPlanBriefScreen from '../components/TripPlanBriefScreen';

const parseSentence = vi.fn();

vi.mock('../services/briefFromSentence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/briefFromSentence')>();
  return { ...actual, parseSentence: (...args: unknown[]) => parseSentence(...args) };
});

afterEach(() => { cleanup(); parseSentence.mockReset(); });

const open = () => render(
  <TripPlanBriefScreen onClose={vi.fn()} onPreview={vi.fn()} onGenerate={vi.fn()} />,
);

const read = (sentence: string) => {
  fireEvent.change(screen.getByTestId('brief-sentence'), { target: { value: sentence } });
  fireEvent.click(screen.getByTestId('brief-read-sentence'));
};

const THE_SENTENCE = '11月去東京五天，兩個人，喜歡美術館、咖啡廳和購物，不想太趕。住宿在新宿，想去 teamLab。';

describe('reading one sentence', () => {
  it('fills the form in', async () => {
    parseSentence.mockResolvedValue({
      destination: '東京', travellers: 2, month: 11, days: 5, pace: 2,
      interests: ['美術館', '咖啡廳', '購物'], mustDo: ['teamLab'], lodging: '新宿',
    });
    open();

    read(THE_SENTENCE);

    await waitFor(() => expect(
      (screen.getByTestId('brief-destination') as HTMLInputElement).value,
    ).toBe('東京'));
    expect(screen.getByTestId('brief-travellers').textContent).toBe('2');
    expect(screen.getByTestId('brief-pace-2').getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByTestId('brief-notes') as HTMLTextAreaElement).value).toContain('teamLab');
  });

  it('shows back what it understood', async () => {
    parseSentence.mockResolvedValue({ destination: '東京', days: 5, mustDo: ['teamLab'] });
    open();

    read(THE_SENTENCE);

    const back = await screen.findByTestId('brief-read-back');
    expect(back.textContent).toContain('目的地：東京');
    expect(back.textContent).toContain('必去：teamLab');
  });

  /*
    A default that arrived without being mentioned looks exactly like an
    answer. The line underneath says which numbers are still Trippie's guess.
  */
  it('names what the sentence never said', async () => {
    parseSentence.mockResolvedValue({ destination: '東京', days: 5 });
    open();

    read(THE_SENTENCE);

    const asking = await screen.findByTestId('brief-still-asking');
    expect(asking.textContent).toContain('幾個人');
    expect(asking.textContent).toContain('步調');
  });

  it('says what went wrong, and that the form still works', async () => {
    parseSentence.mockRejectedValue(new Error('這句話現在讀不出來，直接填下面的表單也可以。'));
    open();

    read(THE_SENTENCE);

    await waitFor(() => expect(screen.getByTestId('brief-read-error').textContent)
      .toContain('直接填下面的表單也可以'));
  });

  it('will not read an empty box', () => {
    open();
    expect(screen.getByTestId('brief-read-sentence').hasAttribute('disabled')).toBe(true);
  });
});
