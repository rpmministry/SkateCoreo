import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode | React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  compact = false,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-white/[0.08] bg-surface-1/40 ${
        compact ? 'p-6' : 'p-8 sm:p-10'
      } ${className}`}
    >
      {icon && (
        <div
          className={`flex items-center justify-center rounded-xl bg-surface-2 border border-white/[0.07] text-[#2e7cf6] shadow-sm mb-3.5 ${
            compact ? 'w-11 h-11' : 'w-14 h-14'
          }`}
        >
          {React.isValidElement(icon)
            ? icon
            : typeof icon === 'function'
            ? React.createElement(icon, { className: 'w-6 h-6 text-[#2e7cf6]' })
            : icon}
        </div>
      )}
      <h3 className="font-display text-sm sm:text-base font-semibold text-[#F7F8F9] tracking-tight mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-[#9CA3AF] max-w-sm leading-relaxed mb-4">
          {description}
        </p>
      )}
      {action && <div className="mt-0.5">{action}</div>}
    </div>
  );
};
