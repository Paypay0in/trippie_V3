import React from 'react';
import { Award, Book, Map as MapIcon } from 'lucide-react';

/**
 * Where the traveller is. `community` and `marketplace` are here even though
 * neither has a button: a screen still has to be able to say which one it is,
 * and an omitted tab is not an impossible location.
 */
export type ExploreSection = 'bookshelf' | 'community' | 'map' | 'marketplace' | 'points';

interface Props {
  active: ExploreSection;
  onChange: (section: ExploreSection) => void;
}

/**
 * The bar the secondary screens share — 社群, 服務, 地圖, 積分.
 *
 * It existed four times before this file did: written out by hand inside each
 * of those four view branches in `App.tsx`. Four copies of a bar is four
 * answers to the question of what the bar contains, and the day they disagreed
 * had already arrived — `AppBottomNav` had dropped 社群 and 服務 on the
 * Founder's instruction and all four copies still offered both. Somebody
 * reaching 社群 through 探索靈感 saw the tabs that were supposed to be put away.
 *
 * So the omission lives here now, once, next to the buttons it is an omission
 * from. Adding a tab back is one line in one file, and no second copy can keep
 * serving the old answer.
 */
const ExploreBottomNav: React.FC<Props> = ({ active, onChange }) => {
  const tone = (section: ExploreSection) =>
    `flex flex-col items-center gap-1 ${active === section ? 'text-brand-600' : 'text-gray-400'}`;

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full md:max-w-2xl bg-white/80 backdrop-blur-xl border-t border-gray-100 px-6 py-3 flex justify-around items-center z-50">
      <button onClick={() => onChange('bookshelf')} className={tone('bookshelf')}>
        <Book size={20} />
        <span className="text-[10px] font-bold">書架</span>
      </button>
      {/*
        社群 and 服務 are deliberately absent, for the reasons recorded on
        `AppBottomNav`: the feed holds one post, by the Founder, and 服務 says
        「後續版本開放」. Both screens still render and 探索靈感 still opens 社群;
        what is withheld is only the advertisement of them in a bar.

        They were present here until this bar became one file. Keeping them
        would have meant the main bar and this one telling a traveller two
        different things about the same app.
      */}
      <button onClick={() => onChange('map')} className={tone('map')}>
        <MapIcon size={20} />
        <span className="text-[10px] font-bold">地圖</span>
      </button>
      <button onClick={() => onChange('points')} className={tone('points')}>
        <Award size={20} />
        <span className="text-[10px] font-bold">積分</span>
      </button>
    </div>
  );
};

export default ExploreBottomNav;
