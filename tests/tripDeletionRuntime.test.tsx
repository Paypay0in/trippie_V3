/**
 * @vitest-environment jsdom
 *
 * Runtime proof for deleting a trip: the real App, the real overflow menu and
 * confirmation dialog, real localStorage and a real reload. §10 same-name
 * fixture, §11 cancel and §12 failure rollback.
 */
import { DELETED_TRIPS_STORAGE_KEY } from '../services/deletedTrips';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';

const DRAFTS_KEY = 'trippie_drafts_v1';
const ACTIVE_KEY = 'trippie_active_trip_id';

/** §10 fixture: two trips that share a name and a destination. */
const tripDraft = (id: string, name: string, updatedAt: string) => ({
  id,
  name,
  destination: '釜山',
  startDate: '2026-10-05',
  endDate: '2026-10-06',
  expenses: [],
  companions: [],
  shoppingList: [],
  itinerary: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt,
});

const TRIP_A = tripDraft('A', '釜山', '2026-09-10T00:00:00.000Z');
const TRIP_B = tripDraft('B', '釜山', '2026-09-12T00:00:00.000Z');

const seedStorage = (drafts = [TRIP_A, TRIP_B], activeId: string | null = 'B') => {
  localStorage.clear();
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
};

const storedDrafts = (): Array<{ id: string; name: string }> =>
  JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');

const storedIds = () => storedDrafts().map(draft => draft.id);

beforeEach(() => {
  seedStorage();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mountApp = async () => {
  const { default: App } = await import('../App');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByText('旅行'));
  // The trip list the callers act on, not a fixed delay. Any trip will do —
  // §9 remounts after deleting A, so naming a specific one would be wrong
  // exactly when the list is the thing under test.
  await waitFor(() => expect(screen.getAllByTestId(/^trip-menu-button-/).length).toBeGreaterThan(0));
  return user;
};

/** Opens the overflow menu for one trip and taps 刪除旅程. */
const openDeleteDialog = async (user: ReturnType<typeof userEvent.setup>, id: string) => {
  await user.click(screen.getByTestId(`trip-menu-button-${id}`));
  await user.click(screen.getByTestId(`delete-trip-${id}`));
};

/** Deleting now requires typing the word first; confirm stays disabled until then. */
const confirmDelete = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByTestId('delete-trip-confirm-input'), '刪除');
  await user.click(screen.getByTestId('confirm-delete-trip'));
};

describe('delete trip runtime', () => {
  it('shows the destructive confirmation with the trip name before deleting', async () => {
    const user = await mountApp();
    await openDeleteDialog(user, 'A');

    const dialog = screen.getByTestId('delete-trip-dialog');
    expect(within(dialog).getByText('刪除這趟旅程？')).toBeTruthy();
    expect(dialog.textContent).toContain('這趟旅程的行程、記帳與相關資料將從目前的 Trip 資料中移除');
    expect(within(dialog).getByTestId('cancel-delete-trip')).toBeTruthy();
    expect(within(dialog).getByTestId('confirm-delete-trip')).toBeTruthy();
    // Nothing is gone until the user confirms.
    expect(storedIds()).toEqual(['A', 'B']);
  });

  it('keeps delete disabled until the word 刪除 is typed exactly', async () => {
    const user = await mountApp();
    await openDeleteDialog(user, 'A');

    const confirm = screen.getByTestId('confirm-delete-trip') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    // A near-miss is not a confirmation.
    await user.type(screen.getByTestId('delete-trip-confirm-input'), '刪');
    expect((screen.getByTestId('confirm-delete-trip') as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByTestId('confirm-delete-trip'));
    expect(storedIds()).toEqual(['A', 'B']);

    await user.type(screen.getByTestId('delete-trip-confirm-input'), '除');
    expect((screen.getByTestId('confirm-delete-trip') as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not carry a typed confirmation into the next dialog', async () => {
    const user = await mountApp();
    await openDeleteDialog(user, 'A');
    await user.type(screen.getByTestId('delete-trip-confirm-input'), '刪除');
    await user.click(screen.getByTestId('cancel-delete-trip'));

    await openDeleteDialog(user, 'B');
    expect((screen.getByTestId('delete-trip-confirm-input') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('confirm-delete-trip') as HTMLButtonElement).disabled).toBe(true);
    expect(storedIds()).toEqual(['A', 'B']);
  });

  it('§10 deletes only the named trip and leaves its same-named sibling', async () => {
    const user = await mountApp();
    await openDeleteDialog(user, 'A');
    await confirmDelete(user);

    expect(storedIds()).toEqual(['B']);
    expect(storedDrafts()[0].name).toBe('釜山');
    // §8 the card is gone without a reload.
    expect(screen.queryByTestId('trip-menu-button-A')).toBeNull();
    expect(screen.getByTestId('trip-menu-button-B')).toBeTruthy();
  });

  it('§9 stays deleted across a reload', async () => {
    const user = await mountApp();
    await openDeleteDialog(user, 'A');
    await confirmDelete(user);

    cleanup();
    await mountApp();
    expect(storedIds()).toEqual(['B']);
    expect(screen.queryByTestId('trip-menu-button-A')).toBeNull();
  });

  it('§11 cancel deletes nothing and leaves the active trip alone', async () => {
    const user = await mountApp();
    const activeBefore = localStorage.getItem(ACTIVE_KEY);

    await openDeleteDialog(user, 'A');
    await user.click(screen.getByTestId('cancel-delete-trip'));

    expect(screen.queryByTestId('delete-trip-dialog')).toBeNull();
    expect(storedIds()).toEqual(['A', 'B']);
    expect(localStorage.getItem(ACTIVE_KEY)).toBe(activeBefore);
  });

  it('§5 deleting the ACTIVE trip leaves no stale active id', async () => {
    seedStorage([TRIP_A, TRIP_B], 'A');
    const user = await mountApp();
    await openDeleteDialog(user, 'A');
    await confirmDelete(user);

    expect(storedIds()).toEqual(['B']);
    const active = localStorage.getItem(ACTIVE_KEY);
    expect(active).not.toBe('A');
    // Whatever it points at must be a trip that still exists.
    if (active) expect(storedIds()).toContain(active);
  });

  it('§5 deleting the last trip clears the active id without crashing', async () => {
    seedStorage([TRIP_A], 'A');
    const user = await mountApp();
    await openDeleteDialog(user, 'A');
    await confirmDelete(user);

    expect(storedIds()).toEqual([]);
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
    // The workspace is still alive and rendering.
    expect(document.body.textContent).toBeTruthy();
  });

  it('§12 a failed write restores the store and keeps the card', async () => {
    const user = await mountApp();
    const original = Storage.prototype.setItem;
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key: string, value: string) {
        if (key === DRAFTS_KEY) throw new Error('quota exceeded');
        return original.call(this, key, value);
      });

    await openDeleteDialog(user, 'A');
    await confirmDelete(user);

    setItemSpy.mockRestore();

    // Nothing was removed, and the dialog says so rather than closing silently.
    expect(storedIds()).toEqual(['A', 'B']);
    expect(screen.getByTestId('delete-trip-dialog')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('旅程刪除失敗');
  });

  /**
   * The guarantee is that a delete damages nothing it was not asked to touch.
   *
   * The tombstone is not damage — it is the delete itself, and 「我已全部都刪掉過了
   * 但又一直出現」 is what happened while it did not exist: the cloud merge put
   * back every trip this device could not account for. So it is excluded from
   * the comparison and then asserted on its own, rather than quietly widening
   * the rule to 「some new keys are fine」.
   */
  it('§6 deletes nothing outside the trip collection', async () => {
    const user = await mountApp();
    const unrelated = () => Object.fromEntries(
      Object.keys(localStorage)
        .filter(key => key !== DRAFTS_KEY && key !== ACTIVE_KEY && key !== DELETED_TRIPS_STORAGE_KEY)
        .map(key => [key, localStorage.getItem(key)]),
    );
    // Snapshot every other key AFTER mount, so the app's own startup writes are
    // not mistaken for deletion damage.
    const before = unrelated();
    expect(Object.keys(before).length).toBeGreaterThan(0);

    await openDeleteDialog(user, 'A');
    await confirmDelete(user);

    expect(unrelated()).toEqual(before);
    expect(storedIds()).toEqual(['B']);
  });

  it('§6 記下這一趟已經被刪掉，否則雲端下次又會把它送回來', async () => {
    const user = await mountApp();

    await openDeleteDialog(user, 'A');
    await confirmDelete(user);

    expect(JSON.parse(localStorage.getItem(DELETED_TRIPS_STORAGE_KEY) || '[]'))
      .toContain('A');
  });
});
