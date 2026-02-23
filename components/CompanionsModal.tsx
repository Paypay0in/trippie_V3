
import React, { useState } from 'react';
import { Companion } from '../types';
import { X, UserPlus, Trash2, Users } from 'lucide-react';

interface Props {
  companions: Companion[];
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

const CompanionsModal: React.FC<Props> = ({ companions, onAdd, onRemove, onClose }) => {
  const [newName, setNewName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      onAdd(newName.trim());
      setNewName('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <Users className="text-brand-600" size={20} /> 管理旅伴
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full">
                <X size={20} className="text-gray-500" />
            </button>
        </div>

        <div className="p-4">
          <p className="text-xs text-gray-500 mb-4">
            新增旅伴後，記帳時即可選擇「誰付錢」與「分攤給誰」。系統會自動計算債務。
          </p>

          <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="輸入旅伴名字 (例: Alice)"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            />
            <button 
              type="submit"
              disabled={!newName.trim()}
              className="bg-brand-600 text-white p-2 rounded-lg disabled:opacity-50 hover:bg-brand-700"
            >
              <UserPlus size={20} />
            </button>
          </form>

          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="font-bold text-gray-700">我 (預設)</span>
                <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded">擁有者</span>
            </div>
            {companions.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
                <span className="font-medium text-gray-800">{c.name}</span>
                <button 
                  onClick={() => onRemove(c.id)}
                  className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanionsModal;
