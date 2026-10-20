import { describe, expect, it } from 'vitest';
import { powerAdviceLines, powerHeadline, powerProfileFor } from './powerAndPlugs';

/**
 * 「每個國家在行前 都要提醒電壓跟插座這件事」, and then 「我目前設定是持有中國護照
 * 因此這邊寫台灣很奇怪！…只顯示旅遊目的地的！」.
 */
describe('powerProfileFor', () => {
  it('knows Korea', () => {
    expect(powerProfileFor('韓國')).toMatchObject({ voltage: 220, frequency: 60, plugs: ['C', 'F'] });
  });

  it('knows Mexico', () => {
    expect(powerProfileFor('墨西哥')).toMatchObject({ voltage: 127, plugs: ['A', 'B'] });
  });

  /* 「Japan」 and 「日本」 are the same country. See `countryIdentity`. */
  it('answers the same for either spelling', () => {
    expect(powerProfileFor('Japan')).toEqual(powerProfileFor('日本'));
  });

  it('says nothing about a country it has never heard of', () => {
    expect(powerProfileFor('瓦干達')).toBeUndefined();
    expect(powerProfileFor('')).toBeUndefined();
  });
});

describe('what it says on the screen', () => {
  it('leads with the voltage and the frequency', () => {
    expect(powerHeadline(powerProfileFor('墨西哥')!)).toBe('127V · 60Hz');
  });

  it('names the socket shapes', () => {
    expect(powerAdviceLines(powerProfileFor('韓國')!)[0]).toContain('C、F 型');
  });

  /*
    The appliance split is the useful part and it survives having no home
    country, because it is a fact about the appliance rather than about the
    traveller.
  */
  it('separates what copes with any voltage from what does not', () => {
    const lines = powerAdviceLines(powerProfileFor('韓國')!);
    expect(lines[1]).toContain('100–240V');
    expect(lines[1]).toContain('吹風機');
  });

  /*
    Nothing in here compares the destination to anywhere else. The first
    version hardcoded 台灣 as home, which is a guess about the reader — and the
    reader who found it was travelling on a Chinese passport.
  */
  it('never mentions a country the traveller did not name', () => {
    const said = powerAdviceLines(powerProfileFor('墨西哥')!).join(' ');
    expect(said).not.toContain('台灣');
    expect(said).not.toContain('台規');
  });

  it('carries the country\'s own caveat', () => {
    expect(powerAdviceLines(powerProfileFor('巴西')!).join('')).toContain('127V 與 220V 並存');
  });

  /* 「回台灣不要出現」 is gone with the comparison: a trip home has a voltage too. */
  it('answers for a destination even when it is where somebody lives', () => {
    expect(powerProfileFor('台灣')).toMatchObject({ voltage: 110, plugs: ['A', 'B'] });
  });
});
