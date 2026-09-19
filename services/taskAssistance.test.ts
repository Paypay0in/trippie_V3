import { describe, expect, it } from 'vitest';
import { ShoppingItem } from '../types';
import { classifyTask, eligibleForHumanHelp } from './taskAssistance';

const task = (name: string, extra: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id: name,
  name,
  isPurchased: false,
  phase: 'pre',
  ...extra,
});

describe('task assistance classification', () => {
  it('keeps an official formality with the traveller', () => {
    expect(classifyTask(task('K-ETA 申請', { travelRuleActionType: 'visa_or_eta' }))).toBe('self');
    expect(classifyTask(task('護照有效期限', { travelRuleActionType: 'passport_validity' }))).toBe('self');
  });

  it('treats booking and phoning as work a person can take on', () => {
    expect(classifyTask(task('預約橫濱 Snova 室內滑雪場'))).toBe('human');
    expect(classifyTask(task('聯絡飯店確認寄放行李'))).toBe('human');
  });

  it('still offers help for a booking whose venue site is already linked', () => {
    // A link to the booking page is not the reservation being made — and the
    // page being Japanese-only is the whole reason someone asks for help.
    expect(classifyTask(task('預約橫濱 Snova 室內滑雪場'), { hasResolvedVenue: true })).toBe('human');
  });

  it('answers a lookup in the app once the venue is resolved', () => {
    expect(classifyTask(task('確認 Snow Town Yeti 開場日期'), { hasResolvedVenue: true })).toBe('app');
  });

  it('offers help for a lookup the app could not resolve', () => {
    // Undecided means offering a button, which costs nothing to ignore.
    expect(classifyTask(task('確認 Snow Town Yeti 開場日期'))).toBe('human');
  });

  it('filters a checklist down to what may be published', () => {
    const tasks = [
      task('K-ETA 申請', { travelRuleActionType: 'visa_or_eta' }),
      task('確認 Snow Town Yeti 開場日期'),
      task('預約橫濱 Snova 室內滑雪場'),
    ];
    const names = eligibleForHumanHelp(tasks, new Set(['確認 Snow Town Yeti 開場日期'])).map(t => t.name);
    expect(names).toEqual(['預約橫濱 Snova 室內滑雪場']);
  });
});
