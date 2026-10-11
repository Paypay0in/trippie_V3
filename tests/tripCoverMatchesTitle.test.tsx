/**
 * @vitest-environment jsdom
 *
 * 「這不是沖繩」 — a trip titled 日本沖繩 wearing the torii gates of 伏見稲荷,
 * which are in Kyoto.
 *
 * The header has always printed `tripName || destination` and searched
 * `destination` alone: two fields nothing keeps in agreement, so the picture
 * was answering a question the traveller could not see. Checked against the
 * live endpoint, 「日本」 returns that exact photograph — credited to the same
 * photographer on the screenshot — while 「日本沖繩」 returns Okinawa.
 *
 * The picture is decorative and no test can confirm the beach is the right
 * beach. What it can confirm is that the picture and the title ask the same
 * question.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const asked: string[] = [];
vi.mock('../services/destinationImageService', () => ({
  fetchDestinationImage: vi.fn(async (query: string) => { asked.push(query); return null; }),
}));

import TripWorkspaceShell from '../components/TripWorkspaceShell';

afterEach(() => { cleanup(); asked.length = 0; });

const open = (props: Record<string, unknown>) =>
  render(
    <TripWorkspaceShell
      tripName=""
      dateRange=""
      destination=""
      currentPhase="pre"
      currentSection="overview"
      companionCount={0}
      onBack={vi.fn()}
      onEdit={vi.fn()}
      onDestination={vi.fn()}
      onTravelers={vi.fn()}
      onShare={vi.fn()}
      onSectionChange={vi.fn()}
      onQuickAdd={vi.fn()}
      {...props}
    >
      <div />
    </TripWorkspaceShell>,
  );

describe('the cover photo', () => {
  it('searches for the title the traveller is reading', async () => {
    open({ tripName: '日本沖繩', destination: '日本' });
    await waitFor(() => expect(asked).toEqual(['日本沖繩']));
  });

  /** The exact report: the name said Okinawa, the search said Japan. */
  it('never searches a destination the header is not showing', async () => {
    open({ tripName: '日本沖繩', destination: '日本' });
    await waitFor(() => expect(asked.length).toBe(1));
    expect(asked).not.toContain('日本');
  });

  it('falls back to the destination when the trip has no name', async () => {
    open({ tripName: '', destination: '韓國 釜山' });
    await waitFor(() => expect(asked).toEqual(['韓國 釜山']));
  });

  it('asks for nothing when there is nothing to ask', async () => {
    open({ tripName: '', destination: '   ' });
    await waitFor(() => expect(asked).toEqual([]));
  });

  it('shows the same words it searched with', async () => {
    open({ tripName: '日本沖繩', destination: '日本' });
    expect(screen.getByText('日本沖繩')).toBeTruthy();
  });
});
