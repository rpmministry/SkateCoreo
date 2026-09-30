import React, { useRef } from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: 'pills' | 'underline' | 'chips';
  size?: 'sm' | 'md';
  accentColor?: 'cobalt' | 'mint' | 'coral' | 'amber';
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'pills',
  size = 'md',
  accentColor = 'cobalt',
  className = '',
}) => {
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    tabsRef.current[nextIndex]?.focus();
    onChange(tabs[nextIndex].id);
  };

  const sizeClasses = {
    sm: 'text-xs py-1.5 px-3 gap-1.5 min-h-[32px]',
    md: 'text-xs sm:text-[13px] py-2 px-3.5 gap-2 min-h-[38px]',
  }[size];

  if (variant === 'underline') {
    return (
      <div
        role="tablist"
        aria-orientation="horizontal"
        className={`flex items-center gap-1 border-b border-white/[0.08] overflow-x-auto scrollbar-none ${className}`}
      >
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={(el) => (tabsRef.current[idx] = el)}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`relative flex items-center font-medium transition-colors whitespace-nowrap -mb-px pb-2.5 px-3 pt-1 ${sizeClasses} ${
                isActive
                  ? accentColor === 'coral'
                    ? 'text-white border-b-2 border-[#ee5396] font-bold'
                    : accentColor === 'mint'
                    ? 'text-white border-b-2 border-[#009d9a] font-bold'
                    : accentColor === 'amber'
                    ? 'text-white border-b-2 border-[#f1c21b] font-bold'
                    : 'text-white border-b-2 border-[#0f62fe] font-bold'
                  : 'text-[#c6c6c6] hover:text-white border-b-2 border-transparent'
              }`}
            >
              {tab.icon && (
                <span
                  className={`shrink-0 ${
                    isActive
                      ? accentColor === 'coral'
                        ? 'text-[#ff7eb6]'
                        : accentColor === 'mint'
                        ? 'text-[#3ddbd9]'
                        : accentColor === 'amber'
                        ? 'text-[#f1c21b]'
                        : 'text-[#78a9ff]'
                      : 'text-[#8d8d8d]'
                  }`}
                >
                  {tab.icon}
                </span>
              )}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                    isActive ? 'bg-[#0f62fe]/25 text-[#78a9ff]' : 'bg-surface-3 text-[#c6c6c6]'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  const activePillStyle =
    accentColor === 'coral'
      ? 'bg-surface-3 text-white font-bold border border-[#ee5396] shadow-sm ring-1 ring-[#ee5396]/40'
      : accentColor === 'mint'
      ? 'bg-surface-3 text-white font-bold border border-[#009d9a] shadow-sm ring-1 ring-[#009d9a]/40'
      : accentColor === 'amber'
      ? 'bg-surface-3 text-white font-bold border border-[#f1c21b] shadow-sm ring-1 ring-[#f1c21b]/40'
      : 'bg-surface-3 text-white font-bold border border-[#0f62fe] shadow-sm ring-1 ring-[#0f62fe]/40';

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={`inline-flex items-center p-1 rounded-lg bg-surface-1 border border-white/[0.08] overflow-x-auto scrollbar-none ${className}`}
    >
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            ref={(el) => (tabsRef.current[idx] = el)}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`flex items-center rounded-md font-medium transition-all whitespace-nowrap select-none ${sizeClasses} ${
              isActive
                ? activePillStyle
                : 'text-[#c6c6c6] hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            {tab.icon && (
              <span
                className={`shrink-0 ${
                  isActive
                    ? accentColor === 'coral'
                      ? 'text-[#ff7eb6]'
                      : accentColor === 'mint'
                      ? 'text-[#3ddbd9]'
                      : accentColor === 'amber'
                      ? 'text-[#f1c21b]'
                      : 'text-[#78a9ff]'
                    : 'text-[#8d8d8d]'
                }`}
              >
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                  isActive ? 'bg-[#0f62fe] text-white' : 'bg-surface-3 text-[#c6c6c6]'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
