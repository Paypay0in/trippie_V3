/**
 * @vitest-environment jsdom
 *
 * 「行程並不是所有人的都會相同，所以要有可以共享本行程或是個人行程的選項」 and
 * 「你的朋友可以在他的行程表上看到你的行程」.
 *
 * One list, every row joint, was the assumption. So the same day has to render
 * differently for each traveller: my plan, plus what my companion is doing
 * beside it — visible, attributed, and not occupying my afternoon.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import type { ItineraryItem, TripMember } from '../types';
import ItineraryCalendar from '../components/ItineraryCalendar';
import ItineraryItemForm from '../components/ItineraryItemForm';

vi.mock('../services/placePhotoService', () => ({ fetchPlacePhoto: () => Promise.resolve(null) }));
vi.mock('../services/placeCommerceService', () => ({
  fetchPlaceCommerce: () => Promise.resolve(null),
  hasDisplayableCommerce: () => false,
}));
vi.mock('../services/routesService', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  estimateRoute: () => Promise.resolve(null),
  fetchRouteLeg: () => Promise.resolve(null),
}));
vi.mock('../services/placeService', () => ({
  autocompletePlaces: () => Promise.resolve([]),
  getPlaceDetails: () => Promise.resolve(null),
}));

afterEach(cleanup);

const DAY = '2026-10-04';

const MEMBERS: TripMember[] = [
  { id: 'm1', name: 'North', userId: 'u-north', type: 'owner' },
  { id: 'm2', name: 'Gina', userId: 'u-gina', type: 'member' },
];

const item = (over: Partial<ItineraryItem> & { id: string }): ItineraryItem => ({
  title: over.title || '行程', location: over.location || '', notes: '', type: 'ACTIVITY',
  date: DAY, time: '10:00', durationMinutes: 60, ...over,
} as ItineraryItem);

const DAY_ITEMS = [
  item({ id: 'joint', title: '海雲台', time: '10:00' }),
  item({ id: 'hers', title: '剪頭髮', time: '14:00', visibility: 'personal', ownerUserId: 'u-gina' }),
  item({ id: 'mine', title: '咖啡', time: '16:00', visibility: 'personal', ownerUserId: 'u-north' }),
];

const renderCalendar = (viewerUserId?: string) => render(
  <ItineraryCalendar
    items={DAY_ITEMS}
    startDate={DAY}
    endDate={DAY}
    viewerUserId={viewerUserId}
    members={MEMBERS}
  />,
);

describe('a day with two travellers on it', () => {
  it('keeps a companion personal item out of the viewer timeline', () => {
    renderCalendar('u-north');

    // Not a row of mine: no card, so nothing to drag, retime or collide with.
    expect(document.querySelector('[data-item-id="hers"]')).toBeNull();
    expect(document.querySelector('[data-item-id="mine"]')).not.toBeNull();
  });

  it('still shows it, attributed, beside the plan', () => {
    // 「你的朋友可以在他的行程表上看到你的行程」 — visible is the point; it just
    // is not one of my rows.
    renderCalendar('u-north');

    const strip = screen.getByTestId('companion-itinerary');

    expect(strip.textContent).toContain('剪頭髮');
    expect(strip.textContent).toContain('Gina');
  });

  it('marks the viewer own personal item on their plan', () => {
    renderCalendar('u-north');

    expect(screen.getByTestId('personal-badge-mine').textContent).toContain('個人行程');
    expect(screen.queryByTestId('personal-badge-joint')).toBeNull();
  });

  it('renders the same day from the companion side', () => {
    renderCalendar('u-gina');

    // Hers is now a row of her own, and mine is the one on the side.
    expect(screen.getByTestId('personal-badge-hers')).toBeTruthy();
    expect(screen.getByTestId('companion-itinerary').textContent).toContain('咖啡');
    expect(screen.getByTestId('companion-itinerary').textContent).toContain('North');
  });

  it('shows no companion strip when nothing is anyone else', () => {
    render(<ItineraryCalendar items={[DAY_ITEMS[0]]} startDate={DAY} endDate={DAY} viewerUserId="u-north" members={MEMBERS} />);

    expect(screen.queryByTestId('companion-itinerary')).toBeNull();
  });
});

describe('choosing whose an item is', () => {
  const renderForm = () => {
    const onSave = vi.fn();
    render(
      <ItineraryItemForm
        startDate={DAY}
        endDate={DAY}
        initialDate={DAY}
        viewerUserId="u-north"
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    return { onSave };
  };

  it('saves a shared item with no owner stamped on it', async () => {
    // A joint item belongs to the trip, not to whoever typed it.
    const user = userEvent.setup();
    const { onSave } = renderForm();

    await user.type(document.querySelectorAll('input')[1] as HTMLInputElement, '海雲台');
    await user.click(screen.getByRole('button', { name: '儲存' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: '海雲台' }));
    expect(onSave.mock.calls[0][0].visibility).toBeUndefined();
    expect(onSave.mock.calls[0][0].ownerUserId).toBeUndefined();
  });

  it('records who a personal item belongs to', async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();

    await user.type(document.querySelectorAll('input')[1] as HTMLInputElement, '剪頭髮');
    await user.click(screen.getByTestId('item-visibility-personal'));
    await user.click(screen.getByRole('button', { name: '儲存' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: '剪頭髮', visibility: 'personal', ownerUserId: 'u-north',
    }));
  });

  it('defaults to shared', () => {
    renderForm();

    expect(screen.getByTestId('item-visibility-shared').getAttribute('aria-pressed')).toBe('true');
  });
});
