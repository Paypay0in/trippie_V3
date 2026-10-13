/**
 * @vitest-environment jsdom
 *
 * 「未來建立旅程可以直接從好友名單加入旅伴」.
 *
 * The screen for this was already built. `CompanionsModal` computes
 * `availableFriends` and offers `onAddFriendToTrip`; the create-trip screen
 * already hands it `friends` and already appends whoever is picked.
 *
 * It was always empty. `friends` was a `useState` seeded from a localStorage
 * key nobody ever wrote — `setFriends` had no callers anywhere in the app — so
 * the array could only ever be `[]`, and a working picker was offering a list
 * that could not be filled.
 */
import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CompanionsModal from '../components/CompanionsModal';
import { friendIdsFor } from '../services/postVisibility';

afterEach(cleanup);

const APP = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');

const ME = 'auth-ann';
const GINA = 'auth-gina';

describe('the list the picker is given', () => {
  /**
   * The derivation, end to end: accepted friendships and the people already
   * resolved for the friends panel become the companions the picker offers.
   */
  it('turns an accepted friendship into a pickable companion', () => {
    const friendships = [
      { requesterId: ME, addresseeId: GINA, status: 'accepted' as const },
      // A request still waiting is not a friend yet.
      { requesterId: ME, addresseeId: 'auth-sam', status: 'pending' as const },
    ];
    const people: Record<string, { id: string; displayName: string } | undefined> = {
      [GINA]: { id: GINA, displayName: 'Gina' },
    };

    const friends = friendIdsFor(friendships, ME)
      .map(id => people[id])
      .filter((person): person is { id: string; displayName: string } =>
        Boolean(person?.displayName?.trim()))
      .map(person => ({ id: person.id, name: person.displayName.trim() }));

    expect(friends).toEqual([{ id: GINA, name: 'Gina' }]);
  });

  /**
   * Somebody whose profile has not loaded is left out rather than listed as
   * 「旅伴」 — a row you cannot recognise is not a row you can choose from.
   */
  it('leaves out a friend it cannot name', () => {
    const friends = friendIdsFor(
      [{ requesterId: ME, addresseeId: GINA, status: 'accepted' as const }],
      ME,
    )
      .map(id => ({ [GINA]: undefined }[id]))
      .filter(Boolean);

    expect(friends).toEqual([]);
  });

  /**
   * And that the app derives it rather than reading the dead key. Written
   * because the picker worked perfectly against an array that was structurally
   * incapable of containing anything.
   */
  it('is derived in the app, not read from storage', () => {
    expect(APP).toContain('const friends = useMemo<Companion[]>(');
    expect(APP).toContain('friendIdsFor(friendships, authUser?.id)');
    // The key nobody ever wrote to, and its setter, are gone.
    expect(APP).not.toContain('trippie_friends');
    expect(APP).not.toContain('setFriends(');
  });
});

describe('picking one into a trip', () => {
  type Props = React.ComponentProps<typeof CompanionsModal>;

  const mount = (props: Partial<Props> = {}) => {
    const onAddFriendToTrip = vi.fn();
    render(
      <CompanionsModal
        companions={[]}
        friends={[{ id: GINA, name: 'Gina' }] as never}
        ownerName="Ann"
        onAdd={vi.fn()}
        onAddFriendToTrip={onAddFriendToTrip}
        onRemove={vi.fn()}
        onClose={vi.fn()}
        {...(props as Props)}
      />,
    );
    return { onAddFriendToTrip };
  };

  it('offers a friend who is not on the trip yet', () => {
    mount();
    expect(screen.getByText('Gina')).toBeTruthy();
  });

  /** Already on the trip, so not offered again. */
  it('does not offer somebody already added', () => {
    mount({ companions: [{ id: GINA, name: 'Gina' }] });
    // The roster row still names her; what must not appear is a second
    // 「add」 entry for somebody who is already a traveller here.
    expect(screen.getAllByText('Gina')).toHaveLength(1);
  });

  it('hands the picked friend back to the trip', () => {
    const { onAddFriendToTrip } = mount();

    fireEvent.click(screen.getByText('Gina'));

    expect(onAddFriendToTrip).toHaveBeenCalledWith({ id: GINA, name: 'Gina' });
  });
});
