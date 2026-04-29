
import React, { useState } from 'react';
import { Companion } from '../types';
import { X, UserPlus, Trash2, Users } from 'lucide-react';

interface Props {
  companions: Companion[];
  friends: Companion[];
  onAdd: (name: string) => void;
  onAddFriendToTrip: (friend: Companion) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

const CompanionsModal: React.FC<Props> = ({ companions, friends, onAdd, onAddFriendToTrip, onRemove, onClose }) => {
  const [newName, setNewName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      onAdd(newName.trim());
      setNewName('');
    }
  };

  const availableFriends = friends.filter(f => !companions.some(c => c.id === f.id));

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
        <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
            <div>
                <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                    <Users className="text-brand-600" size={24} /> 管理旅伴
                </h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Trip Companions</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                <X size={24} className="text-gray-500" />
            </button>
        </div>

        <div className="p-6">
          <p className="text-sm text-gray-500 mb-6 font-medium leading-relaxed">
            新增旅伴後，記帳時即可選擇「誰付錢」與「分攤給誰」。系統會自動計算債務。
          </p>

          <form onSubmit={handleSubmit} className="flex gap-3 mb-6">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="輸入旅伴名字 (例: Alice)"
              className="flex-1 border border-gray-200 bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all outline-none"
            />
            <button 
              type="submit"
              disabled={!newName.trim()}
              className="bg-brand-600 text-white px-5 py-3 rounded-xl disabled:opacity-50 hover:bg-brand-700 transition-colors shadow-sm shadow-brand-200 flex items-center justify-center"
            >
              <UserPlus size={20} />
            </button>
          </form>

          <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                <span className="font-black text-gray-700">我 (預設)</span>
                <span className="text-[10px] font-black text-gray-400 bg-gray-200 px-2 py-1 rounded-md uppercase tracking-wider">擁有者</span>
            </div>
            
            {companions.map(c => (
              <div key={c.id} className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-brand-100 transition-colors">
                <div className="flex flex-col">
                  <span className="font-bold text-gray-900">{c.name}</span>
                  {friends.some(f => f.id === c.id) && <span className="text-[10px] text-brand-600 font-black tracking-wider uppercase mt-0.5">已連結好友</span>}
                </div>
                <button 
                  onClick={() => onRemove(c.id)}
                  className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}

            {availableFriends.length > 0 && (
              <div className="mt-8">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">從好友名單加入</h3>
                <div className="space-y-2">
                  {availableFriends.map(f => (
                    <button 
                      key={f.id}
                      onClick={() => onAddFriendToTrip(f)}
                      className="w-full flex items-center justify-between p-4 bg-brand-50/50 rounded-xl border border-brand-100 hover:bg-brand-50 hover:shadow-sm transition-all text-left group"
                    >
                      <span className="font-bold text-brand-900 group-hover:text-brand-700">{f.name}</span>
                      <div className="bg-white p-1.5 rounded-lg shadow-sm text-brand-600 group-hover:scale-110 transition-transform">
                        <UserPlus size={16} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanionsModal;
