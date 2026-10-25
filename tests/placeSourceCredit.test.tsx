/**
 * @vitest-environment jsdom
 *
 * 「來自 Ann 的東京咖啡地圖・收藏於 2024/03/10」 — the visible end of
 * everything the attribution work was for.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import PlaceSourceCredit from '../components/PlaceSourceCredit';

afterEach(cleanup);

const at = '2026-03-10T08:00:00.000Z';

describe('誰推薦的', () => {
  it('names the creator, the collection and the day', () => {
    render(<PlaceSourceCredit credit={{ creatorName: 'Ann', collectionTitle: '東京咖啡地圖', collectionId: 'c1', savedAt: at }} />);

    const credit = screen.getByTestId('place-source-credit');
    expect(credit.textContent).toContain('來自 Ann 的東京咖啡地圖');
    expect(credit.textContent).toContain('收藏於 2026/03/10');
  });

  /*
    Says less rather than saying something wrong. A credit resolved from the
    wrong id would print the reader's own name, which is worse than vague.
  */
  it('says 某位旅人 when the name could not be read', () => {
    render(<PlaceSourceCredit credit={{ collectionTitle: '東京咖啡地圖', collectionId: 'c1', savedAt: at }} />);

    expect(screen.getByTestId('place-source-credit').textContent).toContain('來自 某位旅人 的東京咖啡地圖');
  });

  /*
    An unpublished collection loses its title and its link and keeps the
    person: the source stops being readable, the credit does not.
  */
  it('keeps the person when the collection is gone', async () => {
    const onOpenSource = vi.fn();
    render(<PlaceSourceCredit credit={{ creatorName: 'Ann', collectionId: 'c1', savedAt: at }} onOpenSource={onOpenSource} />);

    const credit = screen.getByTestId('place-source-credit');
    expect(credit.textContent).toContain('來自 Ann 的收藏');
    await userEvent.click(credit);
    expect(onOpenSource).not.toHaveBeenCalled();
  });

  it('opens the source when there is one to open', async () => {
    const onOpenSource = vi.fn();
    render(<PlaceSourceCredit credit={{ creatorName: 'Ann', collectionTitle: '東京咖啡地圖', collectionId: 'c1', savedAt: at }} onOpenSource={onOpenSource} />);

    await userEvent.click(screen.getByTestId('place-source-credit'));
    expect(onOpenSource).toHaveBeenCalledWith('c1');
  });

  it('survives a date it cannot read', () => {
    render(<PlaceSourceCredit credit={{ creatorName: 'Ann', savedAt: 'not a date' }} />);
    expect(screen.getByTestId('place-source-credit').textContent).not.toContain('收藏於');
  });
});
