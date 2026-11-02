/**
 * @vitest-environment jsdom
 *
 * What the passport row says about an expiry date, on screen.
 *
 * The rule under test is the one Founder V-9-SCOPE A wrote: state the date,
 * never issue a verdict. A card that says 「有效」 is making a claim about a
 * border whose rule this app does not hold, and a traveller believes a green
 * tick right up to the counter.
 *
 * The second thing pinned here is that the row cannot be half-wired. The same
 * computed state reaches the setup screen and the preparation page, because a
 * date compared in two places is a date with two answers.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import CreateEditTripScreen from '../components/CreateEditTripScreen';
import { passportExpiryState } from '../services/passportExpiryState';

vi.mock('../services/destinationImageService', () => ({
  fetchDestinationImage: vi.fn(async () => null),
}));

const show = (props: Record<string, unknown> = {}) =>
  render(
    <CreateEditTripScreen
      mode="edit"
      initialDestination="東京"
      initialStartDate="2027-03-01"
      initialEndDate="2027-03-10"
      initialCompanions={[]}
      friends={[]}
      residenceCountryCode="TW"
      initialTripScope="international"
      passportLabel="台灣護照"
      onBack={vi.fn()}
      onSubmit={vi.fn()}
      {...props}
    />,
  );

const expiryLine = () => screen.getByTestId('trip-passport-expiry').textContent || '';

afterEach(cleanup);

describe('the passport expiry row', () => {
  it('invites the traveller to look when nobody has entered a date', () => {
    show();
    expect(expiryLine()).toContain('查看有效期限');
  });

  it('never claims validity for an absent date', () => {
    show();
    expect(screen.queryByText('有效')).toBeNull();
  });

  it('says a past date has expired', () => {
    show({ passportExpiry: '2026-01-01', passportExpiryState: 'expired' });
    expect(expiryLine()).toContain('已於 2026-01-01 到期');
  });

  it('asks the traveller to check the destination when the date is tight', () => {
    show({ passportExpiry: '2027-05-01', passportExpiryState: 'tight' });
    expect(expiryLine()).toContain('請確認目的地的規定');
  });

  it('states a comfortable date plainly, with no badge and no verdict', () => {
    show({ passportExpiry: '2030-05-20', passportExpiryState: 'ok' });
    expect(expiryLine()).toContain('2030-05-20 到期');
    expect(screen.queryByText('有效')).toBeNull();
  });

  /*
    The only state that could ever read as a verdict is `ok`, so it is the one
    worth asserting character by character. 「到期」 is a fact about the
    document; 「有效」 would be a claim about a border.
  */
  it('says nothing that could be read as entry eligibility', () => {
    show({ passportExpiry: '2030-05-20', passportExpiryState: 'ok' });
    const line = expiryLine();
    for (const forbidden of ['可入境', '符合', '沒問題', 'eligible', 'valid', 'Valid']) {
      expect(line).not.toContain(forbidden);
    }
  });

  it('has exactly one home for the date comparison, wired into every surface', async () => {
    const app = await import('node:fs').then(fs => fs.readFileSync('App.tsx', 'utf8'));
    /*
      Three call sites pass `passportLabel` — the setup screen and both entries
      into the preparation page. Every one of them must receive the computed
      state, or the row shows the date down one route and not the other.
    */
    const labelSites = app.match(/passportLabel=\{resolvedPassportLabel\}/g) || [];
    const stateSites = app.match(/passportExpiryState=\{resolvedPassportExpiryState\}/g) || [];
    expect(labelSites.length).toBeGreaterThan(0);
    expect(stateSites.length).toBe(labelSites.length);

    /* And the comparison itself exists in one module, not inline in a screen. */
    for (const file of ['components/CreateEditTripScreen.tsx', 'components/TripPlanOverview.tsx']) {
      const source = await import('node:fs').then(fs => fs.readFileSync(file, 'utf8'));
      expect(source).not.toMatch(/QUIET_MONTHS|setUTCMonth/);
    }
  });

  it('agrees with the module about what each date means', () => {
    const today = '2026-10-31';
    expect(passportExpiryState({ expiresOn: '2026-01-01', tripEndDate: '2027-03-10', today })).toBe('expired');
    expect(passportExpiryState({ expiresOn: '2027-05-01', tripEndDate: '2027-03-10', today })).toBe('tight');
    expect(passportExpiryState({ expiresOn: '2030-05-20', tripEndDate: '2027-03-10', today })).toBe('ok');
  });
});
