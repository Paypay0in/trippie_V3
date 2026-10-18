/**
 * @vitest-environment jsdom
 *
 * 「這個我就希望像收藏卡片一樣 有帶入圖片 店名 一些旅行筆記讓用戶可以有想法 不然只列
 * 餐廳名稱怎麼知道」.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SuggestedPlaceCards from '../components/SuggestedPlaceCards';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('suggested places, as cards', () => {
  it('shows the photo, the name and the notes kept about it', () => {
    render(<SuggestedPlaceCards places={[{
      id: 'a', placeName: 'KURAMAE CANNELE',
      photoUrl: 'https://example.com/cannele.jpg',
      notes: ['可露麗專門店', '下午容易排隊'],
      detourLabel: '少繞 1.2 公里',
    }]} />);

    expect(screen.getByText('KURAMAE CANNELE')).toBeTruthy();
    expect(screen.getByText('可露麗專門店')).toBeTruthy();
    expect(screen.getByText('少繞 1.2 公里')).toBeTruthy();
    expect(document.querySelector('img[src="https://example.com/cannele.jpg"]')).toBeTruthy();
  });

  /*
    A Google result has no note because nobody has saved it, which is a fact
    about the collection rather than about the restaurant. Said, not hidden.
  */
  it('says why a place has no notes rather than leaving a gap', () => {
    render(<SuggestedPlaceCards places={[{ id: 'b', placeName: '一蘭 淺草店', rating: 4.3 }]} />);

    expect(screen.getByText('還不是你的收藏，沒有筆記')).toBeTruthy();
    expect(screen.getByText('★ 4.3')).toBeTruthy();
  });

  /* 「結 Yuwaeru 本店」 says nothing; 「日式餐廳」 is what somebody needs. */
  it('says what kind of place it is', () => {
    render(<SuggestedPlaceCards places={[{ id: 'k', placeName: '一蘭 淺草店', kind: '拉麵店' }]} />);

    expect(screen.getByText('拉麵店')).toBeTruthy();
  });

  /* A place with no picture of its own gets one fetched, once. */
  it('fetches a photo for a place that did not bring one', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ photo: { imageUrl: 'https://example.com/ichiran.jpg' } }),
    }));
    vi.stubGlobal('fetch', fetchMock as never);

    render(<SuggestedPlaceCards places={[{ id: 'c', placeId: 'ChIJ-ichiran', placeName: '一蘭 淺草店' }]} />);

    await waitFor(() => expect(
      document.querySelector('img[src="https://example.com/ichiran.jpg"]'),
    ).toBeTruthy());
  });

  /* Nothing is asked for a place that already has its picture. */
  it('asks for nothing when the photo came with the place', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as never);

    render(<SuggestedPlaceCards places={[{
      id: 'd', placeId: 'ChIJ-x', placeName: 'Ramen Kai', photoUrl: 'https://example.com/ramen.jpg',
    }]} />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hands the chosen place back', async () => {
    const onPick = vi.fn();
    render(<SuggestedPlaceCards onPick={onPick} places={[{ id: 'e', placeName: '紅鶴' }]} />);

    await userEvent.setup().click(screen.getByTestId('suggested-place-e'));

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ placeName: '紅鶴' }));
  });

  it('renders nothing when there is nothing to suggest', () => {
    render(<SuggestedPlaceCards places={[]} />);

    expect(screen.queryByTestId('suggested-place-cards')).toBeNull();
  });
});
