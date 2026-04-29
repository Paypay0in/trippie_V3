import React from 'react';
import { TravelBook } from '../types';
import { BookOpen, MapPin, Sparkles, Share2, Download } from 'lucide-react';

interface Props {
  book: TravelBook;
  onShare: () => void;
}

const TravelBookView: React.FC<Props> = ({ book, onShare }) => {
  return (
    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden animate-scale-in">
      <div className="h-64 bg-gradient-to-br from-brand-600 to-indigo-700 relative p-8 flex flex-col justify-end">
        {book.coverPhoto && (
          <img src={book.coverPhoto} alt="Cover" className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-overlay" />
        )}
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-brand-100 text-xs font-bold mb-2 uppercase tracking-widest">
            <Sparkles size={14} />
            AI 智慧總結
          </div>
          <h2 className="text-3xl font-bold text-white mb-2 leading-tight">旅程回憶錄</h2>
          <p className="text-brand-100 text-sm opacity-90 italic">"{book.summary}"</p>
        </div>
      </div>

      <div className="p-8 space-y-8">
        <section>
          <div className="flex items-center gap-2 mb-4 text-gray-800">
            <MapPin size={18} className="text-brand-500" />
            <h3 className="font-bold">足跡軌跡</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {book.trajectory.map((loc, i) => (
              <span key={i} className="bg-gray-50 text-gray-600 text-xs px-3 py-1.5 rounded-full border border-gray-100">
                {loc}
              </span>
            ))}
          </div>
        </section>

        <section className="relative">
          <div className="flex items-center gap-2 mb-4 text-gray-800">
            <BookOpen size={18} className="text-brand-500" />
            <h3 className="font-bold">AI 敘事</h3>
          </div>
          <div className="bg-brand-50/50 p-6 rounded-2xl border border-brand-100 relative">
            <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap italic">
              {book.aiNarrative}
            </p>
            <div className="absolute -bottom-2 -right-2 bg-white p-2 rounded-lg shadow-sm border border-gray-100">
              <Sparkles size={16} className="text-brand-500" />
            </div>
          </div>
        </section>

        <div className="flex gap-3 pt-4">
          <button 
            onClick={onShare}
            className="flex-1 bg-brand-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-brand-700 transition-colors shadow-lg shadow-brand-500/20"
          >
            <Share2 size={18} /> 分享回憶
          </button>
          <button className="px-5 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors">
            <Download size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TravelBookView;
