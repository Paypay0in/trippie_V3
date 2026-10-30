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
import { useTranslation } from 'react-i18next';
import { CalendarRange, Images, Map, MoreHorizontal, ShoppingBag, Users } from 'lucide-react';

export interface TripWaysProps {
  onOpenPlanning: () => void;
  onOpenMap?: () => void;
  onOpenShoppingList?: () => void;
  onOpenRecap?: () => void;
  onOpenCompanions?: () => void;
  onOpenMore?: () => void;
}

/*
  Icon, the tile's own id, its label, and where it goes.

  The id and the label used to be one string. They are different jobs: the
  label is what the traveller reads and moves with the interface language,
  while the id is what `data-testid` is built from and is asserted on by name
  in `tests/tripOverviewHeader.test.tsx`. A tile whose hook changes with the
  reader's language is a hook nobody can hold.
*/
// i18n-data: the second slot is the `data-testid` anchor the tests address
// these tiles by, not a label — the label is the third slot.
type Way = [React.ComponentType<{ size?: number }>, string, string, () => void];

const TripWays: React.FC<TripWaysProps> = ({
  onOpenPlanning,
  onOpenMap,
  onOpenShoppingList,
  onOpenRecap,
  onOpenCompanions,
  onOpenMore,
}) => {
  const { t } = useTranslation();
  const ways: Way[] = [
    [CalendarRange, '行程規劃', t('trips.ways.planning'), onOpenPlanning], // i18n-data: tile id behind `data-testid`, asserted by name in tests
    ...(onOpenMap ? [[Map, '地圖', t('trips.ways.map'), onOpenMap] as Way] : []), // i18n-data: tile id behind `data-testid`, asserted by name in tests
    ...(onOpenShoppingList ? [[ShoppingBag, '購物清單', t('trips.ways.shoppingList'), onOpenShoppingList] as Way] : []), // i18n-data: tile id behind `data-testid`, asserted by name in tests
    ...(onOpenRecap ? [[Images, '旅程回顧', t('trips.ways.recap'), onOpenRecap] as Way] : []), // i18n-data: tile id behind `data-testid`, asserted by name in tests
    ...(onOpenCompanions ? [[Users, '旅伴', t('trips.ways.companions'), onOpenCompanions] as Way] : []), // i18n-data: tile id behind `data-testid`, asserted by name in tests
    ...(onOpenMore ? [[MoreHorizontal, '更多', t('trips.ways.more'), onOpenMore] as Way] : []), // i18n-data: tile id behind `data-testid`, asserted by name in tests
  ];

  return (
    <section
      data-testid="trip-quick-ways"
      className="grid gap-2 rounded-[1.45rem] border border-slate-100 bg-white p-3 shadow-[0_8px_24px_rgba(66,74,150,.07)]"
      style={{ gridTemplateColumns: `repeat(${ways.length}, minmax(0, 1fr))` }}
    >
      {ways.map(([Icon, id, label, go]) => (
        <button
          key={id}
          type="button"
          data-testid={`trip-way-${id}`}
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
