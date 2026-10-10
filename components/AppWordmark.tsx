import React from 'react';

/**
 * The name of the app, one size.
 *
 * 「旅行的 logo 跟社群的 logo 我希望一樣大小 不要時大時小」.
 *
 * 社群 and 旅行 each drew their own header, so the wordmark was 20px on one and
 * 32px on the other and the plane beside it changed with it. Nothing was
 * broken on either screen alone; the fault only existed in the moment of
 * tapping between them, where the app's own name jumps — which reads as the
 * page having reloaded into something else.
 *
 * Defined once so the next header cannot invent a third size.
 */
const AppWordmark: React.FC = () => (
  <div data-testid="app-wordmark" className="flex items-center gap-2 text-[1.75rem] font-black tracking-tight">
    <span className="text-[1.6rem] text-violet-600">✈</span>Trippie
  </div>
);

export default AppWordmark;
