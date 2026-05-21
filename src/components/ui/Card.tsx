/**
 * CARD COMPONENT
 * ===============
 *
 * Reusable container component for content grouping.
 *
 * USAGE:
 *   <Card>Content here</Card>
 *   <Card variant="bordered">With border</Card>
 *   <Card variant="elevated">With shadow</Card>
 *   <Card padding="lg">More padding</Card>
 *
 * VARIANTS:
 *   - default: White background, no border
 *   - bordered: White background with border
 *   - muted: Muted background color
 *   - elevated: With shadow for elevation
 *   - dark: Dark background with light text
 *
 * LOCATION: src/components/ui/Card.tsx
 */

import { HTMLAttributes, forwardRef } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'bordered' | 'muted' | 'elevated' | 'dark';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  as?: 'div' | 'section' | 'article' | 'aside';
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'bordered',
      padding = 'lg',
      as: Component = 'div',
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    // Variant styles
    const variantStyles = {
      default: 'bg-surface-primary',
      bordered: 'bg-surface-primary border border-border-default',
      muted: 'bg-surface-secondary',
      elevated: 'bg-surface-primary shadow-md',
      dark: 'bg-surface-dark text-text-inverse',
    };

    // Padding styles
    const paddingStyles = {
      none: '',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
      xl: 'p-10',
    };

    const combinedClassName = `
      ${variantStyles[variant]}
      ${paddingStyles[padding]}
      ${className}
    `.replace(/\s+/g, ' ').trim();

    return (
      <Component ref={ref} className={combinedClassName} {...props}>
        {children}
      </Component>
    );
  }
);

Card.displayName = 'Card';

/**
 * CARD HEADER
 * Optional header section for cards
 */
export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ title, subtitle, action, className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`flex items-start justify-between mb-6 ${className}`}
        {...props}
      >
        <div>
          {title && (
            <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
          )}
          {subtitle && (
            <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
          )}
          {children}
        </div>
        {action && <div className="ml-4">{action}</div>}
      </div>
    );
  }
);

CardHeader.displayName = 'CardHeader';

/**
 * CARD FOOTER
 * Optional footer section for cards
 */
export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  bordered?: boolean;
}

const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ bordered = true, className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`
          mt-6 pt-6
          ${bordered ? 'border-t border-border-default' : ''}
          ${className}
        `.replace(/\s+/g, ' ').trim()}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter };
