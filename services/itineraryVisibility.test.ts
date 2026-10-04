import { describe, expect, it } from 'vitest';
import { ItineraryItem, TripMember } from '../types';
import {
  isOwnItem,
  isPersonal,
  ownerLabelFor,
  partitionDayByViewer,
  visibilityOf,
} from './itineraryVisibility';

const item = (over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id: over.id || 'i1', time: '10:00', title: '行程', location: '', notes: '', type: 'ACTIVITY', ...over,
});

const MEMBERS: TripMember[] = [
  { id: 'm1', name: 'North', userId: 'u-north', type: 'owner' },
  { id: 'm2', name: 'Gina', userId: 'u-gina', type: 'member' },
];

describe('whose item it is', () => {
  it('treats an item from before the field as shared', () => {
    // The whole existing itinerary has no visibility recorded. If absent read
    // as personal, opening the trip on the other phone would empty it.
    expect(visibilityOf(item())).toBe('shared');
    expect(isPersonal(item())).toBe(false);
  });

  it('counts a shared item as the viewer own item, whoever they are', () => {
    expect(isOwnItem(item(), 'u-gina')).toBe(true);
  });

  it('counts a personal item as its owner only', () => {
    const haircut = item({ visibility: 'personal', ownerUserId: 'u-gina' });

    expect(isOwnItem(haircut, 'u-gina')).toBe(true);
    expect(isOwnItem(haircut, 'u-north')).toBe(false);
  });

  it('keeps an unattributed personal item on the plan that is reading it', () => {
    // Written before anyone was signed in, so there is no owner to compare.
    // Nobody's item would be a lost item.
    expect(isOwnItem(item({ visibility: 'personal' }), 'u-north')).toBe(true);
  });
});

describe('splitting a day', () => {
  it('keeps the viewer plan separate from a companion plan', () => {
    const day = [
      item({ id: 'joint', title: '海雲台' }),
      item({ id: 'hers', title: '剪頭髮', visibility: 'personal', ownerUserId: 'u-gina' }),
      item({ id: 'mine', title: '咖啡', visibility: 'personal', ownerUserId: 'u-north' }),
    ];

    const { mine, theirs } = partitionDayByViewer(day, 'u-north');

    expect(mine.map(entry => entry.id)).toEqual(['joint', 'mine']);
    expect(theirs.map(entry => entry.id)).toEqual(['hers']);
  });

  it('shows a companion the same day from their side', () => {
    const day = [
      item({ id: 'joint' }),
      item({ id: 'hers', visibility: 'personal', ownerUserId: 'u-gina' }),
    ];

    expect(partitionDayByViewer(day, 'u-gina').mine.map(entry => entry.id)).toEqual(['joint', 'hers']);
  });

  it('leaves the order it was given alone', () => {
    const day = [item({ id: 'b', time: '18:00' }), item({ id: 'a', time: '09:00' })];

    expect(partitionDayByViewer(day, 'u-north').mine.map(entry => entry.id)).toEqual(['b', 'a']);
  });
});

describe('saying whose it is', () => {
  it('names the companion whose item it is', () => {
    const hers = item({ visibility: 'personal', ownerUserId: 'u-gina' });

    expect(ownerLabelFor(hers, MEMBERS, 'u-north')).toBe('Gina');
  });

  it('says nothing on a shared item or on the viewer own item', () => {
    expect(ownerLabelFor(item(), MEMBERS, 'u-north')).toBeUndefined();
    expect(ownerLabelFor(item({ visibility: 'personal', ownerUserId: 'u-north' }), MEMBERS, 'u-north')).toBeUndefined();
  });

  it('falls back to 同行者 rather than showing an id', () => {
    const stranger = item({ visibility: 'personal', ownerUserId: 'u-unknown' });

    expect(ownerLabelFor(stranger, MEMBERS, 'u-north')).toBe('同行者');
  });
});
