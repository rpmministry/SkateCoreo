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
                    ? 'text-[#F7F8F9] border-b-2 border-[#e11d48] font-medium'
                    : accentColor === 'mint'
                    ? 'text-[#F7F8F9] border-b-2 border-[#0d9488] font-medium'
                    : accentColor === 'amber'
                    ? 'text-[#F7F8F9] border-b-2 border-[#f59e0b] font-medium'
                    : 'text-[#F7F8F9] border-b-2 border-[#2e7cf6] font-medium'
                  : 'text-[#9CA3AF] hover:text-[#F7F8F9] border-b-2 border-transparent'
              }`}
            >
              {tab.icon && (
                <span
                  className={`shrink-0 ${
                    isActive
                      ? accentColor === 'coral'
                        ? 'text-[#fb7185]'
                        : accentColor === 'mint'
                        ? 'text-[#2dd4bf]'
                        : accentColor === 'amber'
                        ? 'text-[#f59e0b]'
                        : 'text-[#60a5fa]'
                      : 'text-[#6B7280]'
                  }`}
                >
                  {tab.icon}
                </span>
              )}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-medium ${
                    isActive ? 'bg-[#2e7cf6]/20 text-[#60a5fa]' : 'bg-white/[0.06] text-[#9CA3AF]'
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
      ? 'bg-[#e11d48]/15 text-white font-medium border border-[#e11d48]/40 shadow-sm'
      : accentColor === 'mint'
      ? 'bg-[#0d9488]/15 text-white font-medium border border-[#0d9488]/40 shadow-sm'
      : accentColor === 'amber'
      ? 'bg-[#f59e0b]/15 text-white font-medium border border-[#f59e0b]/40 shadow-sm'
      : 'bg-[#2e7cf6]/15 text-white font-medium border border-[#2e7cf6]/40 shadow-sm';

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={`inline-flex items-center p-1 rounded-lg bg-surface-1 border border-white/[0.07] overflow-x-auto scrollbar-none ${className}`}
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
                : 'text-[#9CA3AF] hover:text-[#F7F8F9] hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            {tab.icon && (
              <span
                className={`shrink-0 ${
                  isActive
                    ? accentColor === 'coral'
                      ? 'text-[#fb7185]'
                      : accentColor === 'mint'
                      ? 'text-[#2dd4bf]'
                      : accentColor === 'amber'
                      ? 'text-[#f59e0b]'
                      : 'text-[#60a5fa]'
                    : 'text-[#6B7280]'
                }`}
              >
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-medium ${
                  isActive ? 'bg-[#2e7cf6] text-white' : 'bg-white/[0.06] text-[#9CA3AF]'
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
