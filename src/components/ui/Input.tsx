/**
 * INPUT COMPONENT
 * ================
 *
 * Reusable form input with built-in label, error handling, and accessibility.
 *
 * USAGE:
 *   <Input label="Email" type="email" placeholder="you@example.com" />
 *   <Input label="Password" type="password" error="Password is required" />
 *   <Input label="Name" required />
 *
 * FEATURES:
 *   - Automatic label association with htmlFor
 *   - Error state styling and message display
 *   - Proper ARIA attributes for accessibility
 *   - Focus ring for keyboard navigation
 *
 * LOCATION: src/components/ui/Input.tsx
 */

import { InputHTMLAttributes, forwardRef, useId } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  size?: 'sm' | 'md' | 'lg';
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      size = 'md',
      className = '',
      id,
      required,
      disabled,
      ...props
    },
    ref
  ) => {
    // Generate unique ID for label association
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    // Size styles
    const sizeStyles = {
      sm: 'h-10 px-3 text-sm',
      md: 'h-12 px-4 text-base',
      lg: 'h-14 px-5 text-lg',
    };

    const inputStyles = `
      w-full
      border transition-all duration-200
      bg-surface-primary text-text-primary
      placeholder:text-text-muted
      focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1
      disabled:bg-surface-secondary disabled:cursor-not-allowed disabled:text-text-muted
      ${error ? 'border-state-error' : 'border-border-default'}
      ${error ? 'focus-visible:ring-state-error' : ''}
      ${sizeStyles[size]}
      ${className}
    `.replace(/\s+/g, ' ').trim();

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold uppercase tracking-wide text-text-primary mb-2"
          >
            {label}
            {required && <span className="text-state-error ml-1" aria-hidden="true">*</span>}
          </label>
        )}

        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={
            [error ? errorId : null, hint ? hintId : null]
              .filter(Boolean)
              .join(' ') || undefined
          }
          className={inputStyles}
          {...props}
        />

        {hint && !error && (
          <p id={hintId} className="mt-1.5 text-xs text-text-secondary">
            {hint}
          </p>
        )}

        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-1.5 text-xs text-state-error"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

/**
 * SELECT COMPONENT
 * Dropdown select with same styling as Input
 */
export interface SelectProps extends Omit<InputHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      size = 'md',
      className = '',
      id,
      required,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const errorId = `${selectId}-error`;

    const sizeStyles = {
      sm: 'h-10 px-3 text-sm',
      md: 'h-12 px-4 text-base',
      lg: 'h-14 px-5 text-lg',
    };

    const selectStyles = `
      w-full appearance-none
      border transition-all duration-200
      bg-surface-primary text-text-primary
      focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1
      disabled:bg-surface-secondary disabled:cursor-not-allowed disabled:text-text-muted
      ${error ? 'border-state-error' : 'border-border-default'}
      ${sizeStyles[size]}
      ${className}
    `.replace(/\s+/g, ' ').trim();

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-semibold uppercase tracking-wide text-text-primary mb-2"
          >
            {label}
            {required && <span className="text-state-error ml-1" aria-hidden="true">*</span>}
          </label>
        )}

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? errorId : undefined}
            className={selectStyles}
            {...props}
          >
            {children}
          </select>
          {/* Dropdown arrow */}
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <svg
              className="h-4 w-4 text-text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-1.5 text-xs text-state-error"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

/**
 * TEXTAREA COMPONENT
 * Multi-line text input
 */
export interface TextareaProps extends InputHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  rows?: number;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      rows = 4,
      className = '',
      id,
      required,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const textareaId = id || generatedId;
    const errorId = `${textareaId}-error`;

    const textareaStyles = `
      w-full p-4
      border transition-all duration-200
      bg-surface-primary text-text-primary
      placeholder:text-text-muted
      focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1
      disabled:bg-surface-secondary disabled:cursor-not-allowed
      resize-vertical
      ${error ? 'border-state-error' : 'border-border-default'}
      ${className}
    `.replace(/\s+/g, ' ').trim();

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-xs font-semibold uppercase tracking-wide text-text-primary mb-2"
          >
            {label}
            {required && <span className="text-state-error ml-1" aria-hidden="true">*</span>}
          </label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          disabled={disabled}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? errorId : undefined}
          className={textareaStyles}
          {...props}
        />

        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-1.5 text-xs text-state-error"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export { Input, Select, Textarea };
