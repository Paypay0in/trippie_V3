/**
 * @vitest-environment jsdom
 *
 * 「太滿版了」.
 *
 * The request sheet ran to the bottom edge of the screen, where the floating
 * nav and its raised ＋ already are — so its own 發佈 button and the date
 * fields at the foot of the form sat underneath them.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ServiceRequestSheet from '../components/ServiceRequestSheet';
import { BOTTOM_NAV_CLEARANCE } from '../components/AppBottomNav';
import type { ShoppingItem } from '../types';

afterEach(cleanup);

const tasks: ShoppingItem[] = [
  { id: 'ticket:a', name: '購票：東京都現代美術館（10/20）', isPurchased: false, phase: 'pre' },
];

const open = () => render(
  <ServiceRequestSheet
    tasks={tasks}
    selectedTaskIds={['ticket:a']}
    onToggleTask={vi.fn()}
    destinationCountry="日本"
    tripStartDate="2026-10-20"
    onClose={vi.fn()}
    onPublish={vi.fn()}
  />,
);

describe('發佈協助需求 的版面', () => {
  const overlay = () => screen.getByRole('heading', { name: '發佈協助需求' })
    .closest('div[class*="fixed"]') as HTMLElement;

  it('leaves the floating nav its room', () => {
    open();

    expect(overlay().className).toContain(BOTTOM_NAV_CLEARANCE);
  });

  /* A sheet that fills the screen is not a sheet, it is the screen. */
  it('stops short of the top as well', () => {
    open();

    const panel = overlay().firstElementChild as HTMLElement;
    expect(panel.className).toContain('max-h-[85vh]');
    expect(panel.className).not.toContain('rounded-t-3xl');
  });
});
