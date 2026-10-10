/**
 * Whether this device is running yesterday's app.
 *
 * Today cost four rounds to 「又沒有翻譯了」 while the server was returning every
 * translation and the database held them. The missing piece was never in the
 * data: it was that nobody could tell whether the phone had actually loaded
 * the build being discussed. Every answer ended in 「關掉重開」, which is advice,
 * not an answer.
 *
 * The bundle already stamps the commit it was built from and the server already
 * reports the commit it is serving. Comparing them is the whole feature.
 */

/** The reply from `/api/version`. */
export interface DeployedVersion {
  commit?: string;
}

/**
 * True when the running bundle is demonstrably older than what is deployed.
 *
 * Silent in every uncertain case. A local build stamps `dev`, a server with no
 * commit env reports `dev`, and a failed fetch says nothing at all — none of
 * those is evidence of staleness, and a banner that cries wolf during
 * development is a banner nobody reads in Busan.
 */
export const isStaleBuild = (running: string | undefined, deployed: string | undefined): boolean => {
  const here = (running || '').trim();
  const there = (deployed || '').trim();
  if (!here || !there) return false;
  if (here === 'dev' || there === 'dev') return false;
  return here !== there;
};

/**
 * Whether to reload the page by itself, rather than ask.
 *
 * 「點不到」, and the deadlock underneath it: the app is a Safari home-screen
 * shortcut, so iOS resumes the page it had rather than loading a new one. The
 * only control that fetched a newer build was the update banner — and when the
 * banner itself was the thing that shipped broken, the fix for it could not be
 * reached from inside the app. Escaping meant force-quitting from the app
 * switcher, which nobody should have to be told.
 *
 * So a stale build heals itself. The conditions are what keep that from being
 * worse than the problem.
 */

export const AUTO_RELOAD_STORAGE_KEY = 'trippie_auto_reloaded_for_v1';

export interface AutoReloadContext {
  /** The commit the server is serving. */
  deployed: string;
  /** First paint, or a return from the background. */
  trigger: 'load' | 'foreground';
  /** What the reader is in the middle of, if anything. */
  focusedTag?: string;
  isEditing?: boolean;
  /** The commit this session has already reloaded for, if any. */
  alreadyReloadedFor?: string | null;
}

export const shouldAutoReload = (context: AutoReloadContext): boolean => {
  const deployed = (context.deployed || '').trim();
  if (!deployed || deployed === 'dev') return false;

  /*
    Only on the way back in.

    A reload at first paint is the one that can loop: if something other than a
    stale cache is making the versions disagree, the page would reload, still
    disagree, and reload again. Coming back from the background is both the
    moment a deploy is likely to have been missed and a moment the reader is
    demonstrably not doing anything.
  */
  if (context.trigger !== 'foreground') return false;

  /*
    Never out from under someone's hands.

    A half-typed expense is worth more than being a version behind. Where
    anything is focused or being edited, the banner goes back to asking.
  */
  const tag = (context.focusedTag || '').toUpperCase();
  if (context.isEditing) return false;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;

  /*
    Once per deploy, and no more.

    If a reload does not resolve the disagreement — a service worker holding an
    old bundle, a proxy, a clock skew — then reloading again will not either,
    and an app that reloads every time it is opened is unusable. After one
    attempt it falls back to the banner, which at least says what is wrong.
  */
  return context.alreadyReloadedFor !== deployed;
};
