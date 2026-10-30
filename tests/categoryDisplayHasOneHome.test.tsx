import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { Category, PaymentMethod } from '../types';
import {
  STORED_DISPLAY_VALUES,
  categoryLabel,
  displayLabel,
  paymentMethodLabel,
} from '../services/categoryDisplay';

/*
  The stored values are the contract with every expense already recorded.

  `Category.FLIGHT = '機票'` is written to localStorage and to Supabase, so the
  Chinese literal IS the persisted value. Translating the enum orphans history
  instead of translating it. These tests fail if anybody makes English the
  stored value, or gives a label a second home.
*/

const grep = (pattern: string): string[] => {
  try {
    return execFileSync(
      'grep',
      ['-rln', '--include=*.ts', '--include=*.tsx', '-e', pattern, '.'],
      { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)
      .filter(path => !path.includes('node_modules'))
      // This file names the strings it forbids, so it would always match itself.
      .filter(path => !path.endsWith('categoryDisplayHasOneHome.test.tsx'));
  } catch {
    return [];
  }
};

describe('stored enum values stay immutable', () => {
  it('names all 24 stored values', () => {
    expect(STORED_DISPLAY_VALUES).toHaveLength(24);
    expect(new Set(STORED_DISPLAY_VALUES).size).toBe(24);
  });

  it('keeps the exact persisted strings', () => {
    expect(Category.FLIGHT).toBe('機票');
    expect(Category.VISA).toBe('簽證');
    expect(Category.INSURANCE).toBe('保險');
    expect(Category.SHOPPING).toBe('購物');
    expect(PaymentMethod.CREDIT_CARD).toBe('信用卡');
    expect(PaymentMethod.IC_CARD).toBe('交通卡');
  });
});

describe('canonical display labels', () => {
  it('shows the stored string itself in zh-Hant', () => {
    for (const stored of STORED_DISPLAY_VALUES) {
      expect(displayLabel(stored)).toBe(stored);
    }
  });

  it('uses the Founder-decided zh-Hant wording for the three divergent labels', () => {
    expect(categoryLabel(Category.VISA)).toBe('簽證');
    expect(categoryLabel(Category.INSURANCE)).toBe('保險');
    expect(categoryLabel(Category.SHOPPING)).toBe('購物');
  });

  it('has an English label for every stored value, and none of them is Chinese', () => {
    for (const stored of STORED_DISPLAY_VALUES) {
      const english = displayLabel(stored, 'en');
      expect(english).not.toBe(stored);
      expect(english).not.toMatch(/[一-鿿]/);
    }
  });

  it('reads a value written by a newer build as itself rather than blank', () => {
    expect(displayLabel('太空旅行', 'en')).toBe('太空旅行');
    expect(paymentMethodLabel('加密貨幣')).toBe('加密貨幣');
  });
});

describe('the label table has one home', () => {
  // The quotes matter: prose explaining the old divergence is fine, a live
  // string literal spelling it is the second home coming back.
  it('spells the old WalletPreScreen-only labels nowhere in the app', () => {
    expect(grep("'簽證／入境費'")).toEqual([]);
    expect(grep("'伴手禮／購物'")).toEqual([]);
    expect(grep("'旅遊保險'").filter(path => path.startsWith('./components/'))).toEqual([]);
  });

  it('defines the English category labels in exactly one module', () => {
    expect(grep("'Airport transfer'")).toEqual(['./services/categoryDisplay.ts']);
  });
});
