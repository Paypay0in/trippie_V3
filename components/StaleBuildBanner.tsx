import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BUILD_ID } from '../services/buildStamp';
import { DeployedVersion, isStaleBuild } from '../services/staleBuild';

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

  const check = useCallback(async () => {
    try {
      // `cache: no-store`, or the check itself can be answered from the same
      // stale cache that caused the problem.
      const response = await fetch('/api/version', { cache: 'no-store' });
      if (!response.ok) return;
      const deployed = await response.json() as DeployedVersion;
      setStale(isStaleBuild(BUILD_ID, deployed.commit));
    } catch {
      // Offline on a Busan subway platform is not evidence of a stale build.
    }
  }, []);

  useEffect(() => {
    void check();
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [check]);

  if (!stale) return null;

  return (
    <button
      type="button"
      data-testid="stale-build-banner"
      onClick={() => window.location.reload()}
      className="flex w-full items-center justify-center gap-2 bg-[#5b3df5] px-4 py-2 text-[11px] font-black text-white"
    >
      <RefreshCw size={13} />
      有新版本可以更新，點一下重新載入
    </button>
  );
};

export default StaleBuildBanner;
