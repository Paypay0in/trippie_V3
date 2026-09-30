/**
 * Turning the invite function's refusal into something the traveller can fix.
 *
 * `create_trip_invite` refuses for two reasons, and both are ordinary: the
 * trip has not reached the server, or this companion has not. Both arrived on
 * screen as 「產生邀請連結失敗」, which names no cause and suggests no action
 * — two days before a trip, that is the difference between a fixable state
 * and an app that appears broken.
 */

/** What to tell the traveller, given whatever the database said. */
export const inviteFailureMessage = (raw?: string): string => {
  const message = (raw || '').toLowerCase();

  if (message.includes('member does not belong')) {
    // The companion exists locally but has no row on the server, so there is
    // no seat to hand out. Saving the trip is what pushes them.
    return '這位旅伴還沒同步到雲端。請先儲存這趟旅程，等同步完成後再邀請。';
  }
  if (message.includes('not the trip owner')) {
    return '這趟旅程還沒同步到雲端，或不是用建立它的帳號登入。請先儲存旅程並確認登入的帳號。';
  }
  if (message.includes('jwt') || message.includes('auth')) {
    return '登入狀態已過期，請重新登入後再邀請。';
  }
  if (message.includes('function') && message.includes('does not exist')) {
    return '雲端還沒套用邀請功能的資料表設定。';
  }
  // Unknown reasons are shown rather than replaced. A generic sentence hides
  // exactly the cases nobody anticipated, which are the ones worth reading.
  return raw ? `產生邀請連結失敗：${raw}` : '產生邀請連結失敗';
};

/** The same, for the person on the other end of the link. */
export const claimFailureMessage = (raw?: string): string => {
  const message = (raw || '').toLowerCase();

  if (message.includes('must be signed in')) {
    return '請先登入或註冊，再重新開啟這個邀請連結。';
  }
  if (message.includes('invite not found') || message.includes('expired')) {
    return '這個邀請連結已經失效或被用過了，請對方重新產生一次。';
  }
  if (message.includes('jwt') || message.includes('auth')) {
    return '登入狀態已過期，請重新登入後再開一次連結。';
  }
  return raw ? `加入失敗：${raw}` : '加入失敗，請再試一次或請對方重新邀請。';
};
