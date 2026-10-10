import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BUILD_ID } from '../services/buildStamp';
import {
  AUTO_RELOAD_STORAGE_KEY,
  DeployedVersion,
  isStaleBuild,
  shouldAutoReload,
} from '../services/staleBuild';

/**
 * 「關掉重開」, said once too often.
 *
 * A whole evening went to a fault that was fixed on the server while the phone
 * kept running the build from before the fix, and nothing on either side could
 * say so. The bundle knows which commit it is; the server knows which commit it
 * serves; until now nobody compared them.
 *
 * Checked on open and whenever the app comes back to the foreground, which is
 * exactly when a traveller would have left it long enough to miss a deploy. No
 * timer: polling a version endpoint all day to answer a question nobody asked
 * is how a battery disappears.
 */
const StaleBuildBanner: React.FC = () => {
  const [stale, setStale] = useState(false);

  const check = useCallback(async (trigger: 'load' | 'foreground') => {
    try {
      // `cache: no-store`, or the check itself can be answered from the same
      // stale cache that caused the problem.
      const response = await fetch('/api/version', { cache: 'no-store' });
      if (!response.ok) return;
      const deployed = await response.json() as DeployedVersion;
      if (!isStaleBuild(BUILD_ID, deployed.commit)) { setStale(false); return; }

      /*
        Heal rather than ask, where asking would be a trap.

        The banner only works if it can be tapped, and the evening it shipped
        with its own tap target under the status bar there was no way out of
        the app except the app switcher. A stale build that can fix itself does
        not depend on its own correctness to be fixable.

        Everything that makes this safe lives in shouldAutoReload: never at
        first paint, never while anything is focused, and once per deployed
        commit. When it declines, the banner is still there to be tapped.
      */
      const commit = (deployed.commit || '').trim();
      const alreadyReloadedFor = (() => {
        try { return sessionStorage.getItem(AUTO_RELOAD_STORAGE_KEY); } catch { return null; }
      })();
      const active = document.activeElement as HTMLElement | null;
      if (shouldAutoReload({
        deployed: commit,
        trigger,
        focusedTag: active?.tagName,
        isEditing: active?.isContentEditable,
        alreadyReloadedFor,
      })) {
        try { sessionStorage.setItem(AUTO_RELOAD_STORAGE_KEY, commit); } catch {
          // A blocked store costs one extra reload, not a loop: the guard that
          // matters most is the foreground-only rule above it.
        }
        window.location.reload();
        return;
      }

      setStale(true);
    } catch {
      // Offline on a Busan subway platform is not evidence of a stale build.
    }
  }, []);

  useEffect(() => {
    void check('load');
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check('foreground');
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [check]);

  if (!stale) return null;

  /*
    Under the clock, not behind it.

    「點不到」. The app renders with viewport-fit=cover, so the top of the page
    is the top of the glass and every screen pads itself past the status bar
    with data-safe-top. This banner was mounted beside App and never learned
    the rule, so it drew itself into the strip the clock and the battery own —
    where iOS takes the taps, and the one control whose entire purpose is to be
    tapped could not be.

    Fixed rather than in the flow: padding it in place would stack this inset on
    top of the one the screen below already applies, and the fix for not being
    tappable would be the gap that was complained about two nights ago. It
    covers the header for as long as it is there, which is until it is tapped.
  */
  return (
    <button
      type="button"
      data-testid="stale-build-banner"
      onClick={() => window.location.reload()}
      className="fixed inset-x-0 top-0 z-[100] flex w-full items-center justify-center gap-2 bg-[#5b3df5] px-4 pb-3 text-[12px] font-black text-white shadow-[0_6px_20px_rgba(37,25,120,.35)]"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
    >
      <RefreshCw size={14} />
      有新版本可以更新，點一下重新載入
    </button>
  );
};

export default StaleBuildBanner;
