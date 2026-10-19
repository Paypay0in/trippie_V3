/**
 * 「沒動」.
 *
 * An accept that matches no row returns no error — row-level security filters
 * before the write — so a refused action and a successful one looked identical
 * from the outside. A screen that cannot tell them apart teaches somebody to
 * press the button again.
 */
import { describe, expect, it } from 'vitest';
import { friendProblem } from './friendProblem';

describe('好友動作沒成功的時候', () => {
  it('says nothing when it worked', () => {
    expect(friendProblem({ status: 'ok', data: null })).toBe('');
  });

  /* The same mistake `classify` exists to avoid: do not blame the address. */
  it('names a missing table as a missing table', () => {
    expect(friendProblem({ status: 'setup_required' })).toContain('資料表');
  });

  it('names signing in as signing in', () => {
    expect(friendProblem({ status: 'unavailable' })).toContain('登入');
  });

  it('passes a real message through', () => {
    expect(friendProblem({ status: 'error', message: '這筆邀請沒有被更新' }))
      .toBe('這筆邀請沒有被更新');
  });

  it('still says something when the message is empty', () => {
    expect(friendProblem({ status: 'error', message: '' })).toBeTruthy();
  });
});
