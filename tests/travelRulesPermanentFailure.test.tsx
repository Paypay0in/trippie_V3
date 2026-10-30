/**
 * @vitest-environment jsdom
 *
 * 「稍後可再試」 was the answer to every failure the service could produce.
 *
 * The service throws one class for every non-ok response and carries the real
 * status on it (`travelRulesService.ts`), but nothing downstream read that
 * status. A 404 — this destination has no rules to find — and a 503 — the
 * service is down for a minute — reached the traveller as the same sentence,
 * so the one who could never succeed was sent back to press the button again.
 *
 * Founder decision, 2026-10-28: 400/403/404/422 are permanent, 429 is its own
 * case with its own wording, everything else is transient. The copy is ours in
 * every case — the API's own message is for the log, never for the traveller,
 * because it arrives in English as often as not.
 *
 * Both lookup entrypoints now ask the same function, so the same failure cannot
 * read as two different problems depending on which screen the traveller
 * started from.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  permanentMessage,
  quotaMessage,
  transientMessage,
  travelRulesErrorMessage,
} from '../services/travelRulesErrorMessage';
import { TravelRulesRequestError } from '../services/travelRulesService';
import TravelIdentityModal from '../components/TravelIdentityModal';

const failWith = (status: number, message = 'Travel rules research failed.') =>
  new TravelRulesRequestError(message, status);

describe('旅行規定查詢失敗的分類', () => {
  it('永久失敗不叫旅人再試一次', () => {
    for (const status of [400, 403, 404, 422]) {
      expect(travelRulesErrorMessage(failWith(status))).toBe(permanentMessage());
    }
  });

  it('額度用完有自己的說法，不混進永久也不混進暫時', () => {
    expect(travelRulesErrorMessage(failWith(429))).toBe(quotaMessage());
    expect(quotaMessage()).not.toBe(permanentMessage());
    expect(quotaMessage()).not.toBe(transientMessage());
  });

  it('真的是暫時的才說稍後可再試', () => {
    for (const status of [408, 500, 502, 503, 504]) {
      expect(travelRulesErrorMessage(failWith(status))).toBe(transientMessage());
    }
  });

  it('前置條件說出自己是哪一件事', () => {
    expect(travelRulesErrorMessage(new Error('尚未設定本次旅程目的地。')))
      .toBe('尚未設定本次旅程目的地。');
    expect(travelRulesErrorMessage(new Error('請先選擇具有國家代碼的護照。')))
      .toBe('請先選擇具有國家代碼的護照。');
  });

  it('沒有話可說時退回暫時性的說法', () => {
    expect(travelRulesErrorMessage(new Error('   '))).toBe(transientMessage());
    expect(travelRulesErrorMessage('not an error at all')).toBe(transientMessage());
    expect(travelRulesErrorMessage(undefined)).toBe(transientMessage());
  });

  it('伺服器的原文不會出現在旅人眼前', () => {
    const message = travelRulesErrorMessage(
      failWith(429, 'Quota exceeded for this project'),
    );
    expect(message).not.toContain('Quota');
  });
});

describe('旅行身分彈窗真的把算出來的訊息顯示出來', () => {
  const passports = [{ id: 'p1', country: '台灣', countryCode: 'TW' }];

  afterEach(cleanup);

  const renderModal = (error: unknown) => render(
    <TravelIdentityModal
      passports={passports}
      selectedPassportId="p1"
      destination="韓國"
      onResearchTravelRules={vi.fn(async () => { throw error; })}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  it('404 顯示永久失敗的說法，不是稍後可再試', async () => {
    renderModal(failWith(404));
    await userEvent.click(screen.getByText('儲存並更新旅行規定'));
    await waitFor(() => expect(screen.getByText(permanentMessage())).toBeTruthy());
    expect(screen.queryByText(transientMessage())).toBeNull();
  });

  it('前置條件的原話會被顯示出來', async () => {
    renderModal(new Error('尚未設定本次旅程目的地。'));
    await userEvent.click(screen.getByText('儲存並更新旅行規定'));
    await waitFor(() => expect(screen.getByText('尚未設定本次旅程目的地。')).toBeTruthy());
  });
});
