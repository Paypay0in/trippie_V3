import React, { useMemo, useState } from 'react';
import { ShoppingItem } from '../types';
import {
  Check,
  ChevronDown,
  Filter,
  ImageIcon,
  Loader2,
  MapPin,
  Minus,
  MoreHorizontal,
  Plus,
  Search,
  ShoppingBag,
  Tag,
  Trash2,
} from 'lucide-react';
import { findProductImage, sourceLabel } from '../services/productImageService';
import PhotoLightbox from './PhotoLightbox';
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
  /** The product picture being looked at, full screen. 「點擊照片要能變大」. */
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  /*
    The funnel beside the search box. 「我之後可以篩選商品金額」.

    A range over 約 NT$ rather than a sort: the question a shopping list gets
    asked on the way to the counter is 「有什麼是我還沒買、而且不貴的」, and a
    sorted list still makes somebody scroll past the expensive half.
  */
  const [amountOpen, setAmountOpen] = useState(false);
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  /** Which row has its 「⋯」 open. One at a time; a second tap closes it. */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  /** The add form, behind 新增商品 rather than always open. */
  const [adding, setAdding] = useState(false);
  /** 分類管理 — renaming the headings this list actually has. */
  const [managing, setManaging] = useState(false);

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

  /*
    The 金額 range, when one has been typed. Either end on its own is a range.

    A row nobody has priced is not 「0 元」 and is not 「貴」: it is unknown, so
    it leaves the list while a range is set rather than being sorted into one
    end of it. Said on the screen, because a row vanishing without a reason is
    the way a list loses something.
  */
  const low = Number(minAmount.trim());
  const high = Number(maxAmount.trim());
  const hasLow = minAmount.trim() !== '' && Number.isFinite(low);
  const hasHigh = maxAmount.trim() !== '' && Number.isFinite(high);
  const filteringAmount = hasLow || hasHigh;

  const withinAmount = (item: ShoppingItem) => {
    if (!filteringAmount) return true;
    const amount = item.estimatedAmount;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) return false;
    if (hasLow && amount < low) return false;
    if (hasHigh && amount > high) return false;
    return true;
  };

  const shown = shoppingList
    .filter(item => (filter === ALL ? true : item.category?.trim() === filter))
    .filter(item => (wanted
      ? [item.name, item.description, item.shop]
        .some(field => (field || '').toLocaleLowerCase().includes(wanted))
      : true))
    .filter(withinAmount);

  /** How many the range is hiding, so the list can say so rather than shrink. */
  const unpricedHidden = filteringAmount
    ? shoppingList.filter(item => typeof item.estimatedAmount !== 'number').length
    : 0;

  const quantityOf = (item: ShoppingItem) => (item.quantity && item.quantity > 0 ? item.quantity : 1);

  /*
    已買 N / M, over the whole list rather than the filter.

    A progress bar that moved when somebody tapped a category chip would be
    measuring the filter instead of the shopping.
  */
  const bought = shoppingList.filter(item => item.isPurchased).length;
  const total = shoppingList.length;
  const percent = total > 0 ? Math.round((bought / total) * 100) : 0;

  /*
    Every row grouped under the heading it was filed under — the bought ones
    too, ticked and in place.

    They used to drop into a grey block at the bottom with a line through the
    name. 「已購買」 against the row you already know, in the category you
    filed it under, is how a list is read on the second day of a trip: what is
    left in 美妝保養, not what is left overall.
  */
  const sections = useMemo(() => {
    const groups = new Map<string, ShoppingItem[]>();
    shown.forEach(item => {
      const key = item.category?.trim() || '未分類';
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });
    return [...groups.entries()];
  }, [shown]);

  /*
    分類管理 — renaming a heading moves everything filed under it, because the
    heading is only ever the word on the rows. Nothing is deleted here: a
    category emptied by hand would take its rows with it.
  */
  const renameCategory = (from: string, to: string) => {
    const next = to.trim();
    if (!onUpdateItem || !next || next === from) return;
    shoppingList
      .filter(item => (item.category?.trim() || '未分類') === from)
      .forEach(item => onUpdateItem(item.id, { category: next }));
    if (filter === from) setFilter(next);
  };

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
    <div className="mb-4 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
      {viewingPhoto && (
        <PhotoLightbox
          photos={[viewingPhoto]}
          index={0}
          onIndex={() => undefined}
          onClose={() => setViewingPhoto(null)}
        />
      )}
      <div className="p-5">
        {/*
          The title the screen is, rather than a label on a card. Under it the
          sentence that says what the list is for, which is the one thing an
          empty list cannot say for itself.
        */}
        <h3 className="text-2xl font-black leading-tight text-[#11183d]">{title}</h3>
        <p className="mt-1 mb-4 text-xs leading-5 text-slate-400">
          把想買的東西收集起來，旅途中不錯過任何好物！
        </p>

        {/*
          已買 N / M, over the whole list rather than whatever is filtered.
          A bar that moved when somebody tapped a chip would be measuring the
          filter instead of the shopping.
        */}
        {total > 0 && (
          <div data-testid="shopping-progress" className="mb-3 flex items-center gap-3 rounded-2xl bg-[#f4f3ff] px-3 py-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white">
              <ShoppingBag size={18} className="text-[#5b3df5]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between">
                <span className="text-sm font-black text-[#5b3df5]">已買 {bought} / {total}</span>
                <span className="text-[11px] font-bold text-slate-400">{percent}%</span>
              </span>
              <span className="mt-2 block h-2 rounded-full bg-white">
                <span
                  className="block h-2 rounded-full bg-gradient-to-r from-[#2F5BFF] to-[#8B3DFF]"
                  style={{ width: `${percent}%` }}
                />
              </span>
            </span>
          </div>
        )}

        {/*
          The screenshots, above the search box: it is how most of this list
          arrives, and a list you cannot fill is not a list you search.
        */}
        {onAddFromScreenshots && phase && makeId && (
          <div className="mb-3">
            <ShoppingScreenshotIntake phase={phase} makeId={makeId} onAdd={onAddFromScreenshots} />
          </div>
        )}

        {total > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
                <Search size={15} className="shrink-0 text-slate-400" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="搜尋商品、品牌或店家…"
                  aria-label="搜尋商品、品牌或店家"
                  data-testid="shopping-search"
                  className="min-w-0 flex-1 bg-transparent text-xs text-[#11183d] outline-none placeholder:text-slate-300"
                />
              </label>
              {/* 「我之後可以篩選商品金額」 — the funnel opens a range, not a sort. */}
              <button
                type="button"
                aria-label="依金額篩選"
                aria-expanded={amountOpen}
                data-testid="shopping-amount-filter"
                onClick={() => setAmountOpen(open => !open)}
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ${
                  filteringAmount
                    ? 'bg-[#5b3df5] text-white ring-[#5b3df5]'
                    : 'bg-white text-slate-400 ring-slate-200'
                }`}
              >
                <Filter size={16} />
              </button>
            </div>

            {amountOpen && (
              <div data-testid="shopping-amount-range" className="mt-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <p className="text-[11px] font-black text-[#11183d]">金額範圍</p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={minAmount}
                    onChange={event => setMinAmount(event.target.value)}
                    placeholder="最低"
                    aria-label="最低金額"
                    data-testid="shopping-amount-min"
                    className="min-w-0 flex-1 rounded-xl bg-white px-2.5 py-2 text-xs text-[#11183d] outline-none ring-1 ring-slate-200"
                  />
                  <span className="text-xs text-slate-300">–</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={maxAmount}
                    onChange={event => setMaxAmount(event.target.value)}
                    placeholder="最高"
                    aria-label="最高金額"
                    data-testid="shopping-amount-max"
                    className="min-w-0 flex-1 rounded-xl bg-white px-2.5 py-2 text-xs text-[#11183d] outline-none ring-1 ring-slate-200"
                  />
                  <button
                    type="button"
                    data-testid="shopping-amount-clear"
                    onClick={() => { setMinAmount(''); setMaxAmount(''); }}
                    className="shrink-0 rounded-xl px-2 py-2 text-[11px] font-black text-slate-400"
                  >
                    清除
                  </button>
                </div>
                {/*
                  A row nobody has priced is not cheap and not expensive. It
                  leaves the list while a range is set, and the list says so
                  — a row that vanishes without a reason is a row lost.
                */}
                {unpricedHidden > 0 && (
                  <p data-testid="shopping-amount-unpriced" className="mt-2 text-[10px] leading-4 text-slate-400">
                    還有 {unpricedHidden} 樣沒有填金額，篩選期間不會出現。
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* The categories this list actually has. */}
        {chips.length > 1 && (
          <div data-testid="shopping-categories" className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
            {chips.map(([label, count]) => (
              <button
                key={label}
                type="button"
                data-testid={`shopping-category-${label}`}
                aria-pressed={filter === label}
                onClick={() => setFilter(label)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-black ${
                  filter === label ? 'bg-[#5b3df5] text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {label}{' '}
                <span className={filter === label ? 'text-white/70' : 'text-slate-400'}>{count}</span>
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

      </div>

      <div className="px-5">
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
                  className="mt-3 flex w-full items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-xs font-black text-[#11183d]"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white text-[#5b3df5]">
                    <Tag size={13} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{label}（{items.length}）</span>
                  <ChevronDown
                    size={15}
                    className={`shrink-0 text-slate-400 ${collapsed.has(label) ? '-rotate-90' : ''}`}
                  />
                </button>

                {!collapsed.has(label) && items.map(item => (
              <div key={item.id} data-testid={`shopping-item-${item.id}`} className="border-b border-slate-50 py-3 last:border-0">
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
                    {/*
                      The tick, where a list is ticked: at the left, on the
                      row, one tap. 購買 beside it still records the expense —
                      this one only says the thing is in the bag.
                    */}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={!!item.isPurchased}
                      aria-label={`${item.name} ${item.isPurchased ? '取消已購買' : '標記已購買'}`}
                      data-testid={`shopping-tick-${item.id}`}
                      disabled={!onUpdateItem}
                      onClick={() => onUpdateItem?.(item.id, { isPurchased: !item.isPurchased })}
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md ${
                        item.isPurchased ? 'bg-[#5b3df5] text-white' : 'border-2 border-slate-200 text-transparent'
                      }`}
                    >
                      <Check size={13} />
                    </button>
                    {/*
                      「要找圖片」 — the screenshot this row was read out of. It
                      is the only picture of a wanted thing this app can
                      honestly show.
                    */}
                    {item.photo ? (
                      <span className="shrink-0">
                        {/* 「點擊照片要能變大」 — 40px shows that there is a
                            picture and nothing of what is in it. */}
                        <button
                          type="button"
                          aria-label={`放大 ${item.name} 的照片`}
                          onClick={() => setViewingPhoto(item.photo as string)}
                        >
                          <img
                            src={item.photo}
                            alt=""
                            loading="lazy"
                            data-testid={`shopping-photo-${item.id}`}
                            className="h-14 w-14 rounded-xl bg-slate-50 object-cover"
                          />
                        </button>
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
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-slate-400"
                      >
                        {findingImage === item.id
                          ? <Loader2 size={16} className="animate-spin" />
                          : <ImageIcon size={16} />}
                      </button>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start gap-1.5">
                        <span className="min-w-0 flex-1">
                          <span className="mr-1.5 text-sm font-black leading-5 text-[#11183d]">{item.name}</span>
                          {/*
                            已購買 or 待購買, said on every row. The bought ones
                            stay in their category with the badge turned over
                            rather than dropping into a struck-through block.
                          */}
                          <span
                            data-testid={`shopping-status-${item.id}`}
                            className={`inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 align-middle text-[10px] font-black ${
                              item.isPurchased
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-amber-50 text-amber-600'
                            }`}
                          >
                            {item.isPurchased ? '已購買' : '待購買'}
                          </span>
                        </span>
                        {/*
                          The row's other verbs, behind 「⋯」: recording the
                          expense, the price comparison, 必買／想買 and the
                          bin. They were four controls on every row, and on a
                          phone they left the name a third of the width.
                        */}
                        <button
                          type="button"
                          aria-label={`${item.name} 的其他動作`}
                          aria-expanded={menuFor === item.id}
                          data-testid={`shopping-menu-${item.id}`}
                          onClick={() => setMenuFor(open => (open === item.id ? null : item.id))}
                          className="-mt-1 shrink-0 rounded-lg p-1 text-slate-300"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      </div>

                      {item.shop && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                          <MapPin size={11} className="shrink-0" />
                          <span className="min-w-0 truncate">{item.shop}</span>
                        </div>
                      )}
                      {item.description && (
                        <div className="mt-0.5 text-[11px] leading-4 text-slate-500">{item.description}</div>
                      )}

                      {menuFor === item.id && (
                        <div data-testid={`shopping-menu-open-${item.id}`} className="mt-2 flex flex-wrap gap-1.5 rounded-xl bg-slate-50 p-1.5">
                          {onPurchaseItem && (
                            <button
                              type="button"
                              onClick={() => { onPurchaseItem(item); setMenuFor(null); }}
                              className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-[11px] font-black text-[#5b3df5] ring-1 ring-slate-200"
                            >
                              <ShoppingBag size={12} /> 記一筆支出
                            </button>
                          )}
                          <button
                            type="button"
                            data-testid={`shopping-compare-${item.id}`}
                            disabled={checking === item.id}
                            onClick={() => comparePrices(item)}
                            className="rounded-lg bg-white px-2 py-1.5 text-[11px] font-black text-[#5b3df5] ring-1 ring-slate-200 disabled:opacity-60"
                          >
                            {checking === item.id ? '查價中…' : '比一下台／日價格'}
                          </button>
                          {item.priority && (
                            <button
                              type="button"
                              disabled={!onUpdateItem}
                              data-testid={`shopping-priority-${item.id}`}
                              onClick={() => onUpdateItem?.(item.id, {
                                priority: item.priority === 'must' ? 'want' : 'must',
                              })}
                              className={`rounded-lg px-2 py-1.5 text-[11px] font-black ring-1 ring-slate-200 ${
                                item.priority === 'must'
                                  ? 'bg-white text-rose-600'
                                  : 'bg-white text-violet-600'
                              }`}
                            >
                              {item.priority === 'must' ? '必買' : '想買'}
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={`刪除 ${item.name}`}
                            onClick={() => { onRemoveItem(item.id); setMenuFor(null); }}
                            className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-[11px] font-black text-rose-500 ring-1 ring-slate-200"
                          >
                            <Trash2 size={12} /> 刪除
                          </button>
                        </div>
                      )}

                      {/*
                        台灣 and 日本 side by side, each quote with the page it
                        was read from. No 「這邊比較便宜」: that needs a rate, a
                        tax-refund assumption and a view on baggage, and a
                        sentence this app wrote would be read as advice.
                      */}
                      {!prices[item.id] ? null : byRegion(prices[item.id].quotes).length === 0 ? (
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

                  <div className="mt-2 flex items-center justify-between gap-2 pl-[6.5rem]">
                      {onUpdateItem && (
                        <span className="flex items-center gap-1 rounded-xl px-1 py-0.5 ring-1 ring-slate-200">
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
                    {/*
                      What it is expected to cost, when somebody has said.
                      Never read off a screenshot and never guessed — see
                      `/api/shopping/parse-image`, which reads no prices at
                      all, and §6 of docs/PRODUCT.md for why.
                    */}
                    {typeof item.estimatedAmount === 'number' && item.estimatedAmount > 0 && (
                      <span data-testid={`shopping-amount-${item.id}`} className="text-[11px] font-black text-amber-600">
                        約 {item.estimatedCurrency || 'NT$'} {Math.round(item.estimatedAmount).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
                ))}
              </section>
            ))}

          </>
        )}
      </div>

      {/*
        分類管理 and 新增商品, at the bottom where a thumb is.

        The add box used to sit under the header, above a list it was going to
        push down. Behind the button it is where the errand ends rather than
        where reading begins.
      */}
      <div className="sticky bottom-0 mt-2 flex gap-3 border-t border-slate-50 bg-white px-5 py-4">
        {onUpdateItem && chips.length > 1 && (
          <button
            type="button"
            data-testid="shopping-manage-categories"
            aria-expanded={managing}
            onClick={() => { setManaging(open => !open); setAdding(false); }}
            className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl text-xs font-black text-slate-500 ring-1 ring-slate-200"
          >
            <Tag size={14} />分類管理
          </button>
        )}
        <button
          type="button"
          data-testid="shopping-add-open"
          onClick={() => { setAdding(open => !open); setManaging(false); }}
          className="flex min-h-12 flex-[1.2] items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#2F5BFF] to-[#8B3DFF] text-xs font-black text-white"
        >
          <Plus size={16} />新增商品
        </button>
      </div>

      {adding && (
        <form onSubmit={handleAddSubmit} className="flex gap-2 px-5 pb-5">
          <input
            type="text"
            autoFocus
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="想買什麼？(如: 轉接頭、伴手禮)"
            data-testid="shopping-add-input"
            className="min-w-0 flex-1 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm text-[#11183d] outline-none ring-1 ring-slate-200"
          />
          <button
            type="submit"
            aria-label="新增"
            disabled={!newItemName.trim()}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#5b3df5] text-white disabled:opacity-40"
          >
            <Plus size={18} />
          </button>
        </form>
      )}

      {/*
        Renaming a heading, which moves every row filed under it. Nothing is
        deleted here: an emptied category would take its rows with it.
      */}
      {managing && (
        <div data-testid="shopping-category-manager" className="space-y-2 px-5 pb-5">
          {chips.filter(([label]) => label !== ALL).map(([label, count]) => (
            <div key={label} className="flex items-center gap-2">
              <input
                defaultValue={label}
                aria-label={`${label} 的分類名稱`}
                data-testid={`shopping-category-name-${label}`}
                onBlur={event => renameCategory(label, event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                }}
                className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-[#11183d] outline-none ring-1 ring-slate-200"
              />
              <span className="shrink-0 text-[11px] text-slate-400">{count} 樣</span>
            </div>
          ))}
          <p className="text-[10px] leading-4 text-slate-400">
            改了名字，這個分類底下的商品會一起搬過去。
          </p>
        </div>
      )}
    </div>
  );
};

export default ShoppingListPanel;
