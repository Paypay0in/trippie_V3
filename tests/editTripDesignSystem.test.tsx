/**
 * @vitest-environment jsdom
 *
 * 「Typography is oversized and inconsistent ... The screen feels like an
 * enlarged responsive website rather than a native mobile app.」
 *
 * Every size on this screen had been chosen locally: an 18px heading beside a
 * 16px one, 64px rows beside 48px ones, 26px corners beside 16px ones. Nothing
 * was wrong on its own and none of it agreed, which is the shape of a screen
 * with no scale behind it.
 *
 * What is checked here is that the screen asks the system for its sizes rather
 * than picking them — jsdom resolves no CSS variables and does no layout, so
 * the value of a token is not testable, but whether this screen is still
 * inventing its own is.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import CreateEditTripScreen from '../components/CreateEditTripScreen';

const source = readFileSync(
  resolve(process.cwd(), 'components/CreateEditTripScreen.tsx'),
  'utf8',
);
const css = readFileSync(resolve(process.cwd(), 'index.css'), 'utf8');

const renderScreen = (props: Record<string, unknown> = {}) =>
  render(
    <CreateEditTripScreen
      mode="edit"
      initialDestination="韓國"
      initialStartDate="2026-10-02"
      initialEndDate="2026-10-07"
      initialCurrency="TWD"
      initialCompanions={[{ id: 'gina', name: 'Gina' }]}
      friends={[]}
      onBack={vi.fn()}
      onSubmit={vi.fn()}
      onOpenAiPlanner={vi.fn()}
      {...props}
    />,
  );

afterEach(cleanup);

describe('設計 token 住在既有的 @theme 裡', () => {
  it('字級、圓角、顏色都定義在 index.css，不是第二套系統', () => {
    for (const token of [
      '--text-screen-title',
      '--text-section',
      '--text-field',
      '--text-meta',
      '--radius-field',
      '--radius-cover',
      '--color-ink',
    ]) {
      expect(css, token).toContain(token);
    }
  });

  it('尺寸類的 token 也只有一份', () => {
    for (const token of ['--control-h', '--cta-h', '--screen-pad']) {
      expect(css, token).toContain(token);
    }
  });

  it('這一頁不再自己挑字級', () => {
    // The web-scale defaults this screen used to reach for.
    expect(source).not.toMatch(/text-(xl|2xl|3xl|4xl)\b/);
  });

  it('這一頁不再自己挑圓角', () => {
    expect(source).not.toMatch(/rounded-\[\d/);
  });
});

describe('欄位與按鈕的尺寸', () => {
  it('所有輸入框共用同一個高度 token', () => {
    const controls = source.match(/h-\[var\(--control-h\)\]/g) || [];
    // currency, budget, destination, start date, end date
    expect(controls.length).toBe(5);
  });

  it('主要按鈕用 CTA 高度，不是自己寫一個', () => {
    expect(source).toContain('h-[var(--cta-h)]');
  });

  it('沒有任何寫死的 px 高度留在這一頁', () => {
    expect(source).not.toMatch(/\bh-\[\d+px\]/);
  });
});

describe('主要與次要動作', () => {
  it('Save Changes 是實心紫色的主要動作', () => {
    renderScreen();
    const save = screen.getByRole('button', { name: 'Save Changes' });
    expect(save.className).toContain('bg-violet-600');
    expect(save.className).toContain('h-[var(--cta-h)]');
  });

  it('AI 那顆不是第二顆實心按鈕', () => {
    renderScreen();
    const ai = screen.getByRole('button', { name: /讓 AI 幫你準備這趟旅程/ });
    expect(ai.className).not.toMatch(/bg-(violet|blue|indigo)-[5-7]00/);
  });

  it('日期不合法時主要動作會停用', () => {
    renderScreen({ initialStartDate: '2026-10-07', initialEndDate: '2026-10-02' });
    expect((screen.getByRole('button', { name: 'Save Changes' }) as HTMLButtonElement).disabled)
      .toBe(true);
  });
});

describe('旅客', () => {
  it('畫出人，不是只寫一個數字', () => {
    renderScreen();
    expect(screen.getByTestId('traveler-owner')).toBeTruthy();
    expect(screen.getByTestId('traveler-gina').textContent).toBe('G');
  });

  it('頭像是 40px', () => {
    renderScreen();
    expect(screen.getByTestId('traveler-owner').className).toContain('h-10');
  });

  it('新增旅伴仍然開同一個管理面板', () => {
    renderScreen();
    fireEvent.click(screen.getByTestId('add-traveler'));
    expect(screen.getByText('管理旅伴')).toBeTruthy();
  });

  it('可點範圍不小於 44pt', () => {
    renderScreen();
    expect(screen.getByTestId('add-traveler').className).toContain('h-11');
  });
});

/**
 * 「Do not remove any existing functionality.」 The restyle touched every line
 * of the markup, so the things the screen is for are checked by using it.
 */
describe('功能沒有被改版弄丟', () => {
  it('送出時帶著使用者填的每一個欄位', () => {
    const onSubmit = vi.fn();
    renderScreen({ onSubmit });

    fireEvent.change(screen.getByLabelText('開始日期'), { target: { value: '2026-10-03' } });
    fireEvent.change(screen.getByPlaceholderText('Optional'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      destination: '韓國',
      startDate: '2026-10-03',
      endDate: '2026-10-07',
      currency: 'TWD',
      budget: 50000,
      companions: [{ id: 'gina', name: 'Gina' }],
    }));
  });

  it('預算仍然是可選的', () => {
    const onSubmit = vi.fn();
    renderScreen({ onSubmit });

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ budget: undefined }));
  });

  it('日期顛倒時擋下來並說明原因', () => {
    const onSubmit = vi.fn();
    renderScreen({ onSubmit });

    fireEvent.change(screen.getByLabelText('結束日期'), { target: { value: '2026-09-01' } });

    expect(screen.getByText('結束日期不能早於開始日期。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('返回還是返回', () => {
    const onBack = vi.fn();
    renderScreen({ onBack });
    fireEvent.click(screen.getByLabelText('返回'));
    expect(onBack).toHaveBeenCalled();
  });

  it('AI 規劃的入口還在', () => {
    const onOpenAiPlanner = vi.fn();
    renderScreen({ onOpenAiPlanner });
    fireEvent.click(screen.getByRole('button', { name: /讓 AI 幫你準備這趟旅程/ }));
    expect(onOpenAiPlanner).toHaveBeenCalled();
  });

  it('圖片授權標示留著 —— 那是授權條件，不是裝飾', () => {
    renderScreen();
    // The cover only renders attribution once an image has resolved; what must
    // never be optional is the markup that carries it.
    expect(source).toContain('Photo by');
    expect(source).toContain('Pexels');
  });
});
