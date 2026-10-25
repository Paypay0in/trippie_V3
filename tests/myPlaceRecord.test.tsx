/**
 * @vitest-environment jsdom
 *
 * 我的紀錄 — 「這家店是分帳 因此我沒有原始帳目的紀錄 我就就不能傳圖跟做備注」.
 *
 * The bill belongs to whoever paid it and must not be writable by anybody
 * else. The consequence was that a meal a friend paid for left the person
 * who ate it nowhere to put a photograph, so this is deliberately about the
 * place and not about the money.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import MyPlaceRecord from '../components/MyPlaceRecord';

afterEach(cleanup);

const record = (props: Partial<React.ComponentProps<typeof MyPlaceRecord>> = {}) => {
  const onSave = vi.fn();
  render(<MyPlaceRecord text="" photos={[]} onSave={onSave} {...props} />);
  return onSave;
};

describe('一則只有自己看得到的紀錄', () => {
  /*
    Said on the screen, not only in the row policy. Somebody deciding
    whether to write something honest about a restaurant their friend chose
    should not have to guess who can read it.
  */
  it('says who can read it', () => {
    record();
    expect(screen.getByTestId('my-place-record').textContent).toContain('只有你看得到');
  });

  it('invites one where there is none', () => {
    record();
    expect(screen.getByTestId('my-place-record-start')).toBeTruthy();
  });

  it('writes words', async () => {
    const onSave = record();

    await userEvent.click(screen.getByTestId('my-place-record-start'));
    await userEvent.type(screen.getByLabelText('我的紀錄'), '朋友請客的');
    await userEvent.click(screen.getByTestId('my-place-record-save'));

    expect(onSave).toHaveBeenCalledWith({ text: '朋友請客的', photos: [] });
  });

  it('shows what was written, and reopens it', async () => {
    const onSave = record({ text: '很好吃', photos: ['shot-a'] });

    expect(screen.getByTestId('my-place-record-edit').textContent).toContain('很好吃');
    await userEvent.click(screen.getByTestId('my-place-record-edit'));
    expect(screen.getByLabelText('我的紀錄')).toHaveProperty('value', '很好吃');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('drops a photo that was there', async () => {
    const onSave = record({ text: '很好吃', photos: ['shot-a', 'shot-b'] });

    await userEvent.click(screen.getByTestId('my-place-record-edit'));
    await userEvent.click(screen.getByTestId('my-place-record-remove-0'));
    await userEvent.click(screen.getByTestId('my-place-record-save'));

    expect(onSave).toHaveBeenCalledWith({ text: '很好吃', photos: ['shot-b'] });
  });

  /* Emptied means deleted, which the writer already implements. */
  it('offers to clear a record emptied of both', async () => {
    const onSave = record({ text: '很好吃', photos: [] });

    await userEvent.click(screen.getByTestId('my-place-record-edit'));
    await userEvent.clear(screen.getByLabelText('我的紀錄'));
    expect(screen.getByTestId('my-place-record-save').textContent).toBe('清除紀錄');

    await userEvent.click(screen.getByTestId('my-place-record-save'));
    expect(onSave).toHaveBeenCalledWith({ text: '', photos: [] });
  });

  it('cancels without writing anything', async () => {
    const onSave = record({ text: '很好吃', photos: [] });

    await userEvent.click(screen.getByTestId('my-place-record-edit'));
    await userEvent.type(screen.getByLabelText('我的紀錄'), '改了');
    await userEvent.click(screen.getByTestId('my-place-record-cancel'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('my-place-record-edit').textContent).toContain('很好吃');
  });

  /* A screen with no way to save is read-only, like every other panel here. */
  it('is read-only when nobody can save', () => {
    render(<MyPlaceRecord text="" photos={[]} />);
    expect(screen.getByTestId('my-place-record-start')).toHaveProperty('disabled', true);
  });
});
