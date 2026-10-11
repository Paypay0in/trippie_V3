/**
 * @vitest-environment jsdom
 *
 * 「這個要以國家城市區分 不要全部攤開」.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import MyPostsPanel from '../components/MyPostsPanel';
import { SavedInspiration } from '../types';

afterEach(cleanup);

const place = (id: string, over: Partial<SavedInspiration> = {}): SavedInspiration => ({
  id, title: id, placeName: id, country: '韓國', city: '釜山', ...over,
});

const open = (saved: SavedInspiration[]) => {
  render(
    <MyPostsPanel
      posts={[]}
      savedInspirations={saved}
      onOpenPost={() => {}}
      onCreatePost={() => {}}
      onDeletePost={() => {}}
      onToggleVisibility={() => {}}
    />,
  );
  fireEvent.click(screen.getByText('我的收藏'));
};

describe('我的收藏, grouped by place', () => {
  it('shows a country once instead of one row per saved place', () => {
    open([
      place('海雲台'), place('甘川洞'),
      place('淺草寺', { country: '日本', city: '東京' }),
    ]);
    expect(screen.getByTestId('saved-country-韓國')).toBeTruthy();
    expect(screen.getByTestId('saved-country-日本')).toBeTruthy();
    expect(screen.getByText('1 個城市・2 個地點')).toBeTruthy();
  });

  /** 「不要全部攤開」 — the places are behind the country, not beside it. */
  it('does not spread the places out on arrival', () => {
    open([place('海雲台'), place('淺草寺', { country: '日本', city: '東京' })]);
    expect(screen.queryByText('海雲台')).toBeNull();
    expect(screen.queryByText('淺草寺')).toBeNull();
  });

  it('opens a country when it is tapped', () => {
    open([place('海雲台'), place('淺草寺', { country: '日本', city: '東京' })]);
    fireEvent.click(screen.getByTestId('saved-toggle-韓國'));
    expect(screen.getByText('海雲台')).toBeTruthy();
    expect(screen.getByText('釜山')).toBeTruthy();
    // The other country stays shut; opening one is not opening all.
    expect(screen.queryByText('淺草寺')).toBeNull();
  });

  it('closes again, so the list can be put back', () => {
    open([place('海雲台'), place('淺草寺', { country: '日本', city: '東京' })]);
    fireEvent.click(screen.getByTestId('saved-toggle-韓國'));
    fireEvent.click(screen.getByTestId('saved-toggle-韓國'));
    expect(screen.queryByText('海雲台')).toBeNull();
  });

  /**
   * One collapsed row and a question is not organised, it is hidden — and it
   * costs a tap to see what was already on screen before this change.
   */
  it('leaves a single country open', () => {
    open([place('海雲台'), place('甘川洞')]);
    expect(screen.getByText('海雲台')).toBeTruthy();
  });

  /** Saved, so it must appear somewhere; 其他 is somewhere, nowhere is not. */
  it('keeps a place that never said where it was', () => {
    open([place('某個地方', { country: undefined, city: undefined })]);
    expect(screen.getByText('其他')).toBeTruthy();
    expect(screen.getByText('某個地方')).toBeTruthy();
  });

  it('still says so when nothing is saved', () => {
    open([]);
    expect(screen.getByText('還沒有收藏任何旅行靈感')).toBeTruthy();
    expect(screen.queryByTestId('saved-groups')).toBeNull();
  });
});
