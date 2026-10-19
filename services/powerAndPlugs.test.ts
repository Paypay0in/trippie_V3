import { describe, expect, it } from 'vitest';
import { powerAdviceFor, powerAdviceLines, powerHeadline, powerProfileFor } from './powerAndPlugs';

/** 「每個國家在行前 都要提醒電壓跟插座這件事 目前都沒有提醒到」. */
describe('powerProfileFor', () => {
  it('knows Korea', () => {
    expect(powerProfileFor('韓國')).toMatchObject({ voltage: 220, frequency: 60, plugs: ['C', 'F'] });
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

describe('powerAdviceFor, flying from Taiwan', () => {
  /*
    The two questions are separate. Korea's sockets take neither Taiwanese
    plug, and its voltage is double — both true, for different reasons.
  */
  it('Korea needs an adapter, and the voltage is different', () => {
    const advice = powerAdviceFor('韓國');
    expect(advice).toMatchObject({ needsAdapter: true, differentVoltage: true });
  });

  /* Japan is the case that proves the two are not the same question. */
  it('Japan needs neither', () => {
    expect(powerAdviceFor('日本')).toMatchObject({ needsAdapter: false, differentVoltage: false });
  });

  /* Thailand takes a Taiwanese plug and then puts 220V through it. */
  it('Thailand fits, but at twice the voltage', () => {
    expect(powerAdviceFor('泰國')).toMatchObject({ needsAdapter: false, differentVoltage: true });
  });

  /* The USA is the other way round: same supply, same plug, nothing to do. */
  it('the USA needs nothing', () => {
    expect(powerAdviceFor('美國')).toMatchObject({ needsAdapter: false, differentVoltage: false });
  });

  /* 120 and 110 are the same supply to anything plugged into them. */
  it('does not call a ten per cent difference a different voltage', () => {
    expect(powerAdviceFor('美國')?.differentVoltage).toBe(false);
  });

  it('says nothing about flying home', () => {
    expect(powerAdviceFor('台灣')).toBeUndefined();
  });

  it('says nothing about a country it does not know', () => {
    expect(powerAdviceFor('瓦干達')).toBeUndefined();
  });

  it('takes a different home country when the traveller has one', () => {
    // From Seoul to Tokyo: still a different plug and a different voltage.
    expect(powerAdviceFor('日本', '韓國')).toMatchObject({ needsAdapter: true, differentVoltage: true });
    expect(powerAdviceFor('韓國', '韓國')).toBeUndefined();
  });
});

describe('what it says on the screen', () => {
  it('leads with the voltage and the socket', () => {
    expect(powerHeadline(powerProfileFor('韓國')!)).toBe('220V · C/F 型插座');
  });

  it('names what actually needs a converter, rather than just saying 要帶變壓器', () => {
    const lines = powerAdviceLines(powerAdviceFor('韓國')!);
    expect(lines[0]).toContain('轉接頭');
    expect(lines[1]).toContain('吹風機');
    expect(lines[1]).toContain('100–240V');
  });

  it('says plainly when there is nothing to do', () => {
    const lines = powerAdviceLines(powerAdviceFor('日本')!);
    expect(lines[0]).toContain('不用轉接頭');
    expect(lines[1]).toContain('可以直接用');
  });

  it('carries the country\'s own caveat', () => {
    expect(powerAdviceLines(powerAdviceFor('巴西')!).join('')).toContain('127V 與 220V 並存');
  });
});
