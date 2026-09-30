import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'glass' | 'interactive' | 'outline';
  surface?: 1 | 2 | 3;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', variant = 'default', surface = 1, children, ...props }, ref) => {
    const surfaceStyles = {
      1: 'bg-surface-1',
      2: 'bg-surface-2',
      3: 'bg-surface-3',
    }[surface];

    const variantStyles = {
      default: `${surfaceStyles} border border-white/[0.08] shadow-elevation-1`,
      elevated: `${surfaceStyles} border border-white/[0.12] shadow-elevation-2`,
      glass: 'glass-card border border-white/[0.10] shadow-elevation-1',
      outline: 'bg-transparent border border-white/[0.12]',
      interactive: `${surfaceStyles} border border-white/[0.08] shadow-elevation-1 hover:border-cobalt-500/40 hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer active:scale-[0.99]`,
    }[variant];

    return (
      <div
        ref={ref}
        className={`rounded-2xl overflow-hidden ${variantStyles} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => (
    <div
      ref={ref}
      className={`px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-3 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className = '', children, ...props }, ref) => (
    <h3
      ref={ref}
      className={`font-display text-base font-semibold text-white tracking-tight ${className}`}
      {...props}
    >
      {children}
    </h3>
  )
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className = '', children, ...props }, ref) => (
    <p
      ref={ref}
      className={`text-xs text-slate-400 leading-relaxed ${className}`}
      {...props}
    >
      {children}
    </p>
  )
);
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => (
    <div
      ref={ref}
      className={`p-5 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => (
    <div
      ref={ref}
      className={`px-5 py-3.5 bg-black/20 border-t border-white/[0.06] flex items-center justify-between gap-3 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);
CardFooter.displayName = 'CardFooter';
