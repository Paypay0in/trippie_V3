import { TripMember } from '../types';
import { resolveViewer } from './tripRoster';

/**
 * Why this device cannot say which traveller is holding it.
 *
 * 「這還是我的帳 Gina 依然收到」, and before that 「這些是我的帳」. Her device
 * answers every ownership question as the trip owner, because `resolveViewer`
 * falls back to the owner when it cannot match the signed-in user to a seat —
 * and nothing anywhere says so. The only reason it was ever noticed is that a
 * duplicate prompt showed her somebody else's receipts.
 *
 * There is already a notice for this, inside the expense form, shown while
 * adding a bill. That is too late and too narrow: by then she is mid-task, and
 * it does not say which of the two causes it is or what to do about it.
 *
 * Two causes, and they need different actions, which is the whole reason this
 * distinguishes them rather than saying 「無法確認身分」 twice.
 */

export type ViewerIdentityProblem = 'signed-out' | 'seat-unlinked';

export interface ViewerIdentityNotice {
  problem: ViewerIdentityProblem;
  message: string;
  action: string;
}

export interface ViewerIdentityInput {
  roster: TripMember[];
  authUserId?: string;
  tripOwnerMemberId: string;
}

/**
 * The notice, or null when there is nothing wrong to report.
 *
 * Null on a solo trip even when the viewer is unresolved: with nobody else on
 * the roster the owner fallback is simply correct, every expense really is
 * theirs, and a warning there would be the app apologising for being right.
 */
export const viewerIdentityNotice = ({
  roster,
  authUserId,
  tripOwnerMemberId,
}: ViewerIdentityInput): ViewerIdentityNotice | null => {
  const sharedWithOthers = roster.some(member => member.type !== 'owner');
  if (!sharedWithOthers) return null;

  const resolution = resolveViewer({ roster, authUserId, tripOwnerMemberId });
  if (resolution.isResolved) return null;

  if (!authUserId || !authUserId.trim()) {
    return {
      problem: 'signed-out',
      message: '這台裝置還沒登入，所以不知道你是這趟旅程裡的哪一位。你記的帳會被當成旅程建立者的帳。',
      action: '登入帳號',
    };
  }

  /*
    Signed in, and still nobody. The seat exists on the roster but its
    `user_id` was never written — the column an invite claim fills in, on the
    device that claims it.
  */
  return {
    problem: 'seat-unlinked',
    message: '你的帳號還沒跟這趟旅程裡的任何一位旅伴連起來，所以這台裝置會把你當成旅程建立者。',
    action: '到旅伴名單認領你的位置',
  };
};
