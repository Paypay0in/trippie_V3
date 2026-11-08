/**
 * @vitest-environment jsdom
 *
 * 「要放在右上角 我跟你說了」.
 *
 * I put the 旅途安心 shield inside the header's `hidden ... sm:flex` group —
 * the one holding edit / destination / travellers / share, which is hidden on
 * phones because five 44px targets and a title overlap at 320px. That reasoning
 * is real, and it was the wrong reasoning to apply here twice over:
 *
 *   - on a phone the row holds the back arrow and the wordmark only, so ONE
 *     more target is not the five that overlapped;
 *   - and the whole point of this screen is to be found by somebody in trouble,
 *     on the device they are holding, which is a phone.
 *
 * So the shield is visible at every width. The other four stay exactly as they
 * were: this ticket does not reopen that layout, it just stops hiding the one
 * control that must never be two taps deep.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TripWorkspaceShell from '../components/TripWorkspaceShell';
import i18n from '../i18n/config';

afterEach(cleanup);

const shell = (props: Record<string, unknown> = {}) => render(
  <TripWorkspaceShell
    tripName="新莊"
    dateRange="2026/11/02 - 12/20"
    destination="新莊"
    currentPhase="during"
    currentSection="overview"
    companionCount={0}
    onBack={() => {}}
    onEdit={() => {}}
    onDestination={() => {}}
    onTravelers={() => {}}
    onShare={() => {}}
    onSectionChange={() => {}}
    onQuickAdd={() => {}}
    onOpenSos={() => {}}
    {...props}
  >
    <div />
  </TripWorkspaceShell>,
);

/** The ancestor chain, so a `hidden sm:flex` wrapper cannot hide in it. */
const hiddenOnPhone = (element: Element | null): boolean => {
  for (let node = element; node; node = node.parentElement) {
    if (node.className && typeof node.className === 'string'
      && node.className.split(/\s+/).includes('hidden')) return true;
  }
  return false;
};

describe('the 旅途安心 entry in the trip header', () => {
  it('is on screen at phone width, not only from sm: upwards', () => {
    shell();
    const entry = screen.getByLabelText(i18n.t('workspace.sosAria'));
    expect(hiddenOnPhone(entry)).toBe(false);
  });

  it('names itself, because a bare shield is a guess', () => {
    // 「我覺得你只放盾牌不夠 要放字」. The label lives inside the button, not
    // beside it, so no layout change can leave the icon without its name.
    shell();
    const entry = screen.getByLabelText(i18n.t('workspace.sosAria'));
    expect(entry.textContent).toContain(i18n.t('sos.entry'));
    expect(hiddenOnPhone(entry.querySelector('span'))).toBe(false);
  });

  it('leaves the four crowded actions hidden on phones, as they were', () => {
    // Not a licence to reopen the header. Those four overlapped the title at
    // 320px and are reachable from 「更多」; only the emergency one moves.
    shell();
    expect(hiddenOnPhone(screen.getByLabelText(i18n.t('app.trip.edit')))).toBe(true);
    expect(hiddenOnPhone(screen.getByLabelText(i18n.t('trips.shareTrip')))).toBe(true);
  });

  it('still lists it first in 「更多」, so there are two ways in', () => {
    shell();
    fireEvent.click(screen.getByText(i18n.t('common.more')).closest('button')!);
    expect(screen.getAllByText(i18n.t('sos.entry')).length).toBeGreaterThan(0);
  });

  it('renders no entry at all when the screen is not wired up', () => {
    shell({ onOpenSos: undefined });
    expect(screen.queryByLabelText(i18n.t('workspace.sosAria'))).toBeNull();
  });
});
