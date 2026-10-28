/**
 * @vitest-environment jsdom
 *
 * One decision about the bottom bar, honoured by every bottom bar.
 *
 * 「我覺得社群現在可以先隱藏」 took 社群 out of `AppBottomNav`, and 服務 had already
 * gone for its own reason. But four more bars were written out by hand inside
 * the 社群, 服務, 地圖 and 積分 branches of `App.tsx`, and all four kept offering
 * both tabs. Reaching 社群 through 探索靈感 put a traveller in front of exactly
 * the tabs that were supposed to be put away.
 *
 * These tests hold the two bars to the same answer. They are written against
 * the omission rather than the markup, so restoring a tab means deleting the
 * matching assertion deliberately — not discovering later that one bar still
 * disagrees with the other.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ExploreBottomNav from '../components/ExploreBottomNav';
import AppBottomNav from '../components/AppBottomNav';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

describe('底部導覽列：隱藏的分頁兩邊一致', () => {
  it('探索列不提供社群，和主導覽列一樣', () => {
    render(<ExploreBottomNav active="community" onChange={vi.fn()} />);
    expect(screen.queryByText('社群')).toBeNull();
  });

  it('探索列不提供服務，和主導覽列一樣', () => {
    render(<ExploreBottomNav active="marketplace" onChange={vi.fn()} />);
    expect(screen.queryByText('服務')).toBeNull();
  });

  it('主導覽列也沒有這兩個分頁 —— 這是上面兩條比對的那一份答案', () => {
    render(<AppBottomNav active="trips" onChange={vi.fn()} onPlus={vi.fn()} />);
    expect(screen.queryByText('社群')).toBeNull();
    expect(screen.queryByText('服務')).toBeNull();
  });

  /*
    地圖 and 積分 are reachable only from this bar. Dropping them along with the
    hidden tabs would have quietly removed two working screens — PointsDashboard
    and MapExplorer — from the app, which is a product decision and not a
    cleanup. They stay, and this says so.
  */
  it('地圖與積分仍在，它們只能從這條列進入', () => {
    render(<ExploreBottomNav active="bookshelf" onChange={vi.fn()} />);
    expect(screen.getByText('地圖')).toBeTruthy();
    expect(screen.getByText('積分')).toBeTruthy();
    expect(screen.getByText('書架')).toBeTruthy();
  });

  it('在沒有按鈕的分頁上也不會標錯位置', () => {
    render(<ExploreBottomNav active="community" onChange={vi.fn()} />);
    // 書架 is not where the traveller is, so it must not be the highlighted tab.
    expect(screen.getByText('書架').parentElement?.className).toContain('text-gray-400');
  });

  it('點擊會回報被點的那一個', () => {
    const onChange = vi.fn();
    render(<ExploreBottomNav active="community" onChange={onChange} />);
    screen.getByText('地圖').parentElement?.click();
    expect(onChange).toHaveBeenCalledWith('map');
  });
});
