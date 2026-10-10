import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import JoinTripSheet from './components/JoinTripSheet';
import StaleBuildBanner from './components/StaleBuildBanner';
import { overflowProbeRequested, startOverflowProbe } from './services/overflowProbe';
import { foldProbeRequested, startFoldProbe } from './services/foldProbe';
import './index.css';
import { initI18n, languageFromUrl } from './i18n/config';

// Before the first render: a screen that paints in one language and swaps to
// another a tick later is worse than a slightly later first paint.
// `?lang=` overrides the device so a screen can be reviewed in another
// language without changing the whole browser's settings.
initI18n({ language: languageFromUrl() });

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