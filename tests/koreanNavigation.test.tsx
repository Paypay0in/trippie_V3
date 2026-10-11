/**
 * @vitest-environment jsdom
 *
 * 「South Korea → NAVER Map; preserve existing behavior outside South Korea」.
 *
 * The second half is the one that breaks quietly, so most of this file pins
 * the Japanese and Taiwanese links character by character.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import SavedPlaceCard from '../components/SavedPlaceCard';
import { MappablePlace, placeDirectionsUrl, placeMapsUrl } from '../services/placeLinks';

afterEach(cleanup);

const seongsu: MappablePlace = {
  placeName: '성수동',
  countryCode: 'KR',
  country: 'South Korea',
  coordinates: { latitude: 37.5447, longitude: 127.0557 },
};

const open = (place: MappablePlace) =>
  render(<SavedPlaceCard place={place} notes={[]} onClose={vi.fn()} />);

describe('a place in Korea', () => {
  it('offers NAVER as the main action', () => {
    open(seongsu);
    const link = screen.getByTestId('saved-place-naver-link');
    expect(link.getAttribute('href')).toContain('https://app.map.naver.com/launchApp/place?');
    expect(link.getAttribute('href')).toContain('lat=37.5447');
  });

  /** A decision with a right answer should not be presented as a choice. */
  it('keeps the other maps behind 其他導航方式', () => {
    open(seongsu);
    expect(screen.getByTestId('saved-place-other-providers')).toBeTruthy();
  });

  it('still lets the traveller pick Google', () => {
    open(seongsu);
    fireEvent.click(screen.getByTestId('saved-place-other-providers'));
    expect(screen.getByTestId('saved-place-maps-link').getAttribute('href'))
      .toBe(placeMapsUrl(seongsu));
  });

  /**
   * The A4 result as a rule: the same link with a wrong parameter opened
   * NAVER and sat on the traveller's own location with no pin and no error.
   * Without coordinates there is no point to send, so there is no link.
   */
  it('does not offer NAVER for a Korean place with no coordinates', () => {
    open({ placeName: '성수동', countryCode: 'KR' });
    expect(screen.queryByTestId('saved-place-naver-link')).toBeNull();
    expect(screen.getByTestId('saved-place-maps-link')).toBeTruthy();
  });

  /** Places saved before the resolver returned a code have only a name. */
  it('recognises a place saved as 韓國, before country codes existed', () => {
    open({ ...seongsu, countryCode: undefined, country: '韓國' });
    expect(screen.getByTestId('saved-place-naver-link')).toBeTruthy();
  });
});

describe('everywhere else, unchanged', () => {
  const tokyo: MappablePlace = {
    placeName: '淺草寺', countryCode: 'JP', country: 'Japan',
    coordinates: { latitude: 35.7148, longitude: 139.7967 },
  };
  const taipei: MappablePlace = {
    placeName: '鼎泰豐', countryCode: 'TW', country: 'Taiwan',
    coordinates: { latitude: 25.0330, longitude: 121.5654 },
  };

  it('shows no NAVER button in Japan or Taiwan', () => {
    open(tokyo);
    expect(screen.queryByTestId('saved-place-naver-link')).toBeNull();
    expect(screen.queryByTestId('saved-place-other-providers')).toBeNull();
    cleanup();
    open(taipei);
    expect(screen.queryByTestId('saved-place-naver-link')).toBeNull();
  });

  /** Character by character: this is the requirement, not a nicety. */
  it('builds the same Google links it always did', () => {
    for (const place of [tokyo, taipei]) {
      cleanup();
      open(place);
      expect(screen.getByTestId('saved-place-maps-link').getAttribute('href'))
        .toBe(placeMapsUrl(place));
      expect(screen.getByTestId('saved-place-directions-link').getAttribute('href'))
        .toBe(placeDirectionsUrl(place));
    }
  });

  it('leaves a place with no country alone', () => {
    open({ placeName: 'Somewhere', coordinates: { latitude: 1, longitude: 2 } });
    expect(screen.queryByTestId('saved-place-naver-link')).toBeNull();
    expect(screen.getByTestId('saved-place-maps-link')).toBeTruthy();
  });
});
