/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { Category } from '../types';
import {
  addCustomCategory,
  categoriesForPhase,
  loadCustomCategories,
  normalizeCategoryName,
  removeCustomCategory,
  saveCustomCategories,
} from './customCategories';

describe('custom categories', () => {
  it('adds a category to the stage it was invented in', () => {
    const next = addCustomCategory({}, 'during', '溫泉');
    expect(next.during).toEqual(['溫泉']);
    expect(next.pre).toBeUndefined();
  });

  it('refuses a name the picker already offers', () => {
    // Two buttons reading 餐飲 would split one trip's food across both.
    expect(normalizeCategoryName('餐飲', 'during', [])).toBeNull();
    expect(addCustomCategory({ during: ['溫泉'] }, 'during', '溫泉').during).toEqual(['溫泉']);
  });

  it('trims, and refuses what is left when it is nothing', () => {
    expect(normalizeCategoryName('  溫泉  ', 'during', [])).toBe('溫泉');
    expect(normalizeCategoryName('   ', 'during', [])).toBeNull();
  });

  it('caps a very long name rather than letting it break the row', () => {
    expect(normalizeCategoryName('溫泉溫泉溫泉溫泉溫泉溫泉溫泉溫泉', 'during', [])?.length).toBe(12);
  });

  it('removes one without touching the others', () => {
    const next = removeCustomCategory({ during: ['溫泉', '潛水'] }, 'during', '溫泉');
    expect(next.during).toEqual(['潛水']);
  });

  it('shows the built-ins first, then the traveller’s own', () => {
    const list = categoriesForPhase('during', { during: ['溫泉'] });
    expect(list[0]).toBe(Category.FOOD);
    expect(list.at(-1)).toBe('溫泉');
  });

  it('survives a corrupted store instead of rendering blank buttons', () => {
    localStorage.setItem('trippie_custom_categories_v1', '{"during":[123,"",{"a":1},"溫泉"]}');
    expect(loadCustomCategories().during).toEqual(['溫泉']);

    localStorage.setItem('trippie_custom_categories_v1', 'not json');
    expect(loadCustomCategories()).toEqual({});
  });

  it('round-trips through storage', () => {
    localStorage.clear();
    saveCustomCategories({ during: ['溫泉'] });
    expect(loadCustomCategories()).toEqual({ during: ['溫泉'] });
  });
});
