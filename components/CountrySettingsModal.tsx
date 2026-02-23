
import React, { useState, useRef, useEffect } from 'react';
import { X, Globe, Search, Loader2 } from 'lucide-react';
import { POPULAR_COUNTRIES } from '../constants';

interface Props {
  initialCountry: string;
  onSave: (country: string) => void;
  onClose: () => void;
  isLoading: boolean;
}

const CountrySettingsModal: React.FC<Props> = ({ initialCountry, onSave, onClose, isLoading }) => {
  const [country, setCountry] = useState(initialCountry);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Filter suggestions when input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCountry(value);

    if (value.trim()) {
        const filtered = POPULAR_COUNTRIES.filter(c => 
            c.includes(value) && c !== value
        );
        setSuggestions(filtered);
    } else {
        // Show all popular countries when input is cleared
        setSuggestions(POPULAR_COUNTRIES);
    }
    setShowSuggestions(true);
  };

  const handleSelectSuggestion = (value: string) => {
      setCountry(value);
      setShowSuggestions(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (country.trim()) {
      onSave(country.trim());
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
              setShowSuggestions(false);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
          document.removeEventListener("mousedown", handleClickOutside);
      };
  }, [wrapperRef]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70] animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-visible shadow-2xl flex flex-col">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center rounded-t-2xl">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <Globe className="text-brand-600" size={20} /> 設定旅遊國家
            </h2>
            <button onClick={onClose} disabled={isLoading} className="p-1 hover:bg-gray-200 rounded-full">
                <X size={20} className="text-gray-500" />
            </button>
        </div>

        <div className="p-6 overflow-visible">
          <p className="text-xs text-gray-500 mb-4">
            輸入國家名稱（如：日本、法國），系統將自動為您查詢該國的最新退稅門檻與稅率資訊。
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div ref={wrapperRef} className="relative">
                <label className="block text-xs font-bold text-gray-700 mb-1">國家名稱</label>
                <div className="relative">
                    <Globe className="absolute left-3 top-2.5 text-gray-400" size={16} />
                    <input
                        autoFocus
                        type="text"
                        value={country}
                        onChange={handleInputChange}
                        onFocus={() => {
                            // Show suggestions immediately on focus
                            if (country.trim()) {
                                const filtered = POPULAR_COUNTRIES.filter(c => c.includes(country) && c !== country);
                                setSuggestions(filtered);
                            } else {
                                setSuggestions(POPULAR_COUNTRIES);
                            }
                            setShowSuggestions(true);
                        }}
                        placeholder="例如：日本"
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                    />
                </div>
                
                {/* Autocomplete Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                        <div className="sticky top-0 bg-gray-50 px-4 py-1.5 text-[10px] text-gray-400 font-bold uppercase tracking-wider border-b border-gray-100">
                            {country.trim() ? '搜尋結果' : '熱門國家'}
                        </div>
                        {suggestions.map((suggestion) => (
                            <button
                                key={suggestion}
                                type="button"
                                onClick={() => handleSelectSuggestion(suggestion)}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-brand-50 hover:text-brand-600 transition-colors flex items-center gap-2"
                            >
                                <Search size={14} className="text-gray-400" />
                                {suggestion}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <button 
              type="submit"
              disabled={!country.trim() || isLoading}
              className="w-full bg-brand-600 text-white py-2.5 rounded-lg disabled:opacity-50 hover:bg-brand-700 flex items-center justify-center gap-2 font-bold transition-colors"
            >
              {isLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> 正在查詢退稅資訊...
                  </>
              ) : (
                  <>
                    <Search size={18} /> 儲存並查詢
                  </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CountrySettingsModal;
