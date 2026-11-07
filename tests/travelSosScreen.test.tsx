/**
 * @vitest-environment jsdom
 *
 * 旅途安心 / Travel SOS — T1's screen.
 *
 * The assertions that matter here are absences. A screen that renders a number
 * nobody verified still looks finished, still passes a snapshot, and fails only
 * when somebody dials it. So the tests below check that NO dialable element
 * exists wherever the dataset has not earned one.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TravelSosScreen from '../components/TravelSosScreen';
import { EMERGENCY_NUMBERS, EmergencyNumber } from '../services/emergencyNumbers';
import i18n from '../i18n/config';

afterEach(() => { cleanup(); EMERGENCY_NUMBERS.length = 0; });

const screenOf = (props: Record<string, unknown> = {}) => render(
  <TravelSosScreen
    country="日本"
    city="東京"
    onBack={() => {}}
    onChangePlace={() => {}}
    {...props}
  />,
);

const published = (overrides: Partial<EmergencyNumber> = {}): EmergencyNumber => ({
  country: '日本',
  countryCode: 'JP',
  purpose: 'police',
  number: '110',
  issuingBody: 'Example Authority',
  sourceUrl: 'https://example.go.jp/',
  sourceTitle: 'Example',
  checkedAt: '2026-11-08',
  status: 'published',
  ...overrides,
});

describe('the emergency numbers block', () => {
  it('shows nothing dialable while the dataset holds nothing', () => {
    // The shipping state of T1: sourcing is behind its own grant, so no row
    // has been verified and the screen must say so rather than show a gap.
    const { container } = screenOf();
    expect(screen.getByTestId('sos-numbers-unavailable')).toBeTruthy();
    expect(container.querySelectorAll('a[href^="tel:"]')).toHaveLength(0);
  });

  it('renders a published number as a tel: link', () => {
    EMERGENCY_NUMBERS.push(published());
    const { container } = screenOf();
    const link = container.querySelector('a[href^="tel:"]');
    expect(link?.getAttribute('href')).toBe('tel:110');
  });

  it('renders NOTHING dialable for a row that was never verified', () => {
    /*
      The failure that reaches a person. An unverified row rendering as a
      button is indistinguishable from a verified one at a glance, which is
      exactly why the assertion is on the absence of the element rather than
      on any text beside it.
    */
    EMERGENCY_NUMBERS.push(published({ status: 'unverified' }));
    const { container } = screenOf();
    expect(container.querySelectorAll('a[href^="tel:"]')).toHaveLength(0);
    expect(screen.getByTestId('sos-numbers-unavailable')).toBeTruthy();
  });

  it('renders NOTHING dialable when two sources disagreed', () => {
    EMERGENCY_NUMBERS.push(published({ status: 'conflicted' }));
    const { container } = screenOf();
    expect(container.querySelectorAll('a[href^="tel:"]')).toHaveLength(0);
  });

  it('never presents the international form as the local one', () => {
    EMERGENCY_NUMBERS.push(published({ internationalNumber: '+81-3-3501-0110' }));
    const { container } = screenOf();
    // The dialled link stays the local code; the international form is text.
    expect(container.querySelector('a[href^="tel:"]')?.getAttribute('href')).toBe('tel:110');
    expect(container.querySelectorAll('a[href="tel:+81-3-3501-0110"]')).toHaveLength(0);
  });
});

describe('which place the numbers are for', () => {
  it('states the trip country and city', () => {
    screenOf();
    expect(screen.getByTestId('sos-place').textContent).toContain('東京');
  });

  it('claims no country when the trip has none', () => {
    /*
      A trip can still carry no country — the on-open backfill fills it when
      the lookup answers, and a lookup that answers nothing leaves it blank.
      An emergency screen must never fall back to a guess.
    */
    screenOf({ country: undefined, city: undefined });
    const place = screen.getByTestId('sos-place').textContent || '';
    expect(place).toBe(i18n.t('sos.placeUnknown'));
    expect(place).not.toContain('日本');
  });

  it('always offers the manual override', () => {
    // Q1=A: the default follows the trip, and the traveller may always switch.
    const onChangePlace = vi.fn();
    screenOf({ onChangePlace });
    fireEvent.click(screen.getByTestId('sos-change-place'));
    expect(onChangePlace).toHaveBeenCalled();
  });
});

describe('the blocks T1 does not build', () => {
  it('lists them, and none of them is interactive', () => {
    /*
      「never mark a menu complete unless it works」 — the Board's own note on
      Q2=B. Listed so the approved scope is visible; inert so nothing promises
      a screen that does not exist.
    */
    screenOf();
    ['consulate', 'nearby', 'phrases', 'shareLocation', 'documents', 'offline'].forEach(key => {
      const row = screen.getByTestId(`sos-pending-${key}`);
      expect(row).toBeTruthy();
      expect(row.querySelectorAll('button, a')).toHaveLength(0);
    });
  });
});
