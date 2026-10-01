/**
 * @vitest-environment jsdom
 *
 * 管理旅伴 has to say whether somebody is actually in.
 *
 * A seat whose invite had been accepted showed 「訪客」 beside an 「邀請」
 * button — exactly what it showed before she joined. So the one screen that
 * could have answered 「她到底有沒有加入？」 answered no, four separate times,
 * while she was a member on every one of them.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import CompanionsModal from '../components/CompanionsModal';
import type { Companion } from '../types';

const joined: Companion = { id: 'seat-gina', name: 'Gina', userId: 'account-gina', type: 'member' };
const typedIn: Companion = { id: 'seat-ming', name: '小明' };

const renderModal = (companions: Companion[]) =>
  render(
    <CompanionsModal
      companions={companions}
      friends={[]}
      onAdd={() => {}}
      onAddFriendToTrip={() => {}}
      onRemove={() => {}}
      onClose={() => {}}
      ownerName="Ann"
      onInvite={() => {}}
    />,
  );

afterEach(() => cleanup());

describe('the companion list', () => {
  it('says 已加入 for a seat an account holds', () => {
    renderModal([joined]);

    expect(screen.getByText('已加入')).toBeTruthy();
    expect(screen.queryByText('訪客')).toBeNull();
  });

  it('stops offering to invite someone who is already in', () => {
    renderModal([joined]);

    expect(screen.queryByRole('button', { name: /邀請Gina加入這趟旅程/ })).toBeNull();
  });

  it('still calls a typed-in name a guest, and still offers the invite', () => {
    renderModal([typedIn]);

    expect(screen.getByText('訪客')).toBeTruthy();
    expect(screen.getByRole('button', { name: /邀請小明加入這趟旅程/ })).toBeTruthy();
  });
});
