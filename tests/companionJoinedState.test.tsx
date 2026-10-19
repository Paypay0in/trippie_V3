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

/**
 * 「Gina 跟諮是同一個人」, and her seat said 已加入 with no account behind it.
 *
 * The repair for the bug above read `type === 'member'` as joined, which is a
 * different fact. `user_id` is the only thing that means 「there is an account
 * here」 — it is what `is_trip_member` reads and what `claim_trip_invite`
 * writes — and a seat without one was claiming to have one.
 *
 * Worse, the label took the cure with it: 邀請 is hidden for a seat that has
 * joined, so the only way to attach an account was gone from the one screen
 * that offers it.
 */
describe('a seat that is a member and nothing more', () => {
  const memberNoAccount: Companion = { id: 'seat-gina', name: 'Gina', type: 'member' };

  it('does not claim somebody is in when no account is', () => {
    renderModal([memberNoAccount]);

    expect(screen.queryByText('已加入')).toBeNull();
  });

  it('still offers the invite that would put one there', () => {
    renderModal([memberNoAccount]);

    expect(screen.getByLabelText('邀請Gina加入這趟旅程')).toBeTruthy();
  });

  /* And a seat an account really holds still says so, and needs no invite. */
  it('leaves a claimed seat alone', () => {
    renderModal([joined]);

    expect(screen.getByText('已加入')).toBeTruthy();
    expect(screen.queryByLabelText('邀請Gina加入這趟旅程')).toBeNull();
  });
});
