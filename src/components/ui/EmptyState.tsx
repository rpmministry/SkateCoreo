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
      className={`flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-white/[0.12] bg-surface-1/50 ${
        compact ? 'p-6' : 'p-10'
      } ${className}`}
    >
      {icon && (
        <div
          className={`flex items-center justify-center rounded-2xl bg-surface-2 border border-white/[0.08] text-cobalt-400 shadow-elevation-1 mb-4 ${
            compact ? 'w-12 h-12 text-xl' : 'w-16 h-16 text-2xl'
          }`}
        >
          {React.isValidElement(icon)
            ? icon
            : typeof icon === 'function'
            ? React.createElement(icon, { className: 'w-7 h-7 text-cobalt-400' })
            : icon}
        </div>
      )}
      <h3 className="font-display text-base font-semibold text-white tracking-tight mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-slate-400 max-w-sm leading-relaxed mb-5">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
};
