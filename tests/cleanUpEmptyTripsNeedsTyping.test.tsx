/**
 * @vitest-environment jsdom
 *
 * 「先把之前的只要是空的都旅程都刪掉吧」.
 *
 * This is the only control in the app that deletes several trips on one tap,
 * so what is pinned is the gate rather than the sweep: 「若刪除將完全無法恢復！
 * 確認請輸入刪除」 (2026-11-05) applies here with more force, not less.
 *
 * The confirmation names the trips. 「delete 7 trips」 is not something anybody
 * can check before agreeing to it.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TripSelectionScreen from '../components/TripSelectionScreen';
import type { TripDraft } from '../services/tripPersistence';
import i18n from '../i18n/config';

afterEach(cleanup);

const draft = (id: string, name: string, over: Partial<TripDraft> = {}): TripDraft => ({
  id,
  name,
  startDate: '2026-12-01',
  endDate: '2026-12-03',
  expenses: [],
  companions: [],
  shoppingList: [],
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: `2026-11-0${id.length}T00:00:00.000Z`,
  ...over,
});

const screenWith = (
  drafts: TripDraft[],
  onDeleteDraft = vi.fn((_id: string) => true),
) => {
  render(
    <TripSelectionScreen
      currentDraftExpenses={[]}
      draftName=""
      currentLoadedTripId={null}
      activeDraftId={null}
      forceDraftEmptyState
      tripHistory={[]}
      drafts={drafts}
      onOpenDraft={() => {}}
      onOpenTrip={() => {}}
      onCreateNew={() => {}}
      onDeleteDraft={onDeleteDraft}
      onRenameTrip={() => {}}
      onSmartScan={async () => {}}
      onBatchAddShoppingItems={() => {}}
      onShare={() => {}}
    />,
  );
  return onDeleteDraft;
};

const sweepButton = () => screen.queryByTestId('clean-up-empty-drafts');

describe('offering the sweep', () => {
  it('is not offered for a single empty trip — the card already deletes it', () => {
    screenWith([draft('a', '花蓮')]);
    expect(sweepButton()).toBeNull();
  });

  it('is not offered when the trips have content', () => {
    screenWith([
      draft('a', '花蓮', { expenses: [{ id: 'e' } as never] }),
      draft('b', '台南', { itinerary: [{ id: 'i' } as never] }),
    ]);
    expect(sweepButton()).toBeNull();
  });

  it('counts only the empty ones', () => {
    screenWith([
      draft('a', '花蓮'),
      draft('b', '台南'),
      draft('c', '東京', { expenses: [{ id: 'e' } as never] }),
    ]);
    expect(sweepButton()?.textContent).toContain('2');
  });
});

describe('the gate', () => {
  it('deletes nothing on the tap that opens the dialog', () => {
    const onDelete = screenWith([draft('a', '花蓮'), draft('b', '台南')]);
    fireEvent.click(sweepButton()!);
    expect(screen.getByTestId('clean-up-empty-dialog')).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('names the trips it is about to delete', () => {
    screenWith([draft('a', '花蓮'), draft('b', '台南')]);
    fireEvent.click(sweepButton()!);
    const dialog = screen.getByTestId('clean-up-empty-dialog');
    expect(dialog.textContent).toContain('花蓮');
    expect(dialog.textContent).toContain('台南');
  });

  it('refuses to delete until the word is typed', () => {
    const onDelete = screenWith([draft('a', '花蓮'), draft('b', '台南')]);
    fireEvent.click(sweepButton()!);
    fireEvent.click(screen.getByTestId('confirm-clean-up-empty'));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('deletes every one of them once it is', () => {
    const onDelete = screenWith([draft('a', '花蓮'), draft('b', '台南')]);
    fireEvent.click(sweepButton()!);
    fireEvent.change(screen.getByTestId('clean-up-empty-confirm-input'), {
      target: { value: i18n.t('trips.deleteTypedConfirmation') },
    });
    fireEvent.click(screen.getByTestId('confirm-clean-up-empty'));
    expect(onDelete.mock.calls.map(call => call[0]).sort()).toEqual(['a', 'b']);
  });

  it('cancels without deleting anything', () => {
    const onDelete = screenWith([draft('a', '花蓮'), draft('b', '台南')]);
    fireEvent.click(sweepButton()!);
    fireEvent.click(screen.getByTestId('cancel-clean-up-empty'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByTestId('clean-up-empty-dialog')).toBeNull();
  });
});
