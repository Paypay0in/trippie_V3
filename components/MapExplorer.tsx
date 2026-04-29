import React, { useState } from 'react';
import { PublicTrip } from '../types';
import { Search, MapPin, Navigation, Filter, Camera } from 'lucide-react';

interface Props {
  trips: PublicTrip[];
  onSelectTrip: (trip: PublicTrip) => void;
}

const MapExplorer: React.FC<Props> = ({ trips, onSelectTrip }) => {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 bg-white border-b border-gray-100 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="搜尋地點、餐廳或景點..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          />
        </div>
        <button className="p-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-100">
          <Filter size={18} />
        </button>
      </div>

      <div className="flex-1 bg-gray-100 relative overflow-hidden">
        {/* Simulated Map Background */}
        <div className="absolute inset-0 bg-[url('https://picsum.photos/seed/map/1000/1000')] bg-cover opacity-30 mix-blend-multiply grayscale" />
        
        {/* Map Markers */}
        {trips.map((trip, i) => (
          <button 
            key={trip.id}
            onClick={() => onSelectTrip(trip)}
            className="absolute animate-bounce"
            style={{ 
              left: `${20 + (i * 15) % 60}%`, 
              top: `${30 + (i * 20) % 50}%`,
              animationDelay: `${i * 200}ms`
            }}
          >
            <div className="relative group">
              <div className="bg-brand-600 text-white p-2 rounded-full shadow-lg group-hover:bg-brand-700 transition-colors">
                <MapPin size={20} />
              </div>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block whitespace-nowrap">
                <div className="bg-white px-3 py-2 rounded-xl shadow-xl border border-gray-100 flex items-center gap-2">
                  {trip.photos && trip.photos[0] && (
                    <img src={trip.photos[0]} alt="" className="w-8 h-8 rounded-lg object-cover" />
                  )}
                  <div>
                    <div className="text-[10px] font-bold text-gray-800">{trip.name}</div>
                    <div className="text-[8px] text-brand-600 font-bold">${trip.totalCost.toLocaleString()} TWD</div>
                  </div>
                </div>
                <div className="w-2 h-2 bg-white border-r border-b border-gray-100 rotate-45 mx-auto -mt-1" />
              </div>
            </div>
          </button>
        ))}

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
          <button className="bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold text-gray-700 hover:bg-white transition-colors">
            <Navigation size={14} className="text-brand-600" />
            附近熱門
          </button>
          <button className="bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold text-gray-700 hover:bg-white transition-colors">
            <Camera size={14} className="text-brand-600" />
            實景照片
          </button>
        </div>
      </div>
    </div>
  );
};

export default MapExplorer;
