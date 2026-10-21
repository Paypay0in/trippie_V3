/**
 * @vitest-environment jsdom
 *
 * 「若我想加入對這個景點的筆記 怎麼做？」
 *
 * 我的備註 could be read on the card and written only from the collection
 * list's ⋯ menu, two screens away. The moment somebody wants to write a note
 * is the moment they are looking at the place.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SavedPlaceCard from '../components/SavedPlaceCard';
import { clearPlacePhotoCache } from '../services/placePhotoService';
import { clearPlaceReviewsCache } from '../services/placeReviewsService';

beforeEach(() => {
  clearPlacePhotoCache();
  clearPlaceReviewsCache();
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ photo: null, photos: [], reviews: [] }),
  })));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const place = {
  placeName: '待乳山聖天',
  placeId: 'ChIJ-matsuchi',
  formattedAddress: 'Taito City, Asakusa 7-chōme-4-1',
  city: '東京',
  country: '日本',
};

const open = (over: Record<string, unknown> = {}) => render(
  <SavedPlaceCard place={place} notes={[]} onClose={vi.fn()} {...over} />,
);

describe('writing a note on the card', () => {
  it('offers the box', () => {
    open({ onAddNote: vi.fn() });

    expect(screen.getByTestId('write-note').textContent).toContain('寫一則我的備註');
  });

  it('hands the note back', () => {
    const onAddNote = vi.fn();
    open({ onAddNote });

    fireEvent.click(screen.getByTestId('write-note'));
    fireEvent.change(screen.getByTestId('note-input'), { target: { value: ' 早上人少，很安靜 ' } });
    fireEvent.click(screen.getByTestId('save-note'));

    expect(onAddNote).toHaveBeenCalledWith('早上人少，很安靜');
  });

  /* An empty note is not a note. */
  it('will not keep an empty one', () => {
    open({ onAddNote: vi.fn() });

    fireEvent.click(screen.getByTestId('write-note'));

    expect((screen.getByTestId('save-note') as HTMLButtonElement).disabled).toBe(true);
  });

  /*
    A card that cannot save a note must not appear to take one — the same rule
    as every other control on this screen.
  */
  it('is not offered when the caller cannot save it', () => {
    open();

    expect(screen.queryByTestId('write-note')).toBeNull();
  });
});
