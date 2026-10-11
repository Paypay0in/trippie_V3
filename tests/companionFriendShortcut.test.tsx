/**
 * @vitest-environment jsdom
 *
 * 「gina已經是跟我有共同建立旅行本的人 是不是可以直接新增成朋友」.
 *
 * The panel half of it. These assert the two things that make this a shortcut
 * rather than a second email field: it comes before the address, and one tap
 * is a request — not a friendship.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import FriendsPanel from '../components/FriendsPanel';
import { CompanionSuggestion } from '../services/companionSuggestions';

afterEach(cleanup);

const gina: CompanionSuggestion = {
  userId: 'gina', name: 'Gina', tripNames: ['日本東京'], tripCount: 1,
};

const renderPanel = (over: Partial<React.ComponentProps<typeof FriendsPanel>> = {}) => {
  const onRequest = vi.fn();
  render(
    <FriendsPanel
      myEmail="north@example.com"
      friends={[]}
      pending={[]}
      suggestions={[gina]}
      onLookup={async () => ({ person: null })}
      onRequest={onRequest}
      onAccept={() => {}}
      onRemove={() => {}}
      {...over}
    />,
  );
  return { onRequest };
};

describe('adding a friend you have already travelled with', () => {
  it('offers the companion without asking for an email', () => {
    renderPanel();
    expect(screen.getByTestId('companion-gina')).toBeTruthy();
    expect(screen.getByText('一起去過 日本東京')).toBeTruthy();
  });

  /**
   * Before the address field. Somebody who shares a trip has their answer
   * here, and typing the email of a person you planned a trip with is a fact
   * you have no reason to know.
   */
  it('comes before the email field', () => {
    renderPanel();
    const suggestions = screen.getByTestId('companion-suggestions');
    const email = screen.getByTestId('friend-email');
    expect(suggestions.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it('sends a request on one tap', () => {
    const { onRequest } = renderPanel();
    fireEvent.click(screen.getByTestId('companion-invite-gina'));
    expect(onRequest).toHaveBeenCalledWith({ id: 'gina', displayName: 'Gina' });
  });

  /**
   * A shared trip is one itinerary two people agreed to; friendship opens
   * every 好友可見 post, including ones already written. So the screen must not
   * claim it is done — the other person still accepts.
   */
  it('says the other person has to accept, rather than claiming a friendship', () => {
    renderPanel();
    expect(screen.getByText('對方接受後才會成為好友。')).toBeTruthy();
  });

  /** A tile still reading 邀請 after a tap reads as a tap that did nothing. */
  it('shows the request was sent, and will not send it twice', () => {
    const { onRequest } = renderPanel();
    const button = screen.getByTestId('companion-invite-gina');
    fireEvent.click(button);
    expect(screen.getByText('已邀請')).toBeTruthy();
    fireEvent.click(button);
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('shows nothing when every companion is already a friend', () => {
    renderPanel({ suggestions: [] });
    expect(screen.queryByTestId('companion-suggestions')).toBeNull();
    expect(screen.getByTestId('friend-email')).toBeTruthy();
  });
});
