import React, { useMemo, useState } from 'react';
import { ShoppingItem } from '../types';
import { Check, Minus, Plus, ShoppingBag, Trash2, Circle } from 'lucide-react';
import ShoppingScreenshotIntake from './ShoppingScreenshotIntake';

/**
 * 購物清單 — what to buy, where, and how many.
 *
 * 「我需要購物清單！」 and 「購物清單是最需要的」, against a mock with categories
 * across the top, 必買／想買 on the rows, the shop under the name and a
 * quantity stepper on the right. The list held a name and a tick.
 *
 * The categories are the traveller's own words rather than a fixed set: a trip
 * to Tokyo has 美妝保養 and 伴手禮, a trip to Seoul has neither, and a list
 * that offers the wrong seven buckets is a list people stop filing into. The
 * chips are built from what is actually in the list.
 *
 * 必買 is never a default. Absent means nobody said, which is most of a list,
 * and a 想買 that reads as 必買 is a shop somebody makes a detour for.
 */

interface Props {
  title: string;
  shoppingList: ShoppingItem[];
  onAddItem: (name: string) => void;
  onRemoveItem: (id: string) => void;
  /**
   * Records the item as an expense. Optional on purpose: the 規劃 tab shows the
   * shopping list without any accounting entry point, so it simply omits this
   * and the 購買 button is not rendered.
   */
  onPurchaseItem?: (item: ShoppingItem) => void;
  /**
   * Changes one field on one item — quantity, priority, category, shop.
   *
   * Omitted and none of those controls appear: a stepper that cannot save is
   * the dead tap this app has spent two days removing.
   */
  onUpdateItem?: (id: string, patch: Partial<ShoppingItem>) => void;
  /**
   * Adds rows read out of screenshots.
   *
   * 「上傳截圖 → AI 辨識整理 → 加入購物清單」. Omitted and the uploader is not
   * shown, like every other control on this panel.
   */
  onAddFromScreenshots?: (items: ShoppingItem[]) => void;
  phase?: ShoppingItem['phase'];
  makeId?: () => string;
}

/** The chip every list has, whatever is in it. */
const ALL = '全部';

const ShoppingListPanel: React.FC<Props> = ({
  title,
  shoppingList,
  onAddItem,
  onRemoveItem,
  onPurchaseItem,
  onUpdateItem,
  onAddFromScreenshots,
  phase,
  makeId,
}) => {
  const [newItemName, setNewItemName] = useState('');
  const [filter, setFilter] = useState(ALL);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newItemName.trim()) {
      onAddItem(newItemName.trim());
      setNewItemName('');
    }
  };

  /*
    The categories in this list, in the order they first appear, with counts.
    Built from the items rather than declared, so the chips describe the list
    instead of asking it to fit somebody else's seven buckets.
  */
  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    shoppingList.forEach(item => {
      const key = item.category?.trim();
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [[ALL, shoppingList.length] as const, ...counts.entries()];
  }, [shoppingList]);

  const shown = filter === ALL
    ? shoppingList
    : shoppingList.filter(item => item.category?.trim() === filter);

  const pendingItems = shown.filter(i => !i.isPurchased);
  const purchasedItems = shown.filter(i => i.isPurchased);

  const quantityOf = (item: ShoppingItem) => (item.quantity && item.quantity > 0 ? item.quantity : 1);

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-50 bg-gray-50/50 p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-700">{title}</h3>

        {/* The categories this list actually has. */}
        {chips.length > 1 && (
          <div data-testid="shopping-categories" className="mb-2 flex gap-1.5 overflow-x-auto">
            {chips.map(([label, count]) => (
              <button
                key={label}
                type="button"
                data-testid={`shopping-category-${label}`}
                aria-pressed={filter === label}
                onClick={() => setFilter(label)}
                className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black ${
                  filter === label ? 'bg-[#5b3df5] text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'
                }`}
              >
                {label} {count}
              </button>
            ))}
          </div>
        )}

        {onAddFromScreenshots && phase && makeId && (
          <div className="mb-2">
            <ShoppingScreenshotIntake phase={phase} makeId={makeId} onAdd={onAddFromScreenshots} />
          </div>
        )}

        <form onSubmit={handleAddSubmit} className="flex gap-2">
          <input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="想買什麼？(如: 轉接頭、伴手禮)"
            data-testid="shopping-add-input"
            className="focus:ring-brand-500 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2"
          />
          <button
            type="submit"
            disabled={!newItemName.trim()}
            className="bg-brand-600 hover:bg-brand-700 rounded-lg p-2 text-white transition-colors disabled:opacity-50"
          >
            <Plus size={18} />
          </button>
        </form>
      </div>

      <div className="divide-y divide-gray-100">
        {shown.length === 0 ? (
          <div className="py-6 text-center text-xs text-gray-400">
            {shoppingList.length === 0 ? '清單是空的，新增一些項目吧！' : `「${filter}」還沒有東西。`}
          </div>
        ) : (
          <>
            {pendingItems.map(item => (
              <div key={item.id} data-testid={`shopping-item-${item.id}`} className="group p-3 transition-colors hover:bg-gray-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Circle size={18} className="mt-0.5 shrink-0 text-gray-300" />
                    {/*
                      「要找圖片」 — the screenshot this row was read out of. It
                      is the only picture of a wanted thing this app can
                      honestly show: a stock photo found on the web is
                      somebody else's photograph captioned as his list.
                    */}
                    {item.photo && (
                      <img
                        src={item.photo}
                        alt=""
                        loading="lazy"
                        data-testid={`shopping-photo-${item.id}`}
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-800">{item.name}</span>
                        {/*
                          Said only when somebody said it. Absent is not 想買
                          and certainly not 必買 — see `ShoppingItem.priority`.
                        */}
                        {item.priority && (
                          <button
                            type="button"
                            disabled={!onUpdateItem}
                            data-testid={`shopping-priority-${item.id}`}
                            onClick={() => onUpdateItem?.(item.id, {
                              priority: item.priority === 'must' ? 'want' : 'must',
                            })}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                              item.priority === 'must'
                                ? 'bg-rose-50 text-rose-600'
                                : 'bg-violet-50 text-violet-600'
                            }`}
                          >
                            {item.priority === 'must' ? '必買' : '想買'}
                          </button>
                        )}
                      </div>
                      {item.shop && (
                        <div className="mt-0.5 text-[11px] text-slate-400">@ {item.shop}</div>
                      )}
                      {item.description && (
                        <div className="mt-0.5 text-[11px] leading-4 text-slate-500">{item.description}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {/* How many, when the caller can remember the answer. */}
                    {onUpdateItem && (
                      <span className="mr-1 flex items-center gap-1 rounded-lg bg-slate-50 px-1 py-0.5">
                        <button
                          type="button"
                          aria-label={`${item.name} 減少一個`}
                          data-testid={`shopping-less-${item.id}`}
                          disabled={quantityOf(item) <= 1}
                          onClick={() => onUpdateItem(item.id, { quantity: quantityOf(item) - 1 })}
                          className="p-1 text-slate-400 disabled:opacity-30"
                        >
                          <Minus size={12} />
                        </button>
                        <span data-testid={`shopping-quantity-${item.id}`} className="min-w-4 text-center text-xs font-black text-slate-700">
                          {quantityOf(item)}
                        </span>
                        <button
                          type="button"
                          aria-label={`${item.name} 增加一個`}
                          data-testid={`shopping-more-${item.id}`}
                          onClick={() => onUpdateItem(item.id, { quantity: quantityOf(item) + 1 })}
                          className="p-1 text-slate-400"
                        >
                          <Plus size={12} />
                        </button>
                      </span>
                    )}
                    {onPurchaseItem && (
                      <button
                        onClick={() => onPurchaseItem(item)}
                        className="bg-brand-50 text-brand-600 hover:bg-brand-100 flex items-center gap-1 rounded px-2 py-1.5 text-xs font-bold transition-colors"
                        title="記錄為支出"
                      >
                        <ShoppingBag size={14} /> 購買
                      </button>
                    )}
                    <button
                      onClick={() => onRemoveItem(item.id)}
                      className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {purchasedItems.length > 0 && (
              <div className="bg-gray-50/50">
                {purchasedItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-3 opacity-60">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-green-100 p-0.5 text-green-600">
                        <Check size={14} />
                      </div>
                      <span className="text-sm text-gray-500 line-through decoration-gray-400">{item.name}</span>
                    </div>
                    <button
                      onClick={() => onRemoveItem(item.id)}
                      className="rounded p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ShoppingListPanel;
