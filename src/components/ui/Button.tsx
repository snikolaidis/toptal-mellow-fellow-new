/**
 * BUTTON COMPONENT
 * ================
 *
 * Reusable button with multiple variants and sizes.
 *
 * USAGE:
 *   <Button>Click me</Button>
 *   <Button variant="secondary">Secondary</Button>
 *   <Button variant="outline" size="sm">Small Outline</Button>
 *   <Button loading>Processing...</Button>
 *   <Button disabled>Disabled</Button>
 *
 * VARIANTS:
 *   - primary: Black background, white text (default)
 *   - secondary: White background, black text (for dark backgrounds)
 *   - outline: Transparent with black border
 *   - ghost: No background or border
 *
 * SIZES:
 *   - sm: Small buttons for compact UI
 *   - md: Default size
 *   - lg: Large buttons for primary actions
 *   - full: Full width buttons
 *
 * LOCATION: src/components/ui/Button.tsx
 */

import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'full';
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      leftIcon,
      rightIcon,
      children,
      className = '',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    // Base styles applied to all buttons
    const baseStyles = `
      inline-flex items-center justify-center
      font-semibold uppercase tracking-wide
      transition-all duration-200
      focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2
      disabled:cursor-not-allowed disabled:opacity-50
    `;

    // Variant styles
    const variantStyles = {
      primary: `
        bg-brand-primary text-text-inverse border border-brand-primary
        hover:bg-brand-primary-hover hover:border-brand-primary-hover
      `,
      secondary: `
        bg-surface-primary text-text-primary border border-surface-primary
        hover:bg-surface-secondary
      `,
      outline: `
        bg-transparent text-text-primary border border-brand-primary
        hover:bg-brand-primary hover:text-text-inverse
      `,
      ghost: `
        bg-transparent text-text-primary border-transparent
        hover:bg-surface-secondary
      `,
    };

    // Size styles
    const sizeStyles = {
      sm: 'h-9 px-4 text-xs',
      md: 'h-12 px-6 text-sm',
      lg: 'h-14 px-8 text-base',
      full: 'h-12 px-6 text-sm w-full',
    };

    const combinedClassName = `
      ${baseStyles}
      ${variantStyles[variant]}
      ${sizeStyles[size]}
      ${className}
    `.replace(/\s+/g, ' ').trim();

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={combinedClassName}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!loading && leftIcon && <span className="mr-2">{leftIcon}</span>}
        {children}
        {!loading && rightIcon && <span className="ml-2">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
