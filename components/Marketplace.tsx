import React, { useState } from 'react';
import { MarketplaceService, InboxMessage } from '../types';
import { Star, MessageCircle, ShieldCheck, Zap, Plus, X, Info, Inbox, ArrowLeft } from 'lucide-react';

interface Props {
  services: MarketplaceService[];
  inboxMessages?: InboxMessage[];
  onBook: (service: MarketplaceService) => void;
  onAddService: (service: Omit<MarketplaceService, 'id' | 'rating'>) => void;
  onMarkMessageRead?: (id: string) => void;
}

const Marketplace: React.FC<Props> = ({ services, inboxMessages = [], onBook, onAddService, onMarkMessageRead }) => {
  const [activeTab, setActiveTab] = useState<'explore' | 'inbox'>('explore');
  const [isAddingService, setIsAddingService] = useState(false);
  const [chattingWith, setChattingWith] = useState<MarketplaceService | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Record<string, {text: string, isMe: boolean}[]>>({});
  
  const [newService, setNewService] = useState({
    title: '',
    description: '',
    price: '',
    serviceType: 'BOOKING' as 'BOOKING' | 'GUIDE' | 'OTHER'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newService.title || !newService.price) return;

    onAddService({
      providerName: '我',
      serviceType: newService.serviceType,
      title: newService.title,
      description: newService.description,
      price: parseFloat(newService.price),
      currency: 'TWD'
    });

    setIsAddingService(false);
    setNewService({ title: '', description: '', price: '', serviceType: 'BOOKING' });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !chattingWith) return;

    const serviceId = chattingWith.id;
    const newMessage = { text: chatMessage, isMe: true };
    
    setChatHistory(prev => ({
      ...prev,
      [serviceId]: [...(prev[serviceId] || []), newMessage]
    }));
    
    setChatMessage('');

    // Simulate response
    setTimeout(() => {
      const response = { text: "你好！很高興為您服務。請問有什麼我可以幫您的嗎？", isMe: false };
      setChatHistory(prev => ({
        ...prev,
        [serviceId]: [...(prev[serviceId] || []), response]
      }));
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('explore')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'explore' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            探索服務
          </button>
          <button 
            onClick={() => setActiveTab('inbox')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'inbox' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Inbox size={14} />
            收件匣
            {inboxMessages.some(m => m.unread) && (
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
            )}
          </button>
        </div>
        
        {activeTab === 'explore' && (
          <button 
            onClick={() => setIsAddingService(true)}
            className="text-xs font-bold text-brand-600 border border-brand-200 px-3 py-1.5 rounded-lg hover:bg-brand-50 flex items-center gap-1"
          >
            <Plus size={14} /> 我也要提供服務
          </button>
        )}
      </div>

      {activeTab === 'explore' ? (
        <div className="grid grid-cols-1 gap-4">
          {services.map(service => (
            <div key={service.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex gap-4 hover:border-brand-200 transition-colors cursor-pointer" onClick={() => onBook(service)}>
              <div className="w-16 h-16 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden">
                {service.providerAvatar ? (
                  <img src={service.providerAvatar} alt={service.providerName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-brand-500 font-bold text-xl">
                    {service.providerName[0]}
                  </div>
                )}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-800">{service.providerName}</span>
                    <div className="flex items-center gap-0.5 text-amber-500">
                      <Star size={10} fill="currentColor" />
                      <span className="text-[10px] font-bold">{service.rating}</span>
                    </div>
                  </div>
                  <div className="text-brand-600 font-bold text-sm">
                    {service.price} {service.currency}
                  </div>
                </div>
                
                <h3 className="font-bold text-gray-900 text-sm mb-1">{service.title}</h3>
                <p className="text-xs text-gray-500 line-clamp-2 mb-3">{service.description}</p>
                
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
                    <ShieldCheck size={10} />
                    認證當地人
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full">
                    <Zap size={10} />
                    快速回覆
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setChattingWith(service);
                    }}
                    className="flex items-center gap-1 text-[10px] text-gray-400 ml-auto hover:text-brand-600 transition-colors"
                  >
                    <MessageCircle size={10} />
                    諮詢
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {inboxMessages.length > 0 ? (
            inboxMessages.map(msg => (
              <div 
                key={msg.id} 
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-start gap-4 hover:border-brand-200 transition-colors cursor-pointer"
                onClick={() => {
                  if (msg.unread && onMarkMessageRead) {
                    onMarkMessageRead(msg.id);
                  }
                  // In a real app, this would open the chat with this user
                }}
              >
                <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-lg flex-shrink-0 relative">
                  {msg.sender[0]}
                  {msg.unread && (
                    <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-white rounded-full"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-bold text-gray-900 text-sm truncate">{msg.sender}</h4>
                    <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap ml-2">{msg.time}</span>
                  </div>
                  <p className="text-xs text-brand-600 font-bold mb-1 truncate">關於：{msg.serviceTitle}</p>
                  <p className={`text-xs truncate ${msg.unread ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                    {msg.lastMessage}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Inbox size={24} className="text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium text-sm">目前沒有任何訊息</p>
            </div>
          )}
        </div>
      )}

      {/* Chat Modal */}
      {chattingWith && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[110] animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col h-[500px]">
            <div className="p-4 border-b flex justify-between items-center bg-brand-600 text-white">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold">
                  {chattingWith.providerName[0]}
                </div>
                <div>
                  <div className="text-sm font-bold">{chattingWith.providerName}</div>
                  <div className="text-[10px] opacity-80">正在線上</div>
                </div>
              </div>
              <button onClick={() => setChattingWith(null)} className="p-1 hover:bg-white/20 rounded-full">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl text-[10px] text-blue-700">
                您正在諮詢：<span className="font-bold">{chattingWith.title}</span>
              </div>
              
              {(chatHistory[chattingWith.id] || []).map((msg, i) => (
                <div key={i} className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl text-xs ${
                    msg.isMe 
                      ? 'bg-brand-600 text-white rounded-tr-none' 
                      : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none shadow-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              
              {chatHistory[chattingWith.id]?.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-xs">
                  發送訊息開始諮詢
                </div>
              )}
            </div>

            <form onSubmit={handleSendMessage} className="p-4 border-t bg-white flex gap-2">
              <input 
                type="text" 
                value={chatMessage}
                onChange={e => setChatMessage(e.target.value)}
                placeholder="輸入訊息..."
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <button 
                type="submit"
                disabled={!chatMessage.trim()}
                className="bg-brand-600 text-white p-2 rounded-xl disabled:opacity-50"
              >
                <Zap size={20} fill="currentColor" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Service Modal */}
      {isAddingService && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">提供您的服務</h3>
              <button onClick={() => setIsAddingService(false)} className="p-1 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">服務類型</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['BOOKING', 'GUIDE', 'OTHER'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNewService(prev => ({ ...prev, serviceType: type }))}
                      className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${
                        newService.serviceType === type 
                          ? 'bg-brand-500 text-white border-brand-600' 
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {type === 'BOOKING' ? '代訂位' : type === 'GUIDE' ? '導覽' : '其他'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">服務名稱</label>
                <input 
                  required
                  type="text" 
                  value={newService.title}
                  onChange={e => setNewService(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="例如：代訂京都米其林餐廳"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">服務描述</label>
                <textarea 
                  rows={3}
                  value={newService.description}
                  onChange={e => setNewService(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="請描述您的服務內容..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">服務費用 (TWD)</label>
                <input 
                  required
                  type="number" 
                  value={newService.price}
                  onChange={e => setNewService(prev => ({ ...prev, price: e.target.value }))}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none font-mono"
                />
              </div>

              <div className="bg-blue-50 p-3 rounded-xl flex items-start gap-2">
                <Info size={14} className="text-blue-600 mt-0.5 shrink-0" />
                <p className="text-[10px] text-blue-700 leading-relaxed">
                  提供服務可以賺取 Trippie 積分。服務完成後，積分將自動發放至您的帳戶。
                </p>
              </div>

              <button 
                type="submit"
                className="w-full bg-brand-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-brand-500/20 hover:bg-brand-700 transition-colors"
              >
                發佈服務
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Marketplace;
