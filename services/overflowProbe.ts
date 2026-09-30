/**
 * Which element is wider than the screen.
 *
 * Horizontal overflow is reported as 「東西都跑版」 and diagnosed by guessing,
 * because the person who can see it cannot read the DOM and the person who can
 * read the DOM cannot see it. jsdom does no layout, so no test here can measure
 * a width. This closes that gap: it runs in the real browser, on the real
 * screen, and names the element.
 *
 * Behind `?overflow=1` rather than always on. A permanent scan costs a layout
 * pass on every screen for something that matters on almost none.
 */

export interface OverflowFinding {
  /** A description a human can search the source for. */
  description: string;
  width: number;
  /** How far past the right edge of the viewport it reaches, in px. */
  overhang: number;
}

const describe = (element: Element): string => {
  const tag = element.tagName.toLowerCase();
  const testId = element.getAttribute('data-testid');
  if (testId) return `${tag}[data-testid="${testId}"]`;

  const text = (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  const classes = (element.getAttribute('class') || '')
    .split(/\s+/)
    // The classes that actually decide width are the ones worth printing;
    // a full Tailwind string is forty tokens of colour and shadow.
    .filter(name => /^(w-|min-w-|max-w-|grid-cols|flex|gap-|px-|p-|overflow)/.test(name))
    .slice(0, 6)
    .join(' ');

  return [tag, classes && `.${classes}`, text && `「${text}」`].filter(Boolean).join(' ');
};

/**
 * Every element reaching past the right edge, worst first.
 *
 * Ancestors of an overflowing element overflow too, so the list is trimmed to
 * those with no overflowing child: the innermost element is the one whose
 * styles need changing, and the twelve wrappers around it are noise.
 */
export const findOverflowing = (root: ParentNode, viewportWidth: number, minOverhang = 1): OverflowFinding[] => {
  const all = Array.from(root.querySelectorAll('*'));
  const offenders = all.filter(element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.right - viewportWidth >= minOverhang;
  });

  const offenderSet = new Set(offenders);
  const innermost = offenders.filter(
    element => !Array.from(element.children).some(child => offenderSet.has(child)),
  );

  return innermost
    .map(element => {
      const rect = element.getBoundingClientRect();
      return {
        description: describe(element),
        width: Math.round(rect.width),
        overhang: Math.round(rect.right - viewportWidth),
      };
    })
    .sort((a, b) => b.overhang - a.overhang);
};

/** `?overflow=1` — turns 「東西都跑版」 into a list of elements and widths. */
export const overflowProbeRequested = (search?: string): boolean => {
  const source = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  return new URLSearchParams(source).get('overflow') === '1';
};

/**
 * Attaches the report to the document, outside React.
 *
 * Rendering it as JSX would put it on one of App's many return paths and it
 * would be missing from most screens — the same mistake the sync banner was
 * written to avoid.
 */
export const startOverflowProbe = (): (() => void) => {
  if (typeof document === 'undefined') return () => {};

  const panel = document.createElement('div');
  panel.id = 'trippie-overflow-probe';
  panel.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;max-height:45vh;overflow:auto;' +
    'background:#11183d;color:#fff;font:600 11px ui-monospace,monospace;padding:10px 12px;line-height:1.5';

  const scan = () => {
    const viewportWidth = document.documentElement.clientWidth;
    const findings = findOverflowing(document.body, viewportWidth).slice(0, 12);

    panel.innerHTML = findings.length === 0
      ? `<b>沒有元素超出畫面</b>（畫面寬 ${viewportWidth}px）`
      : `<b>${findings.length} 個元素超出畫面</b>（畫面寬 ${viewportWidth}px）<br>` +
        findings
          .map(f => `+${f.overhang}px · ${f.width}px · ${f.description.replace(/</g, '&lt;')}`)
          .join('<br>');
  };

  document.body.appendChild(panel);
  scan();

  // Overflow often appears only after data loads or a sheet opens, so the scan
  // repeats rather than reporting the first paint and going quiet.
  const timer = window.setInterval(scan, 1500);
  window.addEventListener('resize', scan);

  return () => {
    window.clearInterval(timer);
    window.removeEventListener('resize', scan);
    panel.remove();
  };
};
