import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import JoinTripSheet from './components/JoinTripSheet';
import StaleBuildBanner from './components/StaleBuildBanner';
import { overflowProbeRequested, startOverflowProbe } from './services/overflowProbe';
import { foldProbeRequested, startFoldProbe } from './services/foldProbe';
import './index.css';
import { FOLLOW_DEVICE_LANGUAGE, initI18n } from './i18n/config';
import { resolveStartingLanguage } from './services/languagePreference';

// Before the first render: a screen that paints in one language and swaps to
// another a tick later is worse than a slightly later first paint.
//
// Three sources, resolved in one place: the `?lang=` preview, the setting
// under 「我」, then the phone. `resolveStartingLanguage` owns that order so
// startup and the setting screen cannot disagree about which one wins.
initI18n({
  language: resolveStartingLanguage({
    preview: new URLSearchParams(window.location.search).get('lang'),
    /*
      The phone is consulted only once the translation is finished.

      Both instructions are real: 「介面的語言隨著手機語言調整」 and
      「不要造成中英混雜」. While most screens are still hardcoded Chinese,
      honouring an English phone would produce an English shell over a Chinese
      app — the second instruction broken in order to keep the first. So the
      device is held behind the same flag that gates the end of this migration,
      while an explicit choice in 設定 and the `?lang=` preview are honoured
      immediately: those are somebody asking for it, not a guess.
    */
    device:
      !FOLLOW_DEVICE_LANGUAGE || typeof navigator === 'undefined'
        ? undefined
        : navigator.language || navigator.languages?.[0],
  }),
});

// Polyfill process for libraries that might expect it in the browser
if (typeof window !== 'undefined' && !window.process) {
  (window as any).process = { env: {} };
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {/*
      First in the document, and beside App for the same reason JoinTripSheet
      is: 「這頁還沒改好」 was asked of a screen running yesterday's build, and
      the banner that would have said so was mounted inside the trip workspace —
      so it was missing from the home screen, which is where the question gets
      asked.
    */}
    <StaleBuildBanner />
    <App />
    {/* Beside App, not inside it. An invite link can land on any of App's
        many return paths — signed out most of all — and a sheet mounted on
        one branch is missing from the rest. */}
    <JoinTripSheet />
  </React.StrictMode>
);

// `?overflow=1` names whatever is wider than the screen. Layout cannot be
// measured in a test — jsdom does none — so the only place this question has
// an answer is the real browser on the real phone.
if (overflowProbeRequested()) startOverflowProbe();
// 「還是要滑」, answered in pixels instead of another screenshot.
if (foldProbeRequested()) startFoldProbe();