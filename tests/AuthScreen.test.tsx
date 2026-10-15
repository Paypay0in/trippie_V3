/**
 * @vitest-environment jsdom
 *
 * A password manager fills the login form without React ever seeing a change
 * event. The form must sign in with what is on screen rather than rejecting it.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthScreen from '../components/AuthScreen';

const signIn = vi.fn();
vi.mock('../services/authService', () => ({
  signIn: (...args: unknown[]) => signIn(...args),
  signUp: vi.fn(),
  resendSignupConfirmation: vi.fn(),
}));

/**
 * Sets an input the way a password manager does: the value lands in the DOM
 * without React's onChange ever running, so component state stays empty.
 */
const autofill = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(input, value);
};

afterEach(cleanup);

describe('AuthScreen', () => {
  it('signs in with an autofilled email instead of rejecting it', async () => {
    signIn.mockResolvedValue({ session: {} });
    const onSuccess = vi.fn();
    render(<AuthScreen onBack={() => {}} onSuccess={onSuccess} />);

    autofill(screen.getByLabelText(/Email/) as HTMLInputElement, 'washop0517@gmail.com');
    autofill(screen.getByLabelText(/Password/) as HTMLInputElement, 'secret123');

    fireEvent.click(screen.getByRole('button', { name: '登入' }));

    expect(await screen.findByText('登入')).toBeTruthy();
    expect(screen.queryByText(/Email 格式不正確/)).toBeNull();
    expect(signIn).toHaveBeenCalledWith({
      email: 'washop0517@gmail.com',
      password: 'secret123',
    });
  });

  it('still rejects an address that is genuinely malformed', () => {
    signIn.mockClear();
    render(<AuthScreen onBack={() => {}} onSuccess={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'washop0517' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: '登入' }));

    expect(screen.getByText('Email 格式不正確：「washop0517」')).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });
});

/**
 * 「P2 — 登入／註冊錯誤提示不夠精準：空白送出只提示 Email，沒有清楚指出密碼或其他
 * 必填欄位」.
 *
 * A form that reports one missing field at a time makes somebody submit three
 * times to learn three things it knew at the first press.
 */
describe('空白送出時說清楚缺什麼', () => {
  it('一次列出 Email 和密碼', async () => {
    render(<AuthScreen onBack={() => {}} onSuccess={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '登入' }));

    expect((await screen.findByText(/請輸入/)).textContent).toContain('Email');
    expect((await screen.findByText(/請輸入/)).textContent).toContain('密碼');
  });

  /* Only what is actually missing. */
  it('只缺密碼時不會再叫人輸入 Email', async () => {
    render(<AuthScreen onBack={() => {}} onSuccess={() => {}} />);
    fireEvent.change(document.querySelector('input[name="email"]') as HTMLInputElement, { target: { value: 'north@example.com' } });

    fireEvent.click(screen.getByRole('button', { name: '登入' }));

    const message = (await screen.findByText(/請輸入/)).textContent || '';
    expect(message).toContain('密碼');
    expect(message).not.toContain('Email');
  });
});
