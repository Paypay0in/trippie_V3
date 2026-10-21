/**
 * @vitest-environment jsdom
 *
 * 「上傳截圖 → AI 辨識整理 → 加入購物清單」, as one screen rather than three —
 * they are one errand, and a traveller who has just picked eight pictures does
 * not want to be navigated.
 *
 * Nothing is written until it is ticked.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShoppingScreenshotIntake from '../components/ShoppingScreenshotIntake';

const products = vi.fn(async () => ({
  products: [
    { name: 'SK-II 青春露', brand: 'SK-II', spec: '230ml', shop: '松本清', category: '美妝保養' },
    { name: '東京芭娜娜', category: '伴手禮' },
  ],
}));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => await products() })));
  /* jsdom has no FileReader result for a stub File without this. */
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
    Object.defineProperty(this, 'result', { value: 'data:image/jpeg;base64,AAAA', configurable: true });
    this.onload?.({} as ProgressEvent<FileReader>);
  });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const shot = () => new File(['x'], 'a.jpg', { type: 'image/jpeg' });

const show = () => {
  const onAdd = vi.fn();
  render(<ShoppingScreenshotIntake phase={'during' as never} makeId={() => 'id'} onAdd={onAdd} />);
  return { onAdd };
};

const upload = async () => {
  fireEvent.change(screen.getByTestId('shopping-screenshot-input'), { target: { files: [shot()] } });
  await waitFor(() => expect(screen.getByTestId('shopping-candidates-add')).toBeTruthy());
};

describe('reading a screenshot', () => {
  it('says how many it found', async () => {
    show();

    await upload();

    expect(screen.getByTestId('shopping-screenshot-intake').textContent).toContain('2 個商品');
  });

  /* The traveller chose these pictures; unticking three beats ticking six. */
  it('starts with everything chosen', async () => {
    show();

    await upload();

    expect(screen.getByTestId('shopping-candidates-add').textContent).toContain('2');
  });

  /*
    Marked as unsure where it is unsure. A confident 230ml that was never on
    the picture sends somebody to a counter for the wrong bottle.
  */
  it('marks what it guessed', async () => {
    show();

    await upload();

    expect(screen.getByTestId('shopping-candidate-shot0-0').textContent).toContain('待確認');
  });

  it('adds only what is still ticked', async () => {
    const { onAdd } = show();

    await upload();
    fireEvent.click(screen.getByTestId('shopping-candidate-shot0-1'));
    fireEvent.click(screen.getByTestId('shopping-candidates-add'));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toHaveLength(1);
    expect(onAdd.mock.calls[0][0][0].name).toBe('SK-II 青春露');
  });

  /* Nothing read is said plainly rather than left as an empty panel. */
  it('says when it read nothing', async () => {
    products.mockResolvedValueOnce({ products: [] });
    show();

    fireEvent.change(screen.getByTestId('shopping-screenshot-input'), { target: { files: [shot()] } });

    await waitFor(() => expect(screen.getByTestId('shopping-screenshot-intake').textContent)
      .toContain('沒有讀到商品'));
  });
});
