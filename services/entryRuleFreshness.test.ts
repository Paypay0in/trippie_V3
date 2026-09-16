import { describe, expect, it } from 'vitest';
import { isGuidanceOutdated, latestYearMentioned } from './entryRuleFreshness';

const kEta =
  '持台灣護照旅客前往韓國旅遊享有免簽證待遇。雖原本須申請 K-ETA，但韓國政府已公告自 2023 年 4 月 1 日至 2024 年 12 月 31 日，豁免包括台灣在內的 22 個國家。';

describe('entry rule freshness', () => {
  it('takes the latest year the text states', () => {
    expect(latestYearMentioned(kEta)).toBe(2024);
  });

  it('flags a waiver that ended before the trip departs', () => {
    expect(isGuidanceOutdated(kEta, '2026-09-02')).toBe(true);
  });

  it('says nothing about guidance that still covers the trip', () => {
    expect(isGuidanceOutdated(kEta, '2024-06-01')).toBe(false);
    expect(isGuidanceOutdated('2026 年起適用新制', '2026-09-02')).toBe(false);
  });

  it('claims nothing without a stated year or a departure date', () => {
    // Silence is correct here: an unprompted warning on rules that never
    // mentioned a period would train people to ignore the warning.
    expect(isGuidanceOutdated('入境時需填寫入境卡。', '2026-09-02')).toBe(false);
    expect(isGuidanceOutdated(kEta, '')).toBe(false);
    expect(isGuidanceOutdated(kEta, undefined)).toBe(false);
  });
});
