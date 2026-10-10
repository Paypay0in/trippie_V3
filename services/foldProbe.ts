/**
 * How far past the bottom of the screen a page runs, in numbers.
 *
 * 「這頁我的理想是 手機不上下滾動 就能完全看到目前這張圖上的所有資訊」.
 *
 * Whether a page fits is a question about one device, and it cannot be
 * answered from here: jsdom does no layout, and arithmetic over a dozen
 * paddings is how the last three attempts at this were wrong by just enough to
 * need another screenshot. The reply to 「還是要滑」 has been a guess every time.
 *
 * So the phone answers it. `?fold=1` marks where the fold falls and names the
 * blocks that cross it, the same way `?overflow=1` already answers 「跑版」
 * sideways. A number and a name instead of another photo.
 */

export interface FoldFinding {
  /** Which block, as a reader of the markup would recognise it. */
  description: string;
  /** Where its bottom edge sits, relative to the top of the document. */
  bottom: number;
  /** How far past the fold that is. Negative means it fits. */
  overhang: number;
}

/**
 * Where the page is being viewed.
 *
 * Safari keeps its address bar inside the viewport, so the same page has about
 * 157pt less room in a tab than it does from the home screen — and the bar
 * hides itself on scroll, so 「fits without scrolling」 is not even a fixed
 * question there. A reading that does not say which of the two it came from
 * cannot be acted on: shrinking the design to fit a browser nobody uses it in
 * would be answering the wrong measurement.
 */
export const displayContext = (): 'standalone' | 'browser' => {
  if (typeof window === 'undefined') return 'browser';
  const standalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  if (standalone === true) return 'standalone';
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return 'standalone';
  } catch {
    // An old WebView without matchMedia is a browser as far as this is concerned.
  }
  return 'browser';
};

export interface FoldReport {
  viewportHeight: number;
  /** The usable fold: the viewport, less anything fixed over the bottom. */
  fold: number;
  documentHeight: number;
  /** Total scroll needed to reach the end of the page. */
  overflow: number;
  findings: FoldFinding[];
}

const describe = (element: Element): string => {
  const testId = element.getAttribute('data-testid');
  if (testId) return `[${testId}]`;
  const heading = element.querySelector('h1,h2,h3')?.textContent?.trim();
  if (heading) return `${element.tagName.toLowerCase()} 「${heading.slice(0, 20)}」`;
  const text = element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 24);
  return text ? `${element.tagName.toLowerCase()} 「${text}」` : element.tagName.toLowerCase();
};

/**
 * The blocks whose bottom edge falls below the fold.
 *
 * Only direct, named blocks are measured — a page is made of sections, and
 * reporting every nested div would bury the one that needs to be shorter under
 * its own children. The deepest offender is the useful answer sideways, where
 * one element is too wide; downwards the useful answer is the outermost block
 * that did not make it, because that is the one with a height to change.
 */
export const findBelowFold = (
  blocks: Element[],
  fold: number,
  bottomOf: (element: Element) => number,
): FoldFinding[] =>
  blocks
    .map(element => {
      const bottom = Math.round(bottomOf(element));
      return { description: describe(element), bottom, overhang: Math.round(bottom - fold) };
    })
    .filter(finding => finding.overhang > 0)
    .sort((a, b) => a.bottom - b.bottom);

/** `?fold=1` — turns 「還是要滑」 into a number of pixels and a block name. */
export const foldProbeRequested = (search?: string): boolean => {
  const source = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  return new URLSearchParams(source).get('fold') === '1';
};

/**
 * Attaches the report to the document, outside React.
 *
 * Rendering it as JSX would put it on one of App's many return paths and it
 * would be missing from most screens — the mistake the update banner was moved
 * out of App to avoid.
 */
export const startFoldProbe = (): (() => void) => {
  if (typeof document === 'undefined') return () => {};

  const panel = document.createElement('div');
  panel.id = 'trippie-fold-probe';
  panel.style.cssText =
    'position:fixed;left:0;right:0;top:0;z-index:2147483646;max-height:38vh;overflow:auto;' +
    'background:#11183d;color:#fff;font:600 11px ui-monospace,monospace;padding:10px 12px;line-height:1.5';

  // The fold itself, drawn, so it can be seen as well as read.
  const line = document.createElement('div');
  line.style.cssText =
    'position:fixed;left:0;right:0;height:2px;background:#ff3b30;z-index:2147483645;pointer-events:none';

  const scan = () => {
    const viewportHeight = window.innerHeight;
    /*
      The bottom navigation floats over the page, so the last ~110px of the
      viewport are not usable even though they are visible. Measuring against
      the raw viewport would call a page 「fits」 while its last row sat under
      the bar — which is the bug this app already had once.
    */
    const nav = document.querySelector('nav');
    const navTop = nav ? nav.getBoundingClientRect().top : viewportHeight;
    const fold = Math.min(viewportHeight, navTop);

    const blocks = Array.from(document.querySelectorAll('main > section, main > div, header'));
    const findings = findBelowFold(
      blocks,
      fold,
      element => element.getBoundingClientRect().bottom + window.scrollY,
    ).slice(0, 8);

    line.style.top = `${fold}px`;
    const overflow = Math.round(document.documentElement.scrollHeight - viewportHeight);
    const where = displayContext() === 'standalone' ? '主畫面 app' : '瀏覽器（含網址列）';
    panel.textContent = [
      `${where} · viewport ${Math.round(viewportHeight)} · fold ${Math.round(fold)} · page ${Math.round(document.documentElement.scrollHeight)} · 需捲動 ${Math.max(0, overflow)}px`,
      ...findings.map(f => `  ↓${f.overhang}px  ${f.description}`),
      findings.length === 0 ? '  ✓ 這一頁的區塊都在摺線以上' : '',
    ].filter(Boolean).join('\n');
    panel.style.whiteSpace = 'pre';
  };

  document.body.appendChild(panel);
  document.body.appendChild(line);
  scan();
  const timer = window.setInterval(scan, 500);
  window.addEventListener('resize', scan);

  return () => {
    window.clearInterval(timer);
    window.removeEventListener('resize', scan);
    panel.remove();
    line.remove();
  };
};
