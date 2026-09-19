import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import JoinTripSheet from './components/JoinTripSheet';
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
    <App />
    {/* Beside App, not inside it. An invite link can land on any of App's
        many return paths — signed out most of all — and a sheet mounted on
        one branch is missing from the rest. */}
    <JoinTripSheet />
  </React.StrictMode>
);