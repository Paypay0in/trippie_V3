/**
 * @vitest-environment jsdom
 *
 * 「這邊要可以收合」.
 *
 * 排今天 prints the whole day — every slot, filled or offering a place — above
 * the itinerary somebody opened the screen to read. It is the right size while
 * planning and the wrong size every other time, and it had no way to get out
 * of the way.
 *
 * What is pinned here is the part that is invisible from outside: the answer
 * survives a remount. A fold that reopens on the next render is not a fold,
 * and nothing about the markup would look wrong on the day it stops being
 * remembered.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DayBlockPlanner from '../components/DayBlockPlanner';
import { DAY_BLOCK_PLANNER_COLLAPSED_KEY } from '../services/dayBlockPlannerCollapsed';
import i18n from '../i18n/config';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const planner = () => render(
  <DayBlockPlanner
    date="2026-11-24"
    items={[]}
    places={[]}
    onFillBlock={() => true}
  />,
);

const toggle = () => screen.getByTestId('day-block-planner-toggle');

describe('folding 排今天 away', () => {
  it('opens expanded, the way it always has', () => {
    planner();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('day-start-input')).toBeTruthy();
  });

  it('hides the day grid when the title is tapped, keeping the title', () => {
    planner();
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('day-start-input')).toBeNull();
    // The handle has to survive the fold, or there is no way back.
    expect(toggle().textContent).toContain(i18n.t('itinerary.dayBlocks.title'));
  });

  it('is still folded after a remount — the answer is remembered', () => {
    planner();
    fireEvent.click(toggle());
    cleanup();
    planner();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('day-start-input')).toBeNull();
  });

  it('unfolds again, and stops being remembered', () => {
    localStorage.setItem(DAY_BLOCK_PLANNER_COLLAPSED_KEY, '1');
    planner();
    fireEvent.click(toggle());
    expect(screen.getByTestId('day-start-input')).toBeTruthy();
    cleanup();
    planner();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });
});
