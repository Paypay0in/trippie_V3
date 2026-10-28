/**
 * @vitest-environment jsdom
 *
 * 「釜山的旅冊怎麼都不見了」 — 「不見了」.
 *
 * Not renamed, not archived. The remaining explanation was the one rule that
 * never says anything: a trip deleted on this device is never re-added from
 * the cloud, by design, because 「我已全部都刪掉過了 但又一直出現」. Correct, and
 * silent — so a recoverable trip and a lost one looked identical.
 *
 * The banner states the refusal. It does not undo it: the trip comes back
 * because somebody pressed 取回, which is the same standard the ticket list
 * and the 已訪 chip are held to.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TravelHome from '../components/TravelHome';
import { RecoverableTrip } from '../services/recoverableTrips';
import i18n from '../i18n/config';

afterEach(cleanup);

const busan: RecoverableTrip = {
  id: 'busan', name: '釜山', startDate: '2026-10-02', endDate: '2026-10-06',
};

const home = (props: Record<string, unknown> = {}) => render(
  <TravelHome
    activeSection="trips"
    onSectionChange={vi.fn()}
    onPlus={vi.fn()}
    drafts={[]}
    tripHistory={[]}
    activeDraftId={null}
    onContinueDraft={vi.fn()}
    onContinueTrip={vi.fn()}
    onCreateNew={vi.fn()}
    onOpenPlanner={vi.fn()}
    savedTravelInspirations={[]}
    communityPosts={[]}
    onOpenSavedDestination={vi.fn()}
    authStatus="anonymous"
    {...props}
  />,
);

describe('雲端還留著這些旅程', () => {
  it('names the trip and the dates the cloud has for it', () => {
    home({ recoverable: [busan] });

    const row = screen.getByTestId('recoverable-trip-busan');
    expect(row.textContent).toContain('釜山');
    expect(row.textContent).toContain('2026-10-02 – 2026-10-06');
  });

  /* Why it is not on the shelf already, in the traveller's own terms. */
  it('says this device deleted it, not that it was lost', () => {
    home({ recoverable: [busan] });

    expect(screen.getByTestId('recoverable-trips').textContent).toContain('這台裝置刪過它們');
  });

  it('asks before bringing it back', () => {
    const onRecoverTrip = vi.fn();
    home({ recoverable: [busan], onRecoverTrip });

    fireEvent.click(screen.getByTestId('recoverable-trip-restore-busan'));

    expect(onRecoverTrip).toHaveBeenCalledWith(busan);
  });

  /*
    Nothing to recover is no banner at all. A permanent notice about trips
    that do not exist is the kind of thing a traveller learns to scroll past,
    which is how the real one gets missed.
  */
  it('is absent when nothing is being refused', () => {
    home();

    expect(screen.queryByTestId('recoverable-trips')).toBeNull();
  });

  /*
    A trip the server never named still needs a row somebody can press.

    The label used to be written 未命名的旅程 here and 未命名旅程 three screens
    away — one idea with two spellings, which is what moving both into
    `home.untitledTrip` collapsed. The behaviour under test is unchanged: an
    unnamed trip gets a label instead of a blank.
  */
  it('labels an unnamed trip rather than drawing a blank', () => {
    home({ recoverable: [{ ...busan, name: '' }] });

    expect(screen.getByTestId('recoverable-trip-busan').textContent).toContain(
      i18n.t('home.untitledTrip'),
    );
  });
});
