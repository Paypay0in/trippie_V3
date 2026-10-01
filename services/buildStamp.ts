/**
 * Which build this device is actually running.
 *
 * Four rounds of tonight's sync failure were spent on the question 「我的手機是新版嗎」
 * with no way to answer it. Both travellers were told to look for a piece of UI
 * copy, and the copy named for the check had been removed by the very commit
 * they were checking for — so the test could never pass.
 *
 * A build stamp is the only honest answer: the same string is readable on the
 * device and from the deployed bundle, so the two can be compared rather than
 * guessed at.
 */

declare const __BUILD_ID__: string | undefined;

/** Short commit of the running build, or `dev` when built outside git. */
export const BUILD_ID = typeof __BUILD_ID__ === 'string' && __BUILD_ID__ ? __BUILD_ID__ : 'dev';
