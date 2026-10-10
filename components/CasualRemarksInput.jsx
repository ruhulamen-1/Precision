import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';

const RemarksInput = React.forwardRef(({ value, onChange, onRemarkSelect, historyRemarks = [], availableRemarks = [], disabled }, ref) => {
    const [isDropdownVisible, setDropdownVisible] = useState(false);
    const [activeFilter, setActiveFilter] = useState('all');
    const [dropdownStyle, setDropdownStyle] = useState({});
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const containerRef = useRef(null);
    const dropdownRef = useRef(null);
    const highlightedItemRef = useRef(null);

    const remarkFilters = useMemo(() => ['all', 'positive', 'negative', 'neutral'], []);

    const filteredRemarks = useMemo(() => {
        let combined = [];

        if (historyRemarks.length > 0 && (activeFilter === 'all' || activeFilter === 'history')) {
             const historyMatches = historyRemarks.filter(r => 
                 !value || (r && typeof r === 'string' && r.toLowerCase().includes(value.toLowerCase()))
             ).map(r => ({ text_en: r, text_bn: '', type: 'history' }));
             combined = [...historyMatches];
        }

        let remarks = availableRemarks || [];
        if (activeFilter !== 'all') {
            remarks = remarks.filter(r => r.type === activeFilter);
        }
        if (value) {
            const lowercasedValue = value.toLowerCase();
            remarks = remarks.filter(r =>
                (r && r.text_en && typeof r.text_en === 'string' && r.text_en.toLowerCase().includes(lowercasedValue)) ||
                (r && r.text_bn && typeof r.text_bn === 'string' && r.text_bn.toLowerCase().includes(lowercasedValue))
            );
        }
        return [...combined, ...remarks];
    }, [value, activeFilter, historyRemarks, availableRemarks]);

    const navigableRemarks = useMemo(() =>
        filteredRemarks.flatMap(r => {
          const items = [{ lang: 'en', text: r.text_en }];
          if (r.text_bn) items.push({ lang: 'bn', text: r.text_bn });
          return items;
        }),
        [filteredRemarks]);

    useEffect(() => {
        setHighlightedIndex(-1);
    }, [value, activeFilter]);

    useEffect(() => {
        if (highlightedItemRef.current) {
            highlightedItemRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
        }
    }, [highlightedIndex]);

    useEffect(() => {
        if (isDropdownVisible && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setDropdownStyle({
                position: 'fixed',
                top: `${rect.bottom + 2}px`,
                left: `${rect.left}px`,
                width: `${rect.width}px`,
                zIndex: 100
            });
        }

        const handleClickOutside = (event) => {
            if (
                containerRef.current && !containerRef.current.contains(event.target) &&
                dropdownRef.current && !dropdownRef.current.contains(event.target)
            ) {
                setDropdownVisible(false);
            }
        };

        if (isDropdownVisible) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isDropdownVisible]);

    const handleSelect = (remarkText) => {
        onChange(remarkText);
        setDropdownVisible(false);
        if (onRemarkSelect) {
            onRemarkSelect();
        }
    };

    const handleKeyDown = (e) => {
        if (!isDropdownVisible) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                e.preventDefault();
                setDropdownVisible(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev >= navigableRemarks.length - 1 ? 0 : prev + 1
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev <= 0 ? navigableRemarks.length - 1 : prev - 1
                );
                break;
            case 'Enter':
                if (highlightedIndex >= 0 && highlightedIndex < navigableRemarks.length) {
                    handleSelect(navigableRemarks[highlightedIndex].text);
                }
                break;
            case 'Escape':
                setDropdownVisible(false);
                break;
        }
    };

    const getFilterChipColor = (type, isActive) => {
        if (isActive) return 'bg-blue-500 text-white';
        switch (type) {
            case 'history': return 'bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-900/50 dark:text-purple-300 dark:hover:bg-purple-900';
            case 'positive': return 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:hover:bg-purple-900';
            case 'negative': return 'bg-rose-100 text-rose-800 hover:bg-rose-200 dark:bg-rose-900/50 dark:text-rose-300 dark:hover:bg-purple-900';
            case 'neutral': return 'bg-sky-100 text-sky-800 hover:bg-sky-200 dark:bg-sky-900/50 dark:text-sky-300 dark:hover:bg-sky-900';
            default: return 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600';
        }
    };

    const DropdownContent = (
        <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg shadow-lg flex flex-col max-h-[400px] text-sm"
        >
            <div className="p-2 border-b border-gray-200 dark:border-slate-700 flex flex-wrap gap-2">
                {remarkFilters.map(filter => (
                    <button
                        key={filter}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveFilter(filter); }}
                        className={`capitalize text-xs font-medium px-2.5 py-1 rounded-full cursor-pointer transition-colors ${getFilterChipColor(filter, activeFilter === filter)}`}
                    >
                        {filter}
                    </button>
                ))}
            </div>
            <div className="overflow-y-auto">
                {filteredRemarks.length > 0 ? filteredRemarks.map((remark, index) => {
                    const isHistory = remark.type === 'history';
                    
                    let currentStartIndex = 0;
                    for(let i=0; i<index; i++) {
                        const r = filteredRemarks[i];
                        currentStartIndex += (r.text_bn ? 2 : 1);
                    }
                    const enIndex = currentStartIndex;
                    const bnIndex = currentStartIndex + 1;

                    return (
                        <div
                            key={index}
                            className={`px-4 py-3 border-b border-gray-100 dark:border-slate-700 ${isHistory ? 'bg-purple-50 dark:bg-purple-900/10' : ''}`}
                        >
                            {isHistory && <span className="text-[10px] text-purple-600 font-bold uppercase tracking-wider mb-1 block">Used Previously</span>}
                            <p
                                ref={highlightedIndex === enIndex ? highlightedItemRef : null}
                                className={`text-gray-800 dark:text-gray-200 cursor-pointer p-1 rounded ${highlightedIndex === enIndex ? 'bg-sky-100 dark:bg-sky-900/50' : 'hover:bg-blue-100 dark:hover:bg-blue-900/50'}`}
                                onClick={(e) => { e.stopPropagation(); handleSelect(remark.text_en); }}
                                onMouseEnter={() => setHighlightedIndex(enIndex)}
                            >
                                {remark.text_en}
                            </p>
                            {remark.text_bn && (
                              <p
                                  ref={highlightedIndex === bnIndex ? highlightedItemRef : null}
                                  className={`text-gray-500 dark:text-gray-400 mt-1 cursor-pointer p-1 rounded font-['Noto_Serif_Bengali'] ${highlightedIndex === bnIndex ? 'bg-sky-100 dark:bg-sky-900/50' : 'hover:bg-blue-100 dark:hover:bg-blue-900/50'}`}
                                  onClick={(e) => { e.stopPropagation(); handleSelect(remark.text_bn); }}
                                  onMouseEnter={() => setHighlightedIndex(bnIndex)}
                              >
                                  {remark.text_bn}
                              </p>
                            )}
                        </div>
                    );
                }) : (
                    <div className="p-4 text-center text-gray-500 dark:text-gray-400 italic">No matching remarks found.</div>
                )}
            </div>
        </div>
    );

    return (
        <div ref={containerRef} className="h-full w-full">
            <textarea
                ref={ref}
                className="w-full p-2 border border-gray-300 rounded-md min-h-[80px] h-full transition-all resize-vertical font-['Noto_Serif_Bengali'] bg-gray-50 dark:bg-slate-700 dark:border-slate-600 dark:text-gray-200 text-sm disabled:opacity-50"
                placeholder={disabled ? "Remarks" : "Click or type in English/Bengali..."}
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                    if (!isDropdownVisible) setDropdownVisible(true);
                }}
                onFocus={() => {
                    if (disabled) return;
                    setDropdownVisible(true);
                    setHighlightedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                required
                disabled={disabled}
            />
            {isDropdownVisible && !disabled && createPortal(DropdownContent, document.body)}
        </div>
    );
});

export default RemarksInput;