/**
 * The row of tiles at the top of a trip: where you can go from here.
 *
 * 「釜山的總覽應該跟這個一樣」 — it was drawn inside the live overview, which
 * only a trip in progress renders, so a finished trip reached none of it. The
 * answer is not a second row written for the other screen: that is the shape
 * this project keeps getting bitten by, and a row with two homes is a row
 * that disagrees with itself the first time somebody adds a tile to one.
 *
 * It draws what it is given, and nothing else. 「拿掉這個」 removed 旅伴 and
 * 更多 by not passing their handlers rather than by an exception inside here,
 * and that remains the only rule: a tile with nowhere to go is absent.
 */
import React from 'react';
import { CalendarRange, Images, Map, MoreHorizontal, ShoppingBag, Users } from 'lucide-react';

export interface TripWaysProps {
  onOpenPlanning: () => void;
  onOpenMap?: () => void;
  onOpenShoppingList?: () => void;
  onOpenRecap?: () => void;
  onOpenCompanions?: () => void;
  onOpenMore?: () => void;
}

type Way = [React.ComponentType<{ size?: number }>, string, () => void];

const TripWays: React.FC<TripWaysProps> = ({
  onOpenPlanning,
  onOpenMap,
  onOpenShoppingList,
  onOpenRecap,
  onOpenCompanions,
  onOpenMore,
}) => {
  const ways: Way[] = [
    [CalendarRange, '行程規劃', onOpenPlanning],
    ...(onOpenMap ? [[Map, '地圖', onOpenMap] as Way] : []),
    ...(onOpenShoppingList ? [[ShoppingBag, '購物清單', onOpenShoppingList] as Way] : []),
    ...(onOpenRecap ? [[Images, '旅程回顧', onOpenRecap] as Way] : []),
    ...(onOpenCompanions ? [[Users, '旅伴', onOpenCompanions] as Way] : []),
    ...(onOpenMore ? [[MoreHorizontal, '更多', onOpenMore] as Way] : []),
  ];

  return (
    <section
      data-testid="trip-quick-ways"
      className="grid gap-2 rounded-[1.45rem] border border-slate-100 bg-white p-3 shadow-[0_8px_24px_rgba(66,74,150,.07)]"
      style={{ gridTemplateColumns: `repeat(${ways.length}, minmax(0, 1fr))` }}
    >
      {ways.map(([Icon, label, go]) => (
        <button
          key={label}
          type="button"
          data-testid={`trip-way-${label}`}
          onClick={go}
          className="flex min-h-[4.25rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-100 bg-white text-[11px] font-black text-slate-600 shadow-sm transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
        >
          <Icon size={20} />{label}
        </button>
      ))}
    </section>
  );
};

export default TripWays;
