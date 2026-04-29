import React from 'react';
import { PublicTrip } from '../types';
import { Heart, Copy, Share2, MapPin, Calendar } from 'lucide-react';

interface Props {
  trips: PublicTrip[];
  onClone: (trip: PublicTrip) => void;
  onView: (trip: PublicTrip) => void;
}

const CommunityFeed: React.FC<Props> = ({ trips, onClone, onView }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">探索旅程</h2>
        <div className="flex gap-2">
          <span className="text-xs bg-brand-100 text-brand-700 px-2 py-1 rounded-full">熱門</span>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">最新</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {trips.map(trip => (
          <div key={trip.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <div className="h-40 bg-gray-200 relative">
              {trip.photos && trip.photos.length > 0 ? (
                <img src={trip.photos[0]} alt={trip.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <MapPin size={40} />
                </div>
              )}
              <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-xs font-bold text-brand-600">
                ${trip.totalCost.toLocaleString()} TWD
              </div>
            </div>
            
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-[10px] text-white font-bold">
                  {trip.authorName[0]}
                </div>
                <span className="text-xs text-gray-500">{trip.authorName}</span>
              </div>
              
              <h3 className="font-bold text-gray-800 mb-1 line-clamp-1">{trip.name}</h3>
              
              <div className="flex items-center gap-3 text-[10px] text-gray-400 mb-4">
                <div className="flex items-center gap-1">
                  <Calendar size={12} />
                  {trip.startDate.split('T')[0]}
                </div>
                <div className="flex items-center gap-1">
                  <MapPin size={12} />
                  {trip.expenses.length} 筆消費
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                <div className="flex gap-3">
                  <button className="flex items-center gap-1 text-gray-400 hover:text-red-500 transition-colors">
                    <Heart size={16} />
                    <span className="text-xs">{trip.likes}</span>
                  </button>
                  <button className="flex items-center gap-1 text-gray-400 hover:text-brand-500 transition-colors">
                    <Share2 size={16} />
                  </button>
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => onView(trip)}
                    className="text-xs font-bold text-gray-600 hover:text-brand-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                  >
                    查看詳情
                  </button>
                  <button 
                    onClick={() => onClone(trip)}
                    className="bg-brand-50 text-brand-600 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-brand-100 transition-colors"
                  >
                    <Copy size={14} /> 複製行程
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CommunityFeed;
