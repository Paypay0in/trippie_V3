
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from "motion/react";
import { Phase, Expense, Category, Trip, PaymentMethod, Companion, ShoppingItem, TaxRule, VisaInfo, PublicTrip, UserProfile, TravelBook, ItineraryItem, MarketplaceService, InboxMessage } from './types';
import { fetchTaxRefundRules, parseImageExpenseWithGemini, generateTravelBook, extractItineraryFromExpenses, recommendTrips, findCheapestTimes } from './services/geminiService';
import { CATEGORIES_BY_PHASE, COMMON_CURRENCIES } from './constants';
import PhaseSelector from './components/PhaseSelector';
import ExpenseForm from './components/ExpenseForm';
import ExpenseList from './components/ExpenseList';
import Dashboard from './components/Dashboard';
import PreTripChecklist from './components/PreTripChecklist';
import PostTripChecklist from './components/PostTripChecklist';
import ShoppingListPanel from './components/ShoppingListPanel';
import TripSummaryModal from './components/TripSummaryModal';
import CompanionsModal from './components/CompanionsModal';
import CountrySettingsModal from './components/CountrySettingsModal';
import TripSelectionScreen from './components/TripSelectionScreen';
import VisaCheckModal from './components/VisaCheckModal';
import CommunityFeed from './components/CommunityFeed';
import Marketplace from './components/Marketplace';
import ItineraryCalendar from './components/ItineraryCalendar';
import TravelBookView from './components/TravelBookView';
import PointsDashboard from './components/PointsDashboard';
import MapExplorer from './components/MapExplorer';
import { Plus, CheckCircle, Trash2, Users, Globe, ArrowLeft, Book, Pencil, CalendarDays, Info, Users2, ShoppingBag, Map as MapIcon, Award, Sparkles, Receipt, Share2 } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import QRShareModal from './components/QRShareModal';

// Helper to generate unique IDs safe for all environments
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
};

// Helper to calculate date range from expenses (Fallback if no explicit date set)
const getExpenseDateRange = (expensesList: Expense[]) => {
    if (expensesList.length === 0) {
        const today = new Date().toISOString();
        return { start: today, end: today };
    }
    const sorted = [...expensesList].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return { start: sorted[0].date, end: sorted[sorted.length - 1].date };
};

// Helper to format date range for display (e.g. 2024/01/01 - 01/05)
const formatDateRange = (s: string, e: string) => {
    if (!s || !e) return '';
    const start = s.split('T')[0].replace(/-/g, '/');
    const end = e.split('T')[0].replace(/-/g, '/');
    if (start === end) return start;
    // Check if same year
    if (start.substring(0, 4) === end.substring(0, 4)) {
        return `${start} - ${end.substring(5)}`;
    }
    return `${start} - ${end}`;
};

// Helper to migrate legacy expenses
const migrateExpenses = (data: any[]): Expense[] => {
    return data.map(e => {
        let updated = { ...e };
        if (updated.paymentMethod === '現金') {
            updated.paymentMethod = updated.currency === 'TWD' ? PaymentMethod.CASH_TWD : PaymentMethod.CASH_FOREIGN;
        }
        if (!updated.payerId) {
            updated.payerId = 'me';
            updated.beneficiaries = ['me'];
        }
        if (!updated.splitMethod) {
            updated.splitMethod = 'EQUAL';
            updated.splitAllocations = {};
        }
        // Ensure needsReview is preserved if present
        if (updated.needsReview === undefined) {
             updated.needsReview = false;
        }
        return updated as Expense;
    });
};

// Helper to migrate legacy shopping list
const migrateShoppingList = (data: any[]): ShoppingItem[] => {
    return data.map(item => ({
        ...item,
        phase: item.phase || 'pre' // Default legacy items to 'pre'
    }));
};

const App: React.FC = () => {
  // Navigation State
  const [viewMode, setViewMode] = useState<'bookshelf' | 'trip' | 'community' | 'marketplace' | 'points' | 'map'>('bookshelf');

  const [userId] = useState<string>(() => {
    let id = localStorage.getItem('trippie_user_id');
    if (!id) {
      id = generateId();
      localStorage.setItem('trippie_user_id', id);
    }
    return id;
  });

  const [friends, setFriends] = useState<Companion[]>(() => {
    const saved = localStorage.getItem('trippie_friends');
    return saved ? JSON.parse(saved) : [];
  });

  const [socket, setSocket] = useState<Socket | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const [currentPhase, setCurrentPhase] = useState<Phase>('pre');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCompanionsOpen, setIsCompanionsOpen] = useState(false);
  const [isCountryModalOpen, setIsCountryModalOpen] = useState(false);
  const [isVisaModalOpen, setIsVisaModalOpen] = useState(false);
  const [isTravelBookOpen, setIsTravelBookOpen] = useState(false);
  
  // Community & Social State
  const [publicTrips, setPublicTrips] = useState<PublicTrip[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('trippie_profile');
    return saved ? JSON.parse(saved) : {
      id: 'me',
      name: '旅人',
      points: 1200,
      trippieCoins: 50,
      level: 3
    };
  });
  const [itinerary, setItinerary] = useState<ItineraryItem[]>([]);
  const [travelBook, setTravelBook] = useState<TravelBook | null>(null);
  const [marketplaceServices, setMarketplaceServices] = useState<MarketplaceService[]>([
    {
      id: 's1',
      providerName: 'Yuki',
      serviceType: 'BOOKING',
      title: '代訂日本米其林餐廳',
      description: '協助預訂東京、大阪熱門餐廳，保證成功率 90% 以上。',
      price: 500,
      currency: 'TWD',
      rating: 4.9
    },
    {
      id: 's2',
      providerName: 'Marco',
      serviceType: 'GUIDE',
      title: '羅馬私房景點導覽',
      description: '帶你走進觀光客不知道的小巷弄，體驗最道地的義大利生活。',
      price: 1200,
      currency: 'TWD',
      rating: 4.8
    }
  ]);

  const [inboxMessages, setInboxMessages] = useState<InboxMessage[]>([
    { id: 'msg1', serviceTitle: '代訂京都米其林餐廳', sender: 'Alice', lastMessage: '請問下週三晚上還有空位嗎？', time: '10:30 AM', unread: true },
    { id: 'msg2', serviceTitle: '東京地鐵一日導覽', sender: 'Bob', lastMessage: '好的，那我們明天早上 9 點在新宿站見！', time: '昨天', unread: false },
  ]);

  const unreadInboxCount = inboxMessages.filter(m => m.unread).length;
  
  // Form Prefill State
  const [initialFormCategory, setInitialFormCategory] = useState<Category | undefined>(undefined);
  const [initialFormDescription, setInitialFormDescription] = useState<string | undefined>(undefined);
  const [initialFormAmount, setInitialFormAmount] = useState<number | undefined>(undefined);
  const [initialFormCurrency, setInitialFormCurrency] = useState<string | undefined>(undefined);
  const [formLinkedItemId, setFormLinkedItemId] = useState<string | undefined>(undefined);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>(undefined);
  
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  
  // Country & Tax Rules
  const [travelCountry, setTravelCountry] = useState<string>(() => {
      return localStorage.getItem('trippie_country') || '';
  });
  
  const [originCountry, setOriginCountry] = useState<string>(() => {
      return localStorage.getItem('trippie_origin_country') || '台灣';
  });

  const [taxRule, setTaxRule] = useState<TaxRule | null>(() => {
      const saved = localStorage.getItem('trippie_tax_rule');
      return saved ? JSON.parse(saved) : null;
  });

  // Visa Info State (Persisted)
  const [visaInfo, setVisaInfo] = useState<VisaInfo | null>(() => {
      const saved = localStorage.getItem('trippie_visa_info');
      return saved ? JSON.parse(saved) : null;
  });

  const [isFetchingTaxRule, setIsFetchingTaxRule] = useState(false);

  // Companions State
  const [companions, setCompanions] = useState<Companion[]>(() => {
    const saved = localStorage.getItem('trippie_companions');
    return saved ? JSON.parse(saved) : [];
  });

  // Shopping List State
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>(() => {
      const saved = localStorage.getItem('trippie_shopping_list');
      return saved ? migrateShoppingList(JSON.parse(saved)) : [];
  });

  // Current Expenses (The Active Draft)
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const saved = localStorage.getItem('trippie_expenses');
    return saved ? migrateExpenses(JSON.parse(saved)) : [];
  });

  // Trip Dates (Explicitly set by AI or User, separate from expense dates)
  const [tripStartDate, setTripStartDate] = useState<string>(() => {
      return localStorage.getItem('trippie_trip_start_date') || '';
  });
  const [tripEndDate, setTripEndDate] = useState<string>(() => {
      return localStorage.getItem('trippie_trip_end_date') || '';
  });

  // Track which historical trip is currently loaded
  const [currentLoadedTripId, setCurrentLoadedTripId] = useState<string | null>(() => {
    return localStorage.getItem('trippie_current_trip_id');
  });

  // Draft Name State (For new trips before archiving)
  const [draftName, setDraftName] = useState<string>(() => {
      return localStorage.getItem('trippie_draft_name') || '';
  });

  // Socket Connection & Sync
  useEffect(() => {
    const newSocket = io(window.location.origin);
    setSocket(newSocket);

    newSocket.on('trip-update', (newState: any) => {
      if (newState.expenses) setExpenses(newState.expenses);
      if (newState.companions) setCompanions(newState.companions);
      if (newState.shoppingList) setShoppingList(newState.shoppingList);
      if (newState.startDate) setTripStartDate(newState.startDate);
      if (newState.endDate) setTripEndDate(newState.endDate);
      if (newState.name) setDraftName(newState.name);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  // Sync state to server when it changes and we are in a shared trip
  useEffect(() => {
    if (socket && currentLoadedTripId) {
      socket.emit('update-trip', {
        tripId: currentLoadedTripId,
        state: {
          expenses,
          companions,
          shoppingList,
          startDate: tripStartDate,
          endDate: tripEndDate,
          name: draftName
        }
      });
    }
  }, [expenses, companions, shoppingList, tripStartDate, tripEndDate, draftName, socket, currentLoadedTripId]);

  useEffect(() => {
    if (socket && currentLoadedTripId) {
      socket.emit('join-trip', currentLoadedTripId);
    }
  }, [socket, currentLoadedTripId]);

  const handleScanSuccess = (data: any) => {
    if (data.type === 'SHARE_TRIP') {
      // 1. Add to friends if not already there
      const isFriend = friends.some(f => f.id === data.userId);
      if (!isFriend) {
        const newFriend = { id: data.userId, name: data.userName };
        const updatedFriends = [...friends, newFriend];
        setFriends(updatedFriends);
        localStorage.setItem('trippie_friends', JSON.stringify(updatedFriends));
        showToast(`已將 ${data.userName} 加入好友`);
      }

      // 2. If tripId is present, join the trip
      if (data.tripId) {
        setCurrentLoadedTripId(data.tripId);
        localStorage.setItem('trippie_current_trip_id', data.tripId);
        setDraftName(data.tripName || '共享旅程');
        setViewMode('trip');
        showToast(`已加入共享旅程：${data.tripName}`);
        
        // Add the owner as a companion if not already there
        const isCompanion = companions.some(c => c.id === data.userId);
        if (!isCompanion) {
          setCompanions(prev => [...prev, { id: data.userId, name: data.userName }]);
        }
      }
      
      setIsShareModalOpen(false);
    }
  };

  const handleOpenShareModal = () => {
    if (!currentLoadedTripId) {
      const newId = generateId();
      setCurrentLoadedTripId(newId);
      localStorage.setItem('trippie_current_trip_id', newId);
      if (!draftName) {
        setDraftName('新共享旅程');
        localStorage.setItem('trippie_draft_name', '新共享旅程');
      }
    }
    setIsShareModalOpen(true);
  };

  // Archived Trips
  const [tripHistory, setTripHistory] = useState<Trip[]>(() => {
    const saved = localStorage.getItem('trippie_history');
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return parsed.map((trip: any) => ({
        ...trip,
        expenses: migrateExpenses(trip.expenses),
        companions: trip.companions || [],
        shoppingList: trip.shoppingList ? migrateShoppingList(trip.shoppingList) : [],
        taxRule: trip.taxRule || undefined, // Ensure legacy data works
        visaInfo: trip.visaInfo || undefined // New field support
    }));
  });

  // Determine initial view mode
  useEffect(() => {
     // Persist logic handled by localStorage hooks below
  }, []);

  // Persistance
  useEffect(() => { localStorage.setItem('trippie_expenses', JSON.stringify(expenses)); }, [expenses]);
  useEffect(() => { localStorage.setItem('trippie_companions', JSON.stringify(companions)); }, [companions]);
  useEffect(() => { localStorage.setItem('trippie_shopping_list', JSON.stringify(shoppingList)); }, [shoppingList]);
  useEffect(() => { localStorage.setItem('trippie_profile', JSON.stringify(userProfile)); }, [userProfile]);

  // Load public trips (Mock for now, but ready for real API)
  useEffect(() => {
    const mockPublic: PublicTrip[] = tripHistory.filter(t => t.expenses.length > 5).map(t => ({
      ...t,
      authorName: '匿名旅人',
      likes: Math.floor(Math.random() * 100),
      clones: Math.floor(Math.random() * 50),
      isPublic: true,
      tags: ['自助旅行', '美食之旅'],
      photos: []
    }));
    setPublicTrips(mockPublic);
  }, [tripHistory]);

  // AI Itinerary Auto-generation
  useEffect(() => {
    if (viewMode === 'trip' && expenses.length > 3) {
      extractItineraryFromExpenses(expenses).then(setItinerary);
    }
  }, [expenses, viewMode]);
  useEffect(() => { localStorage.setItem('trippie_country', travelCountry); }, [travelCountry]);
  useEffect(() => { localStorage.setItem('trippie_origin_country', originCountry); }, [originCountry]);
  useEffect(() => { localStorage.setItem('trippie_draft_name', draftName); }, [draftName]);
  useEffect(() => { localStorage.setItem('trippie_trip_start_date', tripStartDate); }, [tripStartDate]);
  useEffect(() => { localStorage.setItem('trippie_trip_end_date', tripEndDate); }, [tripEndDate]);
  useEffect(() => { 
      if (taxRule) localStorage.setItem('trippie_tax_rule', JSON.stringify(taxRule)); 
      else localStorage.removeItem('trippie_tax_rule');
  }, [taxRule]);
  useEffect(() => { 
      if (visaInfo) localStorage.setItem('trippie_visa_info', JSON.stringify(visaInfo)); 
      else localStorage.removeItem('trippie_visa_info');
  }, [visaInfo]);
  
  useEffect(() => {
    if (currentLoadedTripId) {
        localStorage.setItem('trippie_current_trip_id', currentLoadedTripId);
    } else {
        localStorage.removeItem('trippie_current_trip_id');
    }
  }, [currentLoadedTripId]);

  // Toast Timer
  useEffect(() => {
    if (toast) {
        const timer = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
      setToast({ msg, type });
  };

  // Helper to determine active trip name
  const currentTripName = currentLoadedTripId 
      ? tripHistory.find(t => t.id === currentLoadedTripId)?.name || ''
      : draftName;

  // --- Handlers ---
  const handleNameChange = (newName: string) => {
      if (currentLoadedTripId) {
          // Update historical trip name immediately
          setTripHistory(prev => prev.map(t => t.id === currentLoadedTripId ? { ...t, name: newName } : t));
      } else {
          // Update draft name
          setDraftName(newName);
      }
  };

  // Logic for renaming from bookshelf
  const handleRenameFromBookshelf = (id: string | null, newName: string) => {
      if (id === null) {
          // It's the draft
          setDraftName(newName);
      } else {
          // It's a historical trip
          setTripHistory(prev => prev.map(t => t.id === id ? { ...t, name: newName } : t));
      }
      showToast('已更新旅程名稱');
  };

  const handleSaveCountry = async (country: string) => {
    if (country === travelCountry && taxRule) {
        setIsCountryModalOpen(false);
        // If we have country but no Visa Info, trigger check
        if (!visaInfo) setIsVisaModalOpen(true);
        return;
    }
    
    setTravelCountry(country);
    setVisaInfo(null); // Reset visa info on country change
    setIsFetchingTaxRule(true);
    setTaxRule(null); // Clear old rule
    
    try {
        const rule = await fetchTaxRefundRules(country);
        if (rule) {
            setTaxRule(rule);
            showToast(`已更新：${rule.country} 退稅門檻 ${rule.minSpend} ${rule.currency}`);
            setIsCountryModalOpen(false);
            // Trigger Visa Check
            setTimeout(() => setIsVisaModalOpen(true), 500);
        } else {
            showToast("查無此國家的退稅資訊，請確認名稱是否正確", "error");
        }
    } catch (e) {
        showToast("連線錯誤，請稍後再試", "error");
    } finally {
        setIsFetchingTaxRule(false);
    }
  };

  const handleSaveVisaInfo = (info: VisaInfo) => {
      setVisaInfo(info);
      setOriginCountry(info.origin); // Update user's origin preference
  };

  const handleAddVisaExpense = (info: VisaInfo) => {
      // Instead of adding an expense directly, we add it to the Shopping List (Pre-trip To-Do)
      const newItem: ShoppingItem = {
          id: generateId(),
          name: `${info.visaName || '簽證'}申請`,
          isPurchased: false,
          phase: 'pre',
          estimatedAmount: info.feeAmount, // Save Estimated Cost
          estimatedCurrency: info.feeCurrency
      };

      setShoppingList(prev => [...prev, newItem]);
      showToast("已將簽證列入行前待辦清單");
  };

  const handleAddCompanion = (name: string) => {
    const newCompanion = { id: generateId(), name };
    setCompanions(prev => [...prev, newCompanion]);
    showToast(`已新增旅伴：${name}`);
  };

  const handleAddFriendToTrip = (friend: Companion) => {
    setCompanions(prev => [...prev, friend]);
    showToast(`已將好友 ${friend.name} 加入此旅程`);
  };

  const handleRemoveCompanion = (id: string) => {
    setCompanions(prev => prev.filter(c => c.id !== id));
    showToast("已移除旅伴", "error");
  };

  const handleAddShoppingItem = (name: string) => {
      const effectivePhase = currentPhase === 'summary' ? 'post' : currentPhase;
      setShoppingList(prev => [...prev, { 
          id: generateId(), 
          name, 
          isPurchased: false,
          phase: effectivePhase
      }]);
      showToast("已新增購物清單項目");
  };

  const handleBatchAddShoppingItems = (items: string[], targetTripId: string | 'new' | 'draft', newTripName?: string, detectedCountry?: string) => {
      const newItems: ShoppingItem[] = items.map(name => ({
          id: generateId(),
          name,
          isPurchased: false,
          phase: 'pre' // Default to pre-trip for AI suggestions
      }));

      if (targetTripId === 'new') {
          // Clear current draft state and start fresh
          if (expenses.length > 0) {
              // Safety check handled by user choice implicitly, but if we wanted to be safe we'd warn.
              // For now, "New Trip" implies starting fresh on the workspace.
          }
          setExpenses([]);
          setCompanions([]);
          setShoppingList(newItems);
          setCurrentLoadedTripId(null);
          setDraftName(newTripName || '');
          setTripStartDate('');
          setTripEndDate('');
          setCurrentPhase('pre');
          setTravelCountry('');
          setTaxRule(null);
          setVisaInfo(null);
          
          // Auto-set Country if detected from AI
          if (detectedCountry) {
              setTravelCountry(detectedCountry);
              showToast(`已自動設定國家：${detectedCountry}`);
              
              // Fetch Tax Rule automatically
              fetchTaxRefundRules(detectedCountry).then(rule => {
                 if (rule) {
                     setTaxRule(rule);
                     showToast(`已自動套用 ${detectedCountry} 退稅規則`);
                 }
             });
             // Trigger Visa Check
             setTimeout(() => setIsVisaModalOpen(true), 1200);
          }
          
          setViewMode('trip');
          showToast(`已建立新旅程並加入 ${newItems.length} 個待買項目`);

      } else if (targetTripId === 'draft') {
          // Add to current workspace
          setShoppingList(prev => [...prev, ...newItems]);
          showToast(`已加入 ${newItems.length} 個項目至草稿`);
          
      } else {
          // Add to historical trip
          setTripHistory(prev => prev.map(t => {
              if (t.id === targetTripId) {
                  return {
                      ...t,
                      shoppingList: [...(t.shoppingList || []), ...newItems]
                  };
              }
              return t;
          }));
          showToast(`已加入 ${newItems.length} 個項目至指定旅程`);
      }
  };

  const handleRemoveShoppingItem = (id: string) => {
      setShoppingList(prev => prev.filter(item => item.id !== id));
  };

  const handlePurchaseShoppingItem = (item: ShoppingItem) => {
      // Default category based on phase logic (assuming item.phase matches context)
      let defaultCat = Category.SHOPPING;
      if (item.phase === 'pre') defaultCat = Category.SHOPPING_PRE;
      if (item.name.includes('簽證')) defaultCat = Category.VISA; // Auto detect Visa
      if (item.phase === 'post') defaultCat = Category.SOUVENIR;

      setInitialFormCategory(defaultCat);
      setInitialFormDescription(item.name);
      // Auto-fill amount/currency if available (e.g. from Visa info)
      if (item.estimatedAmount) setInitialFormAmount(item.estimatedAmount);
      if (item.estimatedCurrency) setInitialFormCurrency(item.estimatedCurrency);
      
      setFormLinkedItemId(item.id);
      setIsFormOpen(true);
  };

  const handleSaveExpense = (data: Omit<Expense, 'id'>, linkedItemId?: string) => {
    if (editingExpense) {
        setExpenses(prev => prev.map(e => e.id === editingExpense.id ? { ...data, id: e.id } : e));
    } else {
        const expense: Expense = { 
            ...data, 
            id: generateId(),
            linkedShoppingItemId: linkedItemId // Link expense to shopping item
        };
        setExpenses(prev => [...prev, expense]);
        
        if (linkedItemId) {
            setShoppingList(prev => prev.map(item => 
                item.id === linkedItemId ? { ...item, isPurchased: true } : item
            ));
        }
        
        // Custom toast for auto-creation
        if (data.needsReview) {
            showToast("已建立支出，但部分內容可能需要確認", "error");
        } else if (!editingExpense) {
            // Standard create
            showToast("已新增支出");
        }
    }
  };

  const handleDeleteExpense = (id: string) => {
    const targetExpense = expenses.find(e => e.id === id);
    
    // If this expense was linked to a shopping item, revert that item to unpurchased
    if (targetExpense && targetExpense.linkedShoppingItemId) {
        setShoppingList(prev => prev.map(item => 
            item.id === targetExpense.linkedShoppingItemId ? { ...item, isPurchased: false } : item
        ));
    }

    setExpenses(prev => prev.filter(e => e.id !== id));
    showToast("已刪除該筆支出", "error");
  };

  const handleEditExpense = (expense: Expense) => {
      setEditingExpense(expense);
      setIsFormOpen(true);
  };

  const handleArchiveTrip = (name: string, totalCost: number) => {
    try {
        // Use explicit trip dates if available, otherwise calculate from expenses
        let start = tripStartDate;
        let end = tripEndDate;
        
        if (!start || !end) {
            const range = getExpenseDateRange(expenses);
            start = range.start;
            end = range.end;
        }

        const newTrip: Trip = {
            id: generateId(),
            name,
            startDate: start,
            endDate: end,
            expenses: [...expenses], 
            companions: [...companions],
            shoppingList: [...shoppingList],
            totalCost,
            archivedAt: new Date().toISOString(),
            taxRule: taxRule || undefined,
            visaInfo: visaInfo || undefined
        };

        setTripHistory(prev => [newTrip, ...prev]);
        setExpenses([]); 
        setCompanions([]); 
        setShoppingList([]);
        setCurrentLoadedTripId(null); 
        setDraftName(''); // Clear draft name
        setTripStartDate('');
        setTripEndDate('');
        setCurrentPhase('pre'); 
        setTravelCountry('');
        setTaxRule(null);
        setVisaInfo(null);
        
        showToast("旅程已成功封存！");
        setViewMode('bookshelf'); // Go back to shelf
    } catch (e) {
        console.error(e);
        showToast("封存失敗，請稍後再試", "error");
    }
  };

  const handleRestoreTrip = (trip: Trip) => {
    // If there is active data that hasn't been archived, warn user? 
    if (expenses.length > 0 && !currentLoadedTripId) {
        const confirmSwitch = window.confirm("您目前有正在編輯但未封存的草稿，切換旅程將會覆蓋它。確定要繼續嗎？");
        if (!confirmSwitch) return;
    }

    setExpenses(trip.expenses);
    setCompanions(trip.companions || []);
    setShoppingList(trip.shoppingList || []);
    setCurrentLoadedTripId(trip.id); 
    setTripStartDate(trip.startDate);
    setTripEndDate(trip.endDate);
    
    // Restore Tax Rule
    if (trip.taxRule) {
        setTaxRule(trip.taxRule);
        setTravelCountry(trip.taxRule.country);
    } else {
        setTaxRule(null);
        setTravelCountry('');
    }

    // Restore Visa Info
    if (trip.visaInfo) {
        setVisaInfo(trip.visaInfo);
    } else {
        setVisaInfo(null);
    }
    
    // Determine start phase based on data
    const hasPost = trip.expenses.some(e => e.phase === 'post');
    const hasDuring = trip.expenses.some(e => e.phase === 'during');
    
    if (hasPost) { setCurrentPhase('post'); } 
    else if (hasDuring) { setCurrentPhase('during'); } 
    else { setCurrentPhase('pre'); }
    
    setViewMode('trip');
    showToast(`已打開：${trip.name}`);
  };

  const handleOpenDraft = () => {
      setViewMode('trip');
  };

  const handleCreateNewTrip = () => {
      if (expenses.length > 0) {
           const confirmNew = window.confirm("您目前有正在編輯的草稿，建立新旅程將會清空它。確定要繼續嗎？");
           if (!confirmNew) return;
      }
      
      setExpenses([]);
      setCompanions([]);
      setShoppingList([]);
      setCurrentLoadedTripId(null);
      setDraftName(''); // Clear draft name
      setTripStartDate('');
      setTripEndDate('');
      setCurrentPhase('pre');
      setTravelCountry('');
      setTaxRule(null);
      setVisaInfo(null);
      
      setViewMode('trip');
      showToast("新旅程已開啟，開始記帳吧！");
  };

  const handleDeleteHistory = (id: string) => {
      if (window.confirm("確定要刪除這本旅程紀錄嗎？此動作無法復原。")) {
        setTripHistory(prev => prev.filter(t => t.id !== id));
        showToast("已刪除旅程紀錄", "error");
      }
  };

  const handleCloneTrip = (publicTrip: PublicTrip) => {
    const confirmClone = window.confirm(`確定要複製「${publicTrip.name}」的行程規劃嗎？這將會建立一個新的草稿。`);
    if (!confirmClone) return;

    // Clone expenses but reset IDs and dates
    const today = new Date().toISOString().split('T')[0];
    const clonedExpenses: Expense[] = publicTrip.expenses.map(e => ({
      ...e,
      id: generateId(),
      date: today,
      needsReview: true // Mark for review since dates/rates might change
    }));

    setExpenses(clonedExpenses);
    setDraftName(`複製自: ${publicTrip.name}`);
    setShoppingList(publicTrip.shoppingList || []);
    setTravelCountry(publicTrip.taxRule?.country || '');
    setTaxRule(publicTrip.taxRule || null);
    setCurrentLoadedTripId(null);
    setViewMode('trip');
    showToast("行程已複製！請檢查支出日期與匯率。");
  };

  const handleGenerateTravelBook = async () => {
    if (expenses.length < 3) {
      showToast("支出太少，無法產生回憶錄", "error");
      return;
    }
    
    showToast("AI 正在編寫您的旅程回憶錄...");
    const currentTrip: Trip = {
      id: currentLoadedTripId || 'draft',
      name: currentTripName,
      startDate: tripStartDate,
      endDate: tripEndDate,
      expenses,
      companions,
      shoppingList,
      totalCost: expenses.reduce((sum, e) => sum + e.twdAmount, 0),
      archivedAt: new Date().toISOString()
    };

    const book = await generateTravelBook(currentTrip);
    if (book) {
      setTravelBook(book);
      setIsTravelBookOpen(true);
      // Reward points for using AI
      setUserProfile(prev => ({ ...prev, points: prev.points + 100 }));
    } else {
      showToast("產生失敗，請稍後再試", "error");
    }
  };

  const handleBookService = (service: MarketplaceService) => {
    if (userProfile.trippieCoins < service.price) {
      showToast("Trippie Coins 不足，請先賺取積分", "error");
      return;
    }
    
    const confirm = window.confirm(`確定要花費 ${service.price} Trippie Coins 預約「${service.title}」嗎？`);
    if (confirm) {
      setUserProfile(prev => ({ ...prev, trippieCoins: prev.trippieCoins - service.price }));
      showToast("預約成功！當地人將在 24 小時內與您聯繫。");
    }
  };

  const handleAddMarketplaceService = (service: Omit<MarketplaceService, 'id' | 'rating'>) => {
    const newService: MarketplaceService = {
      ...service,
      id: generateId(),
      rating: 5.0
    };
    setMarketplaceServices(prev => [newService, ...prev]);
    showToast("服務已成功發佈！");
  };

  // Helper to get exchange rate synchronously
  const getRateForAutoSave = (currencyCode: string, paymentMethod: PaymentMethod, currentExpenses: Expense[]) => {
      if (currencyCode === 'TWD') return 1;
      
      if (paymentMethod === PaymentMethod.CASH_FOREIGN) {
          const exchanges = currentExpenses.filter(e => e.category === Category.EXCHANGE && e.currency === currencyCode);
          if (exchanges.length > 0) {
              const totalForeign = exchanges.reduce((acc, curr) => acc + curr.amount, 0);
              const totalCostTwd = exchanges.reduce((acc, curr) => acc + curr.twdAmount, 0);
              if (totalForeign > 0) return totalCostTwd / totalForeign;
          }
      }
      
      const target = COMMON_CURRENCIES.find(c => c.code === currencyCode);
      return target ? target.defaultRate : 1;
  };

  // Smart Scan Handler Logic - REFACTORED FOR BATCH PROCESSING
  const handleSmartScanBatch = async (files: FileList) => {
    // Helper to convert file to Base64
    const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });

    // Temporary storage for results before updating state
    let newDraftExpenses: Expense[] = [];
    const historyUpdates: { id: string; expense: Expense }[] = [];
    let detectedCountry = '';
    let successCount = 0;
    
    // Helper to check if file belongs to a trip (by date)
    const findMatchingTripId = (date: string) => {
        return tripHistory.find(trip => {
             if (trip.expenses.length === 0) return false;
             const start = trip.startDate;
             const end = trip.endDate;
             return date >= start && date <= end;
        })?.id;
    };

    // PROCESS FILES SEQUENTIALLY to avoid rate limits and logic race conditions
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const base64String = await toBase64(file);
            const base64Data = base64String.split(',')[1];
            
            // Call AI
            const result = await parseImageExpenseWithGemini(base64Data, file.type);
            
            if (result && result.amount) {
                const parsedAmount = result.amount;
                const parsedCurrency = result.currency?.toUpperCase() || 'TWD';
                const parsedCategory = (Object.values(Category).find(c => c === result.category) as Category) || Category.OTHER;
                const parsedPayment = (Object.values(PaymentMethod).find(p => p === result.paymentMethod) as PaymentMethod) || PaymentMethod.CASH_TWD;
                const parsedDate = result.date || new Date().toISOString().split('T')[0];
                if (result.country && !detectedCountry) detectedCountry = result.country; // Capture first detected country

                let inferredPhase: Phase = 'during';
                if (CATEGORIES_BY_PHASE.pre.includes(parsedCategory)) inferredPhase = 'pre';
                if (CATEGORIES_BY_PHASE.post.includes(parsedCategory)) inferredPhase = 'post';

                const newExpenseId = generateId();

                // Check History Match
                const matchedTripId = findMatchingTripId(parsedDate);

                if (matchedTripId) {
                     // Get existing expenses for rate calc (need to find from history)
                     const targetTrip = tripHistory.find(t => t.id === matchedTripId);
                     const existingExps = targetTrip ? targetTrip.expenses : [];
                     const rate = getRateForAutoSave(parsedCurrency, parsedPayment, existingExps);

                     const newExpense: Expense = {
                        id: newExpenseId,
                        description: result.description || '智慧匯入項目',
                        amount: parsedAmount,
                        currency: parsedCurrency,
                        exchangeRate: rate,
                        twdAmount: parsedAmount * rate,
                        category: parsedCategory,
                        paymentMethod: parsedPayment,
                        phase: inferredPhase, 
                        date: parsedDate,
                        payerId: 'me',
                        beneficiaries: ['me'],
                        splitMethod: 'EQUAL',
                        splitAllocations: {},
                        handlingFee: 0,
                        needsReview: result.isUncertain
                    };
                    historyUpdates.push({ id: matchedTripId, expense: newExpense });

                } else {
                    // Default to Current Draft (which might be empty/new)
                    // We need to calculate rate based on *current accumulated draft* + *existing draft*
                    const combinedDraft = [...expenses, ...newDraftExpenses];
                    const rate = getRateForAutoSave(parsedCurrency, parsedPayment, combinedDraft);
                    
                    const newExpense: Expense = {
                        id: newExpenseId,
                        description: result.description || '智慧匯入項目',
                        amount: parsedAmount,
                        currency: parsedCurrency,
                        exchangeRate: rate,
                        twdAmount: parsedAmount * rate,
                        category: parsedCategory,
                        paymentMethod: parsedPayment,
                        phase: inferredPhase,
                        date: parsedDate,
                        payerId: 'me',
                        // If current companions exist, include them, otherwise just me
                        beneficiaries: companions.length > 0 ? ['me', ...companions.map(c => c.id)] : ['me'],
                        splitMethod: 'EQUAL',
                        splitAllocations: {},
                        handlingFee: 0,
                        needsReview: result.isUncertain
                    };
                    newDraftExpenses.push(newExpense);
                    
                    // Update Trip Dates if AI found explicit Travel Range (only if draft was empty)
                    if (result.travelStartDate && result.travelEndDate && expenses.length === 0 && newDraftExpenses.length === 1) {
                         setTripStartDate(result.travelStartDate);
                         setTripEndDate(result.travelEndDate);
                    }
                }
                successCount++;
            }
        } catch (e) {
            console.error(`Error parsing file ${file.name}`, e);
            // Continue to next file even if one fails
        }
    }

    // --- BATCH STATE UPDATES ---

    // 1. Update History
    if (historyUpdates.length > 0) {
        setTripHistory(prev => prev.map(trip => {
            const updatesForThisTrip = historyUpdates.filter(u => u.id === trip.id).map(u => u.expense);
            if (updatesForThisTrip.length > 0) {
                return {
                    ...trip,
                    expenses: [...trip.expenses, ...updatesForThisTrip]
                };
            }
            return trip;
        }));
    }

    // 2. Update Draft
    if (newDraftExpenses.length > 0) {
        // If we detected a country and it hasn't been set for the current trip
        if (detectedCountry && !travelCountry) {
             setTravelCountry(detectedCountry);
             showToast(`已自動偵測國家：${detectedCountry}`);
             
             fetchTaxRefundRules(detectedCountry).then(rule => {
                 if (rule) {
                     setTaxRule(rule);
                     showToast(`已自動套用 ${detectedCountry} 退稅規則`);
                 }
             });
             
             // RESTORED: Trigger Visa Check
             setTimeout(() => setIsVisaModalOpen(true), 1200);
        }

        // Set default name if fresh
        if (expenses.length === 0 && !draftName) {
            const nameCountry = detectedCountry || '';
            setDraftName(`${new Date().toISOString().split('T')[0]} ${nameCountry} 新旅程`.trim());
        }
        
        // Determine phase based on last added item
        const lastPhase = newDraftExpenses[newDraftExpenses.length - 1].phase;
        setCurrentPhase(lastPhase);
        
        setExpenses(prev => [...prev, ...newDraftExpenses]);
    }

    // 3. Navigation & Feedback Logic
    if (successCount === 0) {
        showToast("所有圖片皆無法識別，請重試", "error");
        return;
    }

    // Scenario A: All went to ONE specific history trip
    const uniqueHistoryIds = Array.from(new Set(historyUpdates.map(u => u.id)));
    
    if (newDraftExpenses.length === 0 && uniqueHistoryIds.length === 1) {
        // Restore that trip and open it
        const tripId = uniqueHistoryIds[0];
        const targetTrip = tripHistory.find(t => t.id === tripId);
        // We need the *updated* trip, but state update is async.
        // We can manually reconstruct the open state.
        if (targetTrip) {
            // Re-merge the new expenses we just calculated
            const addedExpenses = historyUpdates.filter(u => u.id === tripId).map(u => u.expense);
            const mergedExpenses = [...targetTrip.expenses, ...addedExpenses];
            
            // Call restore logic manually
            setExpenses(mergedExpenses);
            setCompanions(targetTrip.companions || []);
            setShoppingList(targetTrip.shoppingList ? migrateShoppingList(targetTrip.shoppingList) : []);
            setCurrentLoadedTripId(targetTrip.id);
            setTripStartDate(targetTrip.startDate);
            setTripEndDate(targetTrip.endDate);
            if (targetTrip.taxRule) {
                setTaxRule(targetTrip.taxRule);
                setTravelCountry(targetTrip.taxRule.country);
            }
             if (targetTrip.visaInfo) setVisaInfo(targetTrip.visaInfo);
            
            setViewMode('trip');
            showToast(`成功匯入 ${successCount} 筆至「${targetTrip.name}」`);
            return;
        }
    }

    // Scenario B: All went to Draft (or Mixed, but we prioritize opening draft if it was empty)
    if (newDraftExpenses.length > 0 && uniqueHistoryIds.length === 0) {
        // Just open the draft
        setViewMode('trip');
        showToast(`成功匯入 ${successCount} 筆至當前草稿`);
        return;
    }

    // Scenario C: Mixed (Some to history, some to draft) OR Multiple Histories
    // Stay on bookshelf and show summary
    let msg = `已處理 ${successCount} 張單據：`;
    if (newDraftExpenses.length > 0) msg += `${newDraftExpenses.length}筆入草稿 `;
    if (historyUpdates.length > 0) msg += `${historyUpdates.length}筆歸檔歷史 `;
    
    showToast(msg);
    // Do not change viewMode, stay on bookshelf to let user choose
  };

  const handleExport = () => {
    const headers = ['日期', '階段', '分類', '付款方式', '項目', '原幣金額', '幣別', '匯率', '手續費(TWD)', '總台幣金額', '付款人', '分攤人/分帳詳情'];
    const csvContent = [
        headers.join(','),
        ...expenses.map(e => {
            const payerName = e.payerId === 'me' ? '我' : companions.find(c => c.id === e.payerId)?.name || '未知';
            let beneficiaryInfo = '';
            
            if (e.splitMethod === 'EQUAL') {
                beneficiaryInfo = e.beneficiaries.map(id => id === 'me' ? '我' : companions.find(c => c.id === id)?.name || '').join(';');
            } else {
                beneficiaryInfo = Object.entries(e.splitAllocations)
                    .map(([id, amount]) => {
                        const name = id === 'me' ? '我' : companions.find(c => c.id === id)?.name || '未知';
                        return `${name}:$${Math.round(amount as number)}`;
                    })
                    .join(';');
            }

            return [
                e.date,
                e.phase === 'pre' ? '旅行前' : e.phase === 'during' ? '旅行中' : '回國機場消費',
                e.category,
                e.paymentMethod,
                `"${e.description}"`,
                e.amount,
                e.currency,
                e.exchangeRate,
                e.handlingFee || 0,
                e.twdAmount,
                payerName,
                `"${beneficiaryInfo}"`
            ].join(',')
        })
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Trippie_Expenses_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  const handleQuickAdd = (category: Category) => {
    setInitialFormCategory(category);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setTimeout(() => {
        setInitialFormCategory(undefined);
        setInitialFormDescription(undefined);
        setInitialFormAmount(undefined);
        setInitialFormCurrency(undefined);
        setFormLinkedItemId(undefined);
        setEditingExpense(undefined);
    }, 300);
  };

  const filteredExpenses = expenses.filter(e => e.phase === currentPhase);

  // Dynamic Title for Shopping Panel
  let shoppingPanelTitle = '🛒 待買清單';
  if (currentPhase === 'pre') shoppingPanelTitle = '🛍️ 行前購物清單';
  if (currentPhase === 'post') shoppingPanelTitle = '🎁 免稅/機場待買清單';

  // --- RENDER ---

  // 1. Bookshelf View
  if (viewMode === 'bookshelf') {
      // Calculate display dates: Prefer explicit trip dates, fallback to expense range
      let displayStart = tripStartDate;
      let displayEnd = tripEndDate;
      
      if (!displayStart || !displayEnd) {
          const { start, end } = getExpenseDateRange(expenses);
          displayStart = start;
          displayEnd = end;
      }
      
      return (
          <div className="min-h-screen mx-auto bg-gray-50 flex flex-col relative shadow-2xl border-x border-gray-100 w-full md:max-w-2xl lg:max-w-2xl transition-all duration-300 pb-24">
            <header className="bg-white pt-10 pb-6 px-6 sticky top-0 z-10 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-black text-gray-900 tracking-tight">我的旅程書架</h1>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Personal Travel Archive</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleOpenShareModal}
                    className="p-2 hover:bg-brand-50 rounded-xl text-brand-600 border border-brand-100 transition-colors flex items-center gap-2"
                  >
                    <Share2 size={18} />
                    <span className="text-xs font-bold hidden sm:inline">共享</span>
                  </button>
                  <div className="bg-brand-50 px-3 py-1.5 rounded-xl text-[10px] font-black text-brand-600 border border-brand-100 shadow-sm shadow-brand-50">
                    {tripHistory.length + (expenses.length > 0 ? 1 : 0)} BOOKS
                  </div>
                </div>
              </div>
            </header>

            <main className="flex-1 overflow-y-auto">
              <TripSelectionScreen 
                  currentDraftExpenses={expenses}
                  draftName={draftName}
                  draftStartDate={displayStart}
                  draftEndDate={displayEnd}
                  tripHistory={tripHistory}
                  onOpenDraft={handleOpenDraft}
                  onOpenTrip={handleRestoreTrip}
                  onCreateNew={handleCreateNewTrip}
                  onDeleteTrip={handleDeleteHistory}
                  onRenameTrip={handleRenameFromBookshelf}
                  onSmartScan={handleSmartScanBatch}
                  onAddShoppingItem={handleAddShoppingItem}
                  onBatchAddShoppingItems={handleBatchAddShoppingItems}
              />
            </main>
            
            {/* Bottom Nav for Bookshelf */}
            <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full md:max-w-2xl bg-white/80 backdrop-blur-xl border-t border-gray-100 px-6 py-3 flex justify-between items-center z-50">
              <button onClick={() => setViewMode('bookshelf')} className={`flex flex-col items-center gap-1 ${viewMode === 'bookshelf' ? 'text-brand-600' : 'text-gray-400'}`}>
                <Book size={20} />
                <span className="text-[10px] font-bold">書架</span>
              </button>
              <button onClick={() => setViewMode('community')} className={`flex flex-col items-center gap-1 ${viewMode === 'community' ? 'text-brand-600' : 'text-gray-400'}`}>
                <Users2 size={20} />
                <span className="text-[10px] font-bold">社群</span>
              </button>
              <button onClick={() => setViewMode('map')} className={`flex flex-col items-center gap-1 ${viewMode === 'map' ? 'text-brand-600' : 'text-gray-400'}`}>
                <MapIcon size={20} />
                <span className="text-[10px] font-bold">地圖</span>
              </button>
              <button onClick={() => setViewMode('marketplace')} className={`flex flex-col items-center gap-1 relative ${viewMode === 'marketplace' ? 'text-brand-600' : 'text-gray-400'}`}>
                <ShoppingBag size={20} />
                <span className="text-[10px] font-bold">服務</span>
                {unreadInboxCount > 0 && (
                  <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full border-2 border-white">
                    {unreadInboxCount}
                  </span>
                )}
              </button>
              <button onClick={() => setViewMode('points')} className={`flex flex-col items-center gap-1 ${viewMode === 'points' ? 'text-brand-600' : 'text-gray-400'}`}>
                <Award size={20} />
                <span className="text-[10px] font-bold">積分</span>
              </button>
            </div>

            {/* Toast Notification (Global) */}
            {toast && (
                <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg z-[60] flex items-center gap-2 text-sm font-bold animate-fade-in-down ${
                    toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-gray-800 text-white'
                }`}>
                    {toast.type === 'error' ? <Trash2 size={16} className="text-white" /> : <CheckCircle size={16} className="text-emerald-400" />}
                    {toast.msg}
                </div>
            )}

            <QRShareModal 
              isOpen={isShareModalOpen}
              onClose={() => setIsShareModalOpen(false)}
              userId={userId}
              userName={userProfile.name}
              currentTripId={currentLoadedTripId}
              currentTripName={draftName || (currentLoadedTripId ? '歷史旅程' : undefined)}
              onScanSuccess={handleScanSuccess}
            />
          </div>
      );
  }

  // 1.1 Community View
  if (viewMode === 'community') {
    return (
      <div className="min-h-screen mx-auto bg-gray-50 flex flex-col relative shadow-2xl border-x border-gray-100 w-full md:max-w-2xl lg:max-w-2xl transition-all duration-300 pb-24">
        <header className="bg-white pt-8 pb-4 px-6 sticky top-0 z-10 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <button onClick={() => setViewMode('bookshelf')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-black text-brand-900">旅人社群</h1>
          </div>
        </header>
        <main className="flex-1 p-4 overflow-y-auto">
          <CommunityFeed trips={publicTrips} onClone={handleCloneTrip} onView={(t) => showToast(`查看 ${t.name}`)} />
        </main>
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full md:max-w-2xl bg-white/80 backdrop-blur-xl border-t border-gray-100 px-6 py-3 flex justify-between items-center z-50">
          <button onClick={() => setViewMode('bookshelf')} className={`flex flex-col items-center gap-1 ${viewMode === 'bookshelf' ? 'text-brand-600' : 'text-gray-400'}`}>
            <Book size={20} />
            <span className="text-[10px] font-bold">書架</span>
          </button>
          <button onClick={() => setViewMode('community')} className={`flex flex-col items-center gap-1 ${viewMode === 'community' ? 'text-brand-600' : 'text-gray-400'}`}>
            <Users2 size={20} />
            <span className="text-[10px] font-bold">社群</span>
          </button>
          <button onClick={() => setViewMode('map')} className={`flex flex-col items-center gap-1 ${viewMode === 'map' ? 'text-brand-600' : 'text-gray-400'}`}>
            <MapIcon size={20} />
            <span className="text-[10px] font-bold">地圖</span>
          </button>
          <button onClick={() => setViewMode('marketplace')} className={`flex flex-col items-center gap-1 relative ${viewMode === 'marketplace' ? 'text-brand-600' : 'text-gray-400'}`}>
            <ShoppingBag size={20} />
            <span className="text-[10px] font-bold">服務</span>
            {unreadInboxCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full border-2 border-white">
                {unreadInboxCount}
              </span>
            )}
          </button>
          <button onClick={() => setViewMode('points')} className={`flex flex-col items-center gap-1 ${viewMode === 'points' ? 'text-brand-600' : 'text-gray-400'}`}>
            <Award size={20} />
            <span className="text-[10px] font-bold">積分</span>
          </button>
        </div>
      </div>
    );
  }

  // 1.2 Marketplace View
  if (viewMode === 'marketplace') {
    return (
      <div className="min-h-screen mx-auto bg-gray-50 flex flex-col relative shadow-2xl border-x border-gray-100 w-full md:max-w-2xl lg:max-w-2xl transition-all duration-300 pb-24">
        <header className="bg-white pt-8 pb-4 px-6 sticky top-0 z-10 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <button onClick={() => setViewMode('bookshelf')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-black text-brand-900">當地人服務</h1>
          </div>
        </header>
        <main className="flex-1 p-4 overflow-y-auto">
          <Marketplace 
            services={marketplaceServices} 
            inboxMessages={inboxMessages}
            onBook={handleBookService} 
            onAddService={handleAddMarketplaceService}
            onMarkMessageRead={(id) => {
              setInboxMessages(prev => prev.map(m => m.id === id ? { ...m, unread: false } : m));
            }}
          />
        </main>
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full md:max-w-2xl bg-white/80 backdrop-blur-xl border-t border-gray-100 px-6 py-3 flex justify-between items-center z-50">
          <button onClick={() => setViewMode('bookshelf')} className={`flex flex-col items-center gap-1 ${viewMode === 'bookshelf' ? 'text-brand-600' : 'text-gray-400'}`}>
            <Book size={20} />
            <span className="text-[10px] font-bold">書架</span>
          </button>
          <button onClick={() => setViewMode('community')} className={`flex flex-col items-center gap-1 ${viewMode === 'community' ? 'text-brand-600' : 'text-gray-400'}`}>
            <Users2 size={20} />
            <span className="text-[10px] font-bold">社群</span>
          </button>
          <button onClick={() => setViewMode('map')} className={`flex flex-col items-center gap-1 ${viewMode === 'map' ? 'text-brand-600' : 'text-gray-400'}`}>
            <MapIcon size={20} />
            <span className="text-[10px] font-bold">地圖</span>
          </button>
          <button onClick={() => setViewMode('marketplace')} className={`flex flex-col items-center gap-1 relative ${viewMode === 'marketplace' ? 'text-brand-600' : 'text-gray-400'}`}>
            <ShoppingBag size={20} />
            <span className="text-[10px] font-bold">服務</span>
            {unreadInboxCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full border-2 border-white">
                {unreadInboxCount}
              </span>
            )}
          </button>
          <button onClick={() => setViewMode('points')} className={`flex flex-col items-center gap-1 ${viewMode === 'points' ? 'text-brand-600' : 'text-gray-400'}`}>
            <Award size={20} />
            <span className="text-[10px] font-bold">積分</span>
          </button>
        </div>
      </div>
    );
  }

  // 1.3 Points View
  if (viewMode === 'points') {
    return (
      <div className="min-h-screen mx-auto bg-gray-50 flex flex-col relative shadow-2xl border-x border-gray-100 w-full md:max-w-2xl lg:max-w-2xl transition-all duration-300 pb-24">
        <header className="bg-white pt-8 pb-4 px-6 sticky top-0 z-10 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <button onClick={() => setViewMode('bookshelf')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-black text-brand-900">我的積分</h1>
          </div>
        </header>
        <main className="flex-1 p-4 overflow-y-auto">
          <PointsDashboard profile={userProfile} />
        </main>
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full md:max-w-2xl bg-white/80 backdrop-blur-xl border-t border-gray-100 px-6 py-3 flex justify-between items-center z-50">
          <button onClick={() => setViewMode('bookshelf')} className={`flex flex-col items-center gap-1 ${viewMode === 'bookshelf' ? 'text-brand-600' : 'text-gray-400'}`}>
            <Book size={20} />
            <span className="text-[10px] font-bold">書架</span>
          </button>
          <button onClick={() => setViewMode('community')} className={`flex flex-col items-center gap-1 ${viewMode === 'community' ? 'text-brand-600' : 'text-gray-400'}`}>
            <Users2 size={20} />
            <span className="text-[10px] font-bold">社群</span>
          </button>
          <button onClick={() => setViewMode('map')} className={`flex flex-col items-center gap-1 ${viewMode === 'map' ? 'text-brand-600' : 'text-gray-400'}`}>
            <MapIcon size={20} />
            <span className="text-[10px] font-bold">地圖</span>
          </button>
          <button onClick={() => setViewMode('marketplace')} className={`flex flex-col items-center gap-1 relative ${viewMode === 'marketplace' ? 'text-brand-600' : 'text-gray-400'}`}>
            <ShoppingBag size={20} />
            <span className="text-[10px] font-bold">服務</span>
            {unreadInboxCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full border-2 border-white">
                {unreadInboxCount}
              </span>
            )}
          </button>
          <button onClick={() => setViewMode('points')} className={`flex flex-col items-center gap-1 ${viewMode === 'points' ? 'text-brand-600' : 'text-gray-400'}`}>
            <Award size={20} />
            <span className="text-[10px] font-bold">積分</span>
          </button>
        </div>
      </div>
    );
  }

  // 1.4 Map View
  if (viewMode === 'map') {
    return (
      <div className="min-h-screen mx-auto bg-gray-50 flex flex-col relative shadow-2xl border-x border-gray-100 w-full md:max-w-2xl lg:max-w-2xl transition-all duration-300 pb-24">
        <header className="bg-white pt-8 pb-4 px-6 sticky top-0 z-10 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <button onClick={() => setViewMode('bookshelf')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-black text-brand-900">地圖探索</h1>
          </div>
        </header>
        <main className="flex-1 overflow-hidden">
          <MapExplorer trips={publicTrips} onSelectTrip={(t) => showToast(`查看 ${t.name}`)} />
        </main>
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full md:max-w-2xl bg-white/80 backdrop-blur-xl border-t border-gray-100 px-6 py-3 flex justify-between items-center z-50">
          <button onClick={() => setViewMode('bookshelf')} className={`flex flex-col items-center gap-1 ${viewMode === 'bookshelf' ? 'text-brand-600' : 'text-gray-400'}`}>
            <Book size={20} />
            <span className="text-[10px] font-bold">書架</span>
          </button>
          <button onClick={() => setViewMode('community')} className={`flex flex-col items-center gap-1 ${viewMode === 'community' ? 'text-brand-600' : 'text-gray-400'}`}>
            <Users2 size={20} />
            <span className="text-[10px] font-bold">社群</span>
          </button>
          <button onClick={() => setViewMode('map')} className={`flex flex-col items-center gap-1 ${viewMode === 'map' ? 'text-brand-600' : 'text-gray-400'}`}>
            <MapIcon size={20} />
            <span className="text-[10px] font-bold">地圖</span>
          </button>
          <button onClick={() => setViewMode('marketplace')} className={`flex flex-col items-center gap-1 relative ${viewMode === 'marketplace' ? 'text-brand-600' : 'text-gray-400'}`}>
            <ShoppingBag size={20} />
            <span className="text-[10px] font-bold">服務</span>
            {unreadInboxCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full border-2 border-white">
                {unreadInboxCount}
              </span>
            )}
          </button>
          <button onClick={() => setViewMode('points')} className={`flex flex-col items-center gap-1 ${viewMode === 'points' ? 'text-brand-600' : 'text-gray-400'}`}>
            <Award size={20} />
            <span className="text-[10px] font-bold">積分</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. Trip Detail View
  // Logic to show date in header
  let headerStart = tripStartDate;
  let headerEnd = tripEndDate;
  if (!headerStart || !headerEnd) {
      const { start, end } = getExpenseDateRange(expenses);
      headerStart = start;
      headerEnd = end;
  }
  const tripDateRangeDisplay = formatDateRange(headerStart, headerEnd);

  // Responsive Container Class
  // On Desktop: slightly wider (max-w-2xl) to allow side-by-side dashboard cards
  const containerClass = "min-h-screen mx-auto bg-gray-50 flex flex-col relative shadow-2xl border-x border-gray-100 w-full md:max-w-2xl lg:max-w-2xl transition-all duration-300";

  return (
    <div className={containerClass}>
      
      {/* Toast Notification */}
      {toast && (
          <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg z-[60] flex items-center gap-2 text-sm font-bold animate-fade-in-down ${
              toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-gray-800 text-white'
          }`}>
              {toast.type === 'error' ? <Trash2 size={16} className="text-white" /> : <CheckCircle size={16} className="text-emerald-400" />}
              {toast.msg}
          </div>
      )}

      {/* Header */}
      <header className="bg-white pt-8 pb-4 px-6 sticky top-0 z-10 border-b border-gray-100">
        <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2 w-full">
                <button 
                    onClick={() => setViewMode('bookshelf')}
                    className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 transition-colors flex-shrink-0"
                    title="回到書架"
                >
                    <ArrowLeft size={24} />
                </button>
                
                {/* Editable Trip Name & Date Range */}
                <div className="flex-1 min-w-0 mx-2">
                    <input 
                        type="text"
                        value={currentTripName}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="點擊命名旅程..."
                        className="text-xl font-black text-brand-900 tracking-tight bg-transparent border-b border-transparent hover:border-gray-300 focus:border-brand-500 outline-none w-full transition-all placeholder:text-gray-300"
                    />
                    {(expenses.length > 0 || tripStartDate) && (
                        <div className="flex items-center gap-1 text-xs text-gray-400 font-bold mt-1 ml-0.5">
                            <CalendarDays size={12} />
                            {tripDateRangeDisplay}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                    <button 
                        onClick={() => setIsCountryModalOpen(true)}
                        className={`p-2.5 rounded-full transition-colors flex items-center justify-center border-2 ${travelCountry ? 'bg-brand-50 border-brand-200 text-brand-600' : 'bg-gray-50 border-transparent text-gray-400 hover:bg-gray-100'}`}
                        title="設定旅遊國家"
                    >
                        <Globe size={20} />
                    </button>
                    <button 
                        onClick={() => setIsCompanionsOpen(true)}
                        className={`p-2.5 rounded-full transition-colors relative flex items-center justify-center ${companions.length > 0 ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:bg-gray-100'}`}
                        title="旅伴管理"
                    >
                        <Users size={20} />
                        {companions.length > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white"></span>}
                    </button>
                    <button 
                        onClick={handleOpenShareModal}
                        className="p-2.5 rounded-full bg-brand-50 text-brand-600 border border-brand-100 transition-colors flex items-center justify-center"
                        title="共享帳本"
                    >
                        <Share2 size={20} />
                    </button>
                </div>
            </div>
        </div>
        <PhaseSelector currentPhase={currentPhase} onChange={setCurrentPhase} />
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-y-auto overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPhase}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="space-y-6 pb-24"
          >
            {/* API Key Warning */}
            {(!import.meta.env.VITE_GEMINI_API_KEY && !(process.env as any).GEMINI_API_KEY && !(process.env as any).API_KEY) && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm flex items-center gap-3">
                    <Info size={18} className="flex-shrink-0" />
                    <div>
                        <p className="font-bold">AI 功能尚未啟用</p>
                        <p className="text-xs opacity-80">請在 Vercel 設定中新增環境變數 <code>VITE_GEMINI_API_KEY</code> 並重新部署。</p>
                    </div>
                </div>
            )}
            
            {currentPhase === 'summary' ? (
               /* Full Screen Summary View */
               <div className="space-y-6">
                 <TripSummaryModal 
                      expenses={expenses}
                      onArchive={handleArchiveTrip}
                      taxRule={taxRule}
                      variant="embedded"
                      initialTripName={currentTripName}
                 />
                 <button 
                   onClick={handleGenerateTravelBook}
                   className="w-full bg-gradient-to-r from-brand-600 to-indigo-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20 hover:scale-[1.02] transition-transform"
                 >
                   <Sparkles size={20} /> 產生 AI 旅程回憶錄
                 </button>
               </div>
            ) : (
               /* Standard Phase Views */
               <>
                  {itinerary.length > 0 && (
                    <ItineraryCalendar items={itinerary} />
                  )}
                  
                  <Dashboard 
                      expenses={expenses} 
                      companions={companions}
                      onExport={handleExport}
                      onAddCash={() => handleQuickAdd(Category.EXCHANGE)}
                      onAddExpense={handleSaveExpense}
                      currentPhase={currentPhase}
                      taxRule={taxRule}
                      visaInfo={visaInfo}
                  />
                  
                  {/* Phase Specific Context Card */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity pointer-events-none">
                        {currentPhase === 'pre' && <ShoppingBag size={120} />}
                        {currentPhase === 'during' && <Globe size={120} />}
                        {currentPhase === 'post' && <Award size={120} />}
                    </div>

                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">
                                    {currentPhase === 'pre' && '行前準備'}
                                    {currentPhase === 'during' && '旅途記帳'}
                                    {currentPhase === 'post' && '回國結算'}
                                </h3>
                                <p className="text-xs text-gray-400 font-bold">
                                    {currentPhase === 'pre' && '規劃預算、準備必備物品'}
                                    {currentPhase === 'during' && '即時記錄每一筆旅途消費'}
                                    {currentPhase === 'post' && '辦理退稅、查看最終報表'}
                                </p>
                            </div>
                            <div className="bg-brand-50 text-brand-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                                {currentPhase}
                            </div>
                        </div>

                        <div className="space-y-6">
                            {currentPhase === 'pre' && (
                                <PreTripChecklist 
                                    onQuickAddCategory={handleQuickAdd} 
                                    expenses={expenses}
                                />
                            )}

                            {currentPhase === 'post' && (
                                <PostTripChecklist 
                                    onQuickAddCategory={handleQuickAdd} 
                                    expenses={expenses}
                                />
                            )}

                            {/* Shared Shopping List Panel */}
                            <ShoppingListPanel 
                                title={shoppingPanelTitle}
                                shoppingList={shoppingList.filter(item => item.phase === currentPhase)}
                                onAddItem={handleAddShoppingItem}
                                onRemoveItem={handleRemoveShoppingItem}
                                onPurchaseItem={handlePurchaseShoppingItem}
                            />
                        </div>
                    </div>
                  </div>

                  {/* Expense List Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="font-bold text-gray-700 flex items-center gap-2">
                            <Receipt size={18} className="text-gray-400" />
                            {currentPhase === 'pre' && '準備清單'}
                            {currentPhase === 'during' && '消費紀錄'}
                            {currentPhase === 'post' && '機場消費'}
                        </h3>
                        <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-2 py-1 rounded-full uppercase tracking-tighter">
                            {filteredExpenses.length} ITEMS
                        </span>
                    </div>

                    <ExpenseList 
                        expenses={filteredExpenses} 
                        onDelete={handleDeleteExpense} 
                        onEdit={handleEditExpense} 
                        taxRule={taxRule}
                    />
                  </div>
               </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Action Button (Only show if NOT in summary) */}
      {currentPhase !== 'summary' && (
        <div className="fixed bottom-6 right-6 z-40 md:absolute md:right-6 md:bottom-6">
            <button
            onClick={() => setIsFormOpen(true)}
            className="bg-brand-600 hover:bg-brand-700 text-white p-4 rounded-full shadow-lg shadow-brand-500/30 transition-transform hover:scale-105 active:scale-95 flex items-center justify-center"
            >
            <Plus size={28} />
            </button>
        </div>
      )}

      {/* Expense Modal */}
      {isFormOpen && (
        <ExpenseForm 
            currentPhase={currentPhase === 'summary' ? 'post' : currentPhase} // Fallback to post if somehow opened in summary
            existingExpenses={expenses}
            companions={companions}
            initialCategory={initialFormCategory}
            initialDescription={initialFormDescription}
            initialAmount={initialFormAmount}
            initialCurrency={initialFormCurrency}
            linkedItemId={formLinkedItemId}
            initialData={editingExpense}
            taxRule={taxRule}
            onSubmit={handleSaveExpense} 
            onClose={handleCloseForm} 
        />
      )}

      {/* Companions Modal */}
      {isCompanionsOpen && (
          <CompanionsModal 
            companions={companions}
            friends={friends}
            onAdd={handleAddCompanion}
            onAddFriendToTrip={handleAddFriendToTrip}
            onRemove={handleRemoveCompanion}
            onClose={() => setIsCompanionsOpen(false)}
          />
      )}

      {/* Country Settings Modal */}
      {isCountryModalOpen && (
          <CountrySettingsModal 
            initialCountry={travelCountry}
            onSave={handleSaveCountry}
            onClose={() => setIsCountryModalOpen(false)}
            isLoading={isFetchingTaxRule}
          />
      )}

      {/* Visa Check Modal (New) */}
      {isVisaModalOpen && travelCountry && (
          <VisaCheckModal 
            destination={travelCountry}
            defaultOrigin={originCountry}
            onClose={() => setIsVisaModalOpen(false)}
            onSaveInfo={handleSaveVisaInfo}
            onAddVisaExpense={handleAddVisaExpense}
          />
      )}

      {/* Travel Book Modal */}
      {isTravelBookOpen && travelBook && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg relative">
            <button 
              onClick={() => setIsTravelBookOpen(false)}
              className="absolute -top-12 right-0 text-white hover:text-brand-200 transition-colors"
            >
              <Plus size={32} className="rotate-45" />
            </button>
            <TravelBookView book={travelBook} onShare={() => showToast("分享功能即將推出！")} />
          </div>
        </div>
      )}

      <QRShareModal 
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        userId={userId}
        userName={userProfile.name}
        currentTripId={currentLoadedTripId}
        currentTripName={currentTripName || (currentLoadedTripId ? '歷史旅程' : undefined)}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
};

export default App;
