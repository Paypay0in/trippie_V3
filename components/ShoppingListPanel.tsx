
import React, { useState } from 'react';
import { ShoppingItem } from '../types';
import { Check, Plus, ShoppingBag, Trash2, Circle } from 'lucide-react';

interface Props {
  title: string;
  shoppingList: ShoppingItem[];
  onAddItem: (name: string) => void;
  onRemoveItem: (id: string) => void;
  onPurchaseItem: (item: ShoppingItem) => void;
}

const ShoppingListPanel: React.FC<Props> = ({ 
  title,
  shoppingList, 
  onAddItem, 
  onRemoveItem, 
  onPurchaseItem
}) => {
  const [newItemName, setNewItemName] = useState('');

  const handleAddSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (newItemName.trim()) {
          onAddItem(newItemName.trim());
          setNewItemName('');
      }
  };

  const pendingItems = shoppingList.filter(i => !i.isPurchased);
  const purchasedItems = shoppingList.filter(i => i.isPurchased);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4">
        <div className="p-4 border-b border-gray-50 bg-gray-50/50">
            <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2 mb-2">
            {title}
            </h3>
            <form onSubmit={handleAddSubmit} className="flex gap-2">
                <input 
                    type="text" 
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="想買什麼？(如: 轉接頭、伴手禮)"
                    className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button 
                    type="submit"
                    disabled={!newItemName.trim()}
                    className="bg-brand-600 text-white p-2 rounded-lg disabled:opacity-50 hover:bg-brand-700 transition-colors"
                >
                    <Plus size={18} />
                </button>
            </form>
        </div>

        <div className="divide-y divide-gray-100">
            {shoppingList.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-xs">
                    清單是空的，新增一些項目吧！
                </div>
            ) : (
                <>
                {/* Pending Items */}
                {pendingItems.map(item => (
                    <div key={item.id} className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors group">
                        <div className="flex items-center gap-3">
                            <Circle size={18} className="text-gray-300" />
                            <span className="text-gray-800 text-sm font-medium">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={() => onPurchaseItem(item)}
                                className="text-xs flex items-center gap-1 bg-brand-50 text-brand-600 px-2 py-1.5 rounded hover:bg-brand-100 transition-colors font-bold"
                                title="記錄為支出"
                            >
                                <ShoppingBag size={14} /> 購買
                            </button>
                            <button 
                                onClick={() => onRemoveItem(item.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
                
                {/* Completed Items */}
                {purchasedItems.length > 0 && (
                    <div className="bg-gray-50/50">
                        {purchasedItems.map(item => (
                            <div key={item.id} className="p-3 flex items-center justify-between opacity-60">
                                    <div className="flex items-center gap-3">
                                    <div className="bg-green-100 text-green-600 rounded-full p-0.5">
                                        <Check size={14} />
                                    </div>
                                    <span className="text-gray-500 text-sm line-through decoration-gray-400">{item.name}</span>
                                </div>
                                <button 
                                    onClick={() => onRemoveItem(item.id)}
                                    className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                </>
            )}
        </div>
    </div>
  );
};

export default ShoppingListPanel;
