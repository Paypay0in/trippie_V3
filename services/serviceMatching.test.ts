import { describe, expect, it } from 'vitest';
import { MarketplaceService } from '../types';
import { matchServices } from './serviceMatching';

const service = (
  id: string,
  title: string,
  description: string,
  rating = 4.5,
): MarketplaceService => ({
  id,
  providerName: 'Kenji',
  serviceType: 'BOOKING',
  title,
  description,
  price: 1200,
  currency: 'JPY',
  rating,
});

const services = [
  service('ski', '日本滑雪場代訂', '幫你打電話跟雪場確認雪具租借'),
  service('trans', '東京醫療翻譯陪同', '看診、醫美諮詢的中日文翻譯'),
  service('guide', '京都一日嚮導', '帶你走一天的寺院路線'),
];

describe('service matching', () => {
  it('puts the provider who does the thing you asked for first', () => {
    const matches = matchServices({
      request: { topic: '預約橫濱 Snova 室內滑雪場', destination: '日本' },
      services,
    });
    expect(matches[0].service.id).toBe('ski');
  });

  it('matches a shorter word inside a longer one', () => {
    // 滑雪場 in the task, 滑雪 in the listing — the same need either way.
    const matches = matchServices({ request: { topic: '滑雪場雪具租借' }, services });
    expect(matches.map(m => m.service.id)).toContain('ski');
  });

  it('says why it matched, so the list is not a black box', () => {
    const matches = matchServices({ request: { topic: '醫美諮詢' }, services });
    expect(matches[0].service.id).toBe('trans');
    expect(matches[0].matchedOn).toContain('醫美');
  });

  it('offers nobody rather than somebody irrelevant', () => {
    // Padding an empty result with plausible providers is the one thing this
    // screen must never do.
    expect(matchServices({ request: { topic: '換匯手續費比較' }, services })).toEqual([]);
  });

  it('does not match on the destination alone', () => {
    // Every Japan listing says 日本; scoring it would rank the whole tab a hit.
    expect(matchServices({ request: { topic: '日本', destination: '日本' }, services })).toEqual([]);
  });

  it('has nothing to match on for an empty request', () => {
    expect(matchServices({ request: { topic: '   ' }, services })).toEqual([]);
  });

  it('breaks a tie by rating', () => {
    const tied = [service('a', '滑雪代訂', '', 4.1), service('b', '滑雪代訂', '', 4.9)];
    const matches = matchServices({ request: { topic: '滑雪' }, services: tied });
    expect(matches[0].service.id).toBe('b');
  });
});
