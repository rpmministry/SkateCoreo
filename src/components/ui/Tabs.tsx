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
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'pills',
  size = 'md',
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
                  ? 'text-[#f4f4f4] border-b-2 border-[#0f62fe] font-semibold'
                  : 'text-[#c6c6c6] hover:text-[#f4f4f4] border-b-2 border-transparent'
              }`}
            >
              {tab.icon && (
                <span className={`shrink-0 ${isActive ? 'text-[#78a9ff]' : 'text-[#8d8d8d]'}`}>
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
            className={`flex items-center rounded-md font-medium transition-colors whitespace-nowrap select-none ${sizeClasses} ${
              isActive
                ? 'bg-surface-3 text-[#f4f4f4] font-semibold border border-white/10 shadow-sm'
                : 'text-[#c6c6c6] hover:text-[#f4f4f4] hover:bg-white/[0.04]'
            }`}
          >
            {tab.icon && (
              <span className={`shrink-0 ${isActive ? 'text-[#78a9ff]' : 'text-[#8d8d8d]'}`}>
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
