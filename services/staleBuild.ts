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
