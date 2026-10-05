/**
 * @vitest-environment jsdom
 *
 * 「我提出疑問後，希望對方要收到疑問的通知📢」.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import DisputeNoticeBanner from '../components/DisputeNoticeBanner';
import { DisputeNotice } from '../services/disputeInbox';

afterEach(cleanup);

const waiting: DisputeNotice = {
  id: 'e-coffee:d1:awaiting_my_answer', kind: 'awaiting_my_answer',
  expenseId: 'e-coffee', expenseDescription: 'Strut coffee', disputeId: 'd1',
  message: '這筆我沒有喝到', fromMemberId: 'gina', fromName: 'Gina',
  at: '2026-10-03T10:00:00.000Z',
};

const renderBanner = (notices: DisputeNotice[]) => {
  const onOpen = vi.fn();
  const onDismiss = vi.fn();
  render(<DisputeNoticeBanner notices={notices} onOpen={onOpen} onDismiss={onDismiss} />);
  return { onOpen, onDismiss };
};

describe('the notice at the top of the ledger', () => {
  it('says who asked, about what', () => {
    renderBanner([waiting]);

    expect(screen.getByTestId('dispute-notice-d1').textContent).toContain('Gina 對「Strut coffee」提出疑問');
  });

  it('shows the question itself, not only that there is one', () => {
    // 「Gina 問了一個問題」 sends somebody hunting; the sentence can often be
    // answered on the spot.
    renderBanner([waiting]);

    expect(screen.getByTestId('dispute-notice-d1').textContent).toContain('這筆我沒有喝到');
  });

  it('opens the expense it concerns', () => {
    const { onOpen } = renderBanner([waiting]);

    screen.getByTestId('open-dispute-d1').click();

    expect(onOpen).toHaveBeenCalledWith(waiting);
  });

  it('can be dismissed without answering', async () => {
    const user = userEvent.setup();
    const { onDismiss, onOpen } = renderBanner([waiting]);

    await user.click(screen.getByTestId('dismiss-dispute-d1'));

    expect(onDismiss).toHaveBeenCalledWith(waiting);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('renders nothing at all when there is nothing waiting', () => {
    renderBanner([]);

    expect(screen.queryByTestId('dispute-notices')).toBeNull();
  });

  it('tells an answer apart from a question', () => {
    renderBanner([{
      ...waiting, id: 'x', kind: 'my_question_answered', disputeId: 'd2',
      message: '這杯是你的', fromName: 'North',
    }]);

    expect(screen.getByTestId('dispute-notice-d2').textContent).toContain('回覆了你對「Strut coffee」的疑問');
    expect(screen.getByTestId('dispute-notice-d2').textContent).toContain('點一下查看');
  });
});
