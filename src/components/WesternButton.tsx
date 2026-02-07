import { forwardRef, ButtonHTMLAttributes } from 'react';

interface WesternButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'sheriff' | 'outlaw';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const WesternButton = forwardRef<HTMLButtonElement, WesternButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', children, ...props }, ref) => {
    const variantClasses = {
      primary: 'western-btn-primary',
      secondary: 'western-btn-secondary',
      danger: 'western-btn-danger',
      sheriff: 'western-btn-sheriff',
      outlaw: 'western-btn-outlaw',
    };

    const sizeClasses = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3 text-lg',
      lg: 'px-8 py-4 text-xl',
      xl: 'px-12 py-6 text-2xl',
    };

    return (
      <button
        ref={ref}
        className={`western-btn ${variantClasses[variant]} ${sizeClasses[size]} flex items-center justify-center gap-2 ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

WesternButton.displayName = 'WesternButton';
