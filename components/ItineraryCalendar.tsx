import React from 'react';
import { ItineraryItem } from '../types';
import { Clock, MapPin, Plane, Hotel, Utensils, Ticket, Car } from 'lucide-react';

interface Props {
  items: ItineraryItem[];
  onAddToCalendar?: (item: ItineraryItem) => void;
}

const ItineraryCalendar: React.FC<Props> = ({ items, onAddToCalendar }) => {
  const sortedItems = [...items].sort((a, b) => a.time.localeCompare(b.time));

  const getIcon = (type: ItineraryItem['type']) => {
    switch (type) {
      case 'FLIGHT': return <Plane size={16} />;
      case 'HOTEL': return <Hotel size={16} />;
      case 'FOOD': return <Utensils size={16} />;
      case 'ACTIVITY': return <Ticket size={16} />;
      case 'TRANSPORT': return <Car size={16} />;
      default: return <Clock size={16} />;
    }
  };

  const getColor = (type: ItineraryItem['type']) => {
    switch (type) {
      case 'FLIGHT': return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'HOTEL': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'FOOD': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'ACTIVITY': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'TRANSPORT': return 'bg-slate-50 text-slate-700 border-slate-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getDotColor = (type: ItineraryItem['type']) => {
    switch (type) {
      case 'FLIGHT': return 'bg-sky-500';
      case 'HOTEL': return 'bg-rose-500';
      case 'FOOD': return 'bg-amber-500';
      case 'ACTIVITY': return 'bg-indigo-500';
      case 'TRANSPORT': return 'bg-slate-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">行程視覺化</h2>
        <button className="text-xs font-bold text-brand-600 bg-brand-50 px-3 py-1.5 rounded-lg hover:bg-brand-100 transition-colors">
          同步至 Google 日曆
        </button>
      </div>

      <div className="relative space-y-4 before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
        {sortedItems.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            尚未有行程規劃，AI 將根據您的支出自動產生。
          </div>
        ) : (
          sortedItems.map((item, index) => (
            <div key={item.id} className="relative pl-10 animate-fade-in" style={{ animationDelay: `${index * 100}ms` }}>
              <div className={`absolute left-2 top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm z-10 ${getDotColor(item.type)}`} />
              
              <div className={`p-4 rounded-xl border ${getColor(item.type)}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {getIcon(item.type)}
                    <span className="text-xs font-bold font-mono">{item.time}</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-bold opacity-70">{item.type}</span>
                </div>
                
                <h4 className="font-bold text-sm mb-1">{item.title}</h4>
                
                {item.location && (
                  <div className="flex items-center gap-1 text-[10px] opacity-80">
                    <MapPin size={10} />
                    {item.location}
                  </div>
                )}
                
                {item.notes && (
                  <p className="mt-2 text-[10px] opacity-70 italic border-t border-current/10 pt-2">
                    {item.notes}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ItineraryCalendar;
