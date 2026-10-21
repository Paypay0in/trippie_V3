import React, { useMemo, useState } from 'react';
import { ShoppingItem } from '../types';
import { Check, ChevronDown, ImageIcon, Loader2, Minus, Plus, Search, ShoppingBag, Trash2, Circle } from 'lucide-react';
import { findProductImage, sourceLabel } from '../services/productImageService';
import { byRegion, checkPrices, PriceCheck, quoteLabel } from '../services/priceCheckService';
import { boughtFromReceipts } from '../services/boughtFromReceipt';
import { Expense } from '../types';
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
  /**
   * The trip's bills, so a receipt can say what was already bought.
   *
   * 「之後若用戶拍收據的時候 就要自動對比購物清單中的東西是否已經買到」. The
   * comparison is automatic; the ticking is not. See `boughtFromReceipt`.
   */
  expenses?: Expense[];
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
  expenses = [],
}) => {
  const [newItemName, setNewItemName] = useState('');
  const [filter, setFilter] = useState(ALL);
  /** 「搜尋商品、品牌或店家」 — one box over the three fields a row has. */
  const [query, setQuery] = useState('');
  /** Category headings the traveller has folded away. */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  /** Which row is having a picture looked up. 「在網路上抓圖也很有幫助」 */
  const [findingImage, setFindingImage] = useState<string | null>(null);
  /*
    Prices, held for the page and never written onto the item.

    「也要幫忙比價」 — a price read today is a fact about today. Stored on the
    row it becomes a claim about a day that has passed, which is the reason
    menu prices are not averaged across years either.
  */
  const [prices, setPrices] = useState<Record<string, PriceCheck>>({});
  const [checking, setChecking] = useState<string | null>(null);

  const comparePrices = (item: ShoppingItem) => {
    setChecking(item.id);
    void checkPrices({ name: item.name, brand: item.description })
      .then(found => setPrices(current => ({ ...current, [item.id]: found })))
      .finally(() => setChecking(null));
  };

  /*
    A picture from the web, with the page it came from kept beside it.

    Asked for one row at a time rather than for the list: it is a search per
    product, and a list of twenty would be twenty searches to fill squares
    nobody asked to see.
  */
  const lookUpImage = (item: ShoppingItem) => {
    if (!onUpdateItem) return;
    setFindingImage(item.id);
    void findProductImage({ name: item.name, brand: item.description })
      .then(found => {
        if (found) onUpdateItem(item.id, { photo: found.imageUrl, photoSource: found.pageUrl });
      })
      .finally(() => setFindingImage(null));
  };

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

  /*
    The search reads the name, what was written under it and where to buy —
    「搜尋商品、品牌或店家」. The brand lives in `description` （see
    `candidateToShoppingItem`）, so one box over those three fields covers all
    three of the things the placeholder promises.
  */
  const wanted = query.trim().toLocaleLowerCase();
  const shown = shoppingList
    .filter(item => (filter === ALL ? true : item.category?.trim() === filter))
    .filter(item => (wanted
      ? [item.name, item.description, item.shop]
        .some(field => (field || '').toLocaleLowerCase().includes(wanted))
      : true));

  const purchasedItems = shown.filter(i => i.isPurchased);

  const quantityOf = (item: ShoppingItem) => (item.quantity && item.quantity > 0 ? item.quantity : 1);

  /*
    已買 N / M, over the whole list rather than the filter.

    A progress bar that moved when somebody tapped a category chip would be
    measuring the filter instead of the shopping.
  */
  const bought = shoppingList.filter(item => item.isPurchased).length;
  const total = shoppingList.length;
  const percent = total > 0 ? Math.round((bought / total) * 100) : 0;

  /** The pending rows grouped under the heading they were filed under. */
  const sections = useMemo(() => {
    const groups = new Map<string, ShoppingItem[]>();
    shown.filter(item => !item.isPurchased).forEach(item => {
      const key = item.category?.trim() || '未分類';
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });
    return [...groups.entries()];
  }, [shown]);

  /*
    Rows a receipt says were bought, offered rather than ticked.

    An unticked row that was bought costs a glance at the shelf; a ticked row
    that was not costs the trip home without the thing. The two mistakes are
    not the same size, so the screen asks.
  */
  const probablyBought = useMemo(
    () => (onUpdateItem ? boughtFromReceipts(shoppingList, expenses) : []),
    [shoppingList, expenses, onUpdateItem],
  );

  const fold = (label: string) => setCollapsed(current => {
    const next = new Set(current);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-50 bg-gray-50/50 p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-700">{title}</h3>

        {/*
          已買 N / M, over the whole list rather than whatever is filtered.
          A bar that moved when somebody tapped a chip would be measuring the
          filter instead of the shopping.
        */}
        {total > 0 && (
          <div data-testid="shopping-progress" className="mb-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
            <div className="flex items-center justify-between text-[11px] font-black text-[#11183d]">
              <span className="flex items-center gap-1.5">
                <ShoppingBag size={13} className="text-[#5b3df5]" />已買 {bought} / {total}
              </span>
              <span className="text-slate-400">{percent}%</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full bg-[#5b3df5]" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}

        {total > 0 && (
          <label className="mb-2 flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 ring-1 ring-slate-200">
            <Search size={13} className="shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="搜尋商品、品牌或店家"
              aria-label="搜尋商品、品牌或店家"
              data-testid="shopping-search"
              className="min-w-0 flex-1 text-xs text-[#11183d] outline-none placeholder:text-slate-300"
            />
          </label>
        )}

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

        {probablyBought.length > 0 && (
          <div data-testid="shopping-bought-offer" className="mb-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-2.5">
            <p className="text-[11px] font-black text-emerald-800">
              收據上出現了這 {probablyBought.length} 樣，已經買到了嗎？
            </p>
            <div className="mt-1.5 space-y-1">
              {probablyBought.map(({ item, line, date }) => (
                <div key={item.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-emerald-900">
                    {item.name}
                    <span className="ml-1 text-emerald-600">
                      · {date.slice(5).replace('-', '/')} {line}
                    </span>
                  </span>
                  <button
                    type="button"
                    data-testid={`shopping-mark-bought-${item.id}`}
                    onClick={() => onUpdateItem?.(item.id, { isPurchased: true })}
                    className="shrink-0 rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-black text-white"
                  >
                    標記已買
                  </button>
                </div>
              ))}
            </div>
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
            {sections.map(([label, items]) => (
              <section key={label} data-testid={`shopping-section-${label}`}>
                {/*
                  Grouped under the heading it was filed under, foldable.
                  「未分類」 is a real heading rather than a silent bucket: a row
                  nobody filed is still a row somebody has to buy.
                */}
                <button
                  type="button"
                  data-testid={`shopping-section-toggle-${label}`}
                  aria-expanded={!collapsed.has(label)}
                  onClick={() => fold(label)}
                  className="flex w-full items-center justify-between bg-slate-50/70 px-3 py-1.5 text-[11px] font-black text-slate-500"
                >
                  <span>{label}（{items.length}）</span>
                  <ChevronDown size={13} className={collapsed.has(label) ? '-rotate-90' : ''} />
                </button>

                {!collapsed.has(label) && items.map(item => (
              <div key={item.id} data-testid={`shopping-item-${item.id}`} className="group p-3 transition-colors hover:bg-gray-50">
                {/*
                  「排版很糟糕」 — the name shared its line with a stepper, a
                  購買 button and a bin, which on a phone left it about a third
                  of the width: 「ReLUCE glitter serum fragrance shiny freesia」
                  came out as six lines of one or two words.

                  The controls drop to their own row. A product name is the
                  thing being read; the buttons are the thing being pressed,
                  and they do not need to be beside it.
                */}
                <div>
                  <div className="flex min-w-0 items-start gap-3">
                    <Circle size={18} className="mt-0.5 shrink-0 text-gray-300" />
                    {/*
                      「要找圖片」 — the screenshot this row was read out of. It
                      is the only picture of a wanted thing this app can
                      honestly show.
                    */}
                    {item.photo ? (
                      <span className="shrink-0">
                        <img
                          src={item.photo}
                          alt=""
                          loading="lazy"
                          data-testid={`shopping-photo-${item.id}`}
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                        {/*
                          Where the picture is from, when it is not his own
                          screenshot. A product shot nobody can place is
                          believed because it looks like a product shot.
                        */}
                        {item.photoSource && sourceLabel(item.photoSource) && (
                          <a
                            href={item.photoSource}
                            target="_blank"
                            rel="noreferrer"
                            data-testid={`shopping-photo-source-${item.id}`}
                            className="mt-0.5 block max-w-[2.5rem] truncate text-[9px] text-slate-400 underline"
                          >
                            {sourceLabel(item.photoSource)}
                          </a>
                        )}
                      </span>
                    ) : onUpdateItem ? (
                      <button
                        type="button"
                        aria-label={`幫 ${item.name} 找商品圖片`}
                        data-testid={`shopping-find-photo-${item.id}`}
                        disabled={findingImage === item.id}
                        onClick={() => lookUpImage(item)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 text-slate-400"
                      >
                        {findingImage === item.id
                          ? <Loader2 size={14} className="animate-spin" />
                          : <ImageIcon size={14} />}
                      </button>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium leading-5 text-gray-800">{item.name}</span>
                        {/* 待購買, said on every unbought row. */}
                        <span data-testid={`shopping-status-${item.id}`} className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-black text-rose-500">
                          待購買
                        </span>
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
                      {item.description && (
                        <div className="mt-0.5 text-[11px] leading-4 text-slate-500">{item.description}</div>
                      )}
                      {item.shop && (
                        <div className="mt-0.5 text-[11px] text-slate-400">@ {item.shop}</div>
                      )}

                      {/*
                        台灣 and 日本 side by side, each quote with the page it
                        was read from. No 「這邊比較便宜」: that needs a rate, a
                        tax-refund assumption and a view on baggage, and a
                        sentence this app wrote would be read as advice.
                      */}
                      {!prices[item.id] ? (
                        <button
                          type="button"
                          data-testid={`shopping-compare-${item.id}`}
                          disabled={checking === item.id}
                          onClick={() => comparePrices(item)}
                          className="mt-1 text-[11px] font-black text-[#5b3df5] disabled:opacity-60"
                        >
                          {checking === item.id ? '查價中…' : '比一下台／日價格'}
                        </button>
                      ) : byRegion(prices[item.id].quotes).length === 0 ? (
                        /*
                          The server's own sentence when it has one. 「查不到這
                          個商品的售價」 says stop looking; 「今天的查詢次數用完
                          了」 says try tomorrow, and for weeks only the first
                          was ever shown.
                        */
                        <p data-testid={`shopping-prices-empty-${item.id}`} className="mt-1 text-[11px] text-slate-400">
                          {prices[item.id].error || '查不到這個商品的售價。'}
                        </p>
                      ) : (
                        <div data-testid={`shopping-prices-${item.id}`} className="mt-1 space-y-0.5">
                          {byRegion(prices[item.id].quotes).map(([region, found]) => (
                            <div key={region} className="flex flex-wrap items-baseline gap-1.5 text-[11px]">
                              <span className="font-black text-slate-500">{region}</span>
                              {found.map(quote => (
                                <a
                                  key={quote.sourceUrl}
                                  href={quote.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-slate-600 underline"
                                >
                                  {quote.shop ? `${quote.shop} ` : ''}{quoteLabel(quote)}
                                </a>
                              ))}
                            </div>
                          ))}
                          {/* When it was read, so the reader can judge it. */}
                          {prices[item.id].readAt && (
                            <p className="text-[10px] text-slate-400">
                              {prices[item.id].readAt.slice(0, 10).replace(/-/g, '/')} 查到的價格，僅供參考
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
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
                    {/*
                      What it is expected to cost, when somebody has said.
                      Never read off a screenshot and never guessed — see
                      `/api/shopping/parse-image`, which reads no prices at
                      all, and §6 of docs/PRODUCT.md for why.
                    */}
                    {typeof item.estimatedAmount === 'number' && item.estimatedAmount > 0 && (
                      <span data-testid={`shopping-amount-${item.id}`} className="text-[11px] font-bold text-slate-400">
                        約 {item.estimatedCurrency || 'NT$'} {Math.round(item.estimatedAmount).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
                ))}
              </section>
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
