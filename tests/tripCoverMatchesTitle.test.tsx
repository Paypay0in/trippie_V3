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

/*
   What the cover asked for, by place id.

   The original defect was a stock search keyed on a name the header was not
   showing. 「我覺得是台北車站還是太怪了」 ended the search entirely: the cover
   now asks for the photo Google holds against the destination's placeId, so
   there is no name to disagree with. The title assertions below survive
   unchanged — the words on the picture are still the words the traveller
   reads, which is the half of the original report that still applies.
*/
const asked: string[] = [];
vi.mock('../services/placePhotoService', () => ({
  fetchPlacePhoto: vi.fn(async (placeId: string) => { asked.push(placeId); return null; }),
}));
vi.mock('../services/destinationImageService', () => ({
  fetchDestinationImage: vi.fn(async () => {
    throw new Error('the cover must never search a stock library by name');
  }),
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
  it('asks for the photo held against the resolved place', async () => {
    open({ tripName: '日本沖繩', destination: '日本', destinationPlaceId: 'place-okinawa' });
    await waitFor(() => expect(asked).toEqual(['place-okinawa']));
  });

  /*
    The original report, now unreachable rather than guarded: the name said
    Okinawa and the search said Japan. Neither name reaches the request.
  */
  it('never asks for either name', async () => {
    open({ tripName: '日本沖繩', destination: '日本', destinationPlaceId: 'place-okinawa' });
    await waitFor(() => expect(asked.length).toBe(1));
    expect(asked).not.toContain('日本沖繩');
    expect(asked).not.toContain('日本');
  });

  /*
    An unresolved trip gets the gradient. The cover has always had one
    underneath, and a gradient states nothing that can be wrong.
  */
  it('asks for nothing when the trip resolved to no place', async () => {
    open({ tripName: '韓國 釜山', destination: '釜山' });
    await waitFor(() => expect(asked).toEqual([]));
  });

  /* Unchanged: the words on the cover are still the words the header shows. */
  it('shows the title the traveller is reading', async () => {
    open({ tripName: '日本沖繩', destination: '日本', destinationPlaceId: 'place-okinawa' });
    expect(screen.getByText('日本沖繩')).toBeTruthy();
  });
});
