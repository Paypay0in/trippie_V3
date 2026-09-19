import { describe, expect, it } from 'vitest';
import { ShoppingItem } from '../types';
import {
  defaultAssistanceNeeds,
  defaultLanguageNeeds,
  defaultRequestTitle,
  defaultServiceCategory,
} from './serviceRequestDefaults';

const task = (name: string): ShoppingItem => ({ id: name, name, isPurchased: false, phase: 'pre' });

describe('service request defaults', () => {
  it('pre-selects the local language', () => {
    expect(defaultLanguageNeeds('日本')).toEqual(['日文']);
    expect(defaultLanguageNeeds('韓國')).toEqual(['韓文']);
  });

  it('suggests no language where there is no unambiguous one', () => {
    // Guessing a language for a country with several would put a claim in the
    // traveller's request that they never made.
    expect(defaultLanguageNeeds('瑞士')).toEqual([]);
    expect(defaultLanguageNeeds(undefined)).toEqual([]);
  });

  it('reads the category off what the tasks ask for', () => {
    expect(defaultServiceCategory([task('預約橫濱 Snova 室內滑雪場')])).toBe('booking');
    expect(defaultServiceCategory([task('看診時的中日文翻譯')])).toBe('translation');
    expect(defaultServiceCategory([task('想找人聊聊行程規劃')])).toBe('consultation');
  });

  it('falls back to other rather than picking a category at random', () => {
    expect(defaultServiceCategory([task('把行李寄回台灣')])).toBe('other');
  });

  it('can select more than one kind of help', () => {
    // Booking a Japanese venue is a phone call and a translation at once.
    const needs = defaultAssistanceNeeds([task('預約滑雪場'), task('需要日文翻譯陪同')]);
    expect(needs).toEqual(expect.arrayContaining(['phone_call', 'translation', 'on_site']));
  });

  it('selects nothing when the tasks say nothing about how', () => {
    expect(defaultAssistanceNeeds([task('把行李寄回台灣')])).toEqual([]);
  });

  it('names a request after its tasks', () => {
    expect(defaultRequestTitle([task('預約滑雪場')])).toBe('預約滑雪場');
    expect(defaultRequestTitle([task('預約滑雪場'), task('查詢裝備租借')])).toBe('預約滑雪場 等 2 項');
    expect(defaultRequestTitle([])).toBe('旅行協助');
  });
});
