/**
 * UI COMPONENTS INDEX
 * ===================
 *
 * Central export for all shared UI components.
 *
 * USAGE:
 *   import { Button, Input, Card } from '@/components/ui';
 *
 * AVAILABLE COMPONENTS:
 *   - Button: Primary action buttons with variants
 *   - Input: Form text input with label and error
 *   - Select: Dropdown select input
 *   - Textarea: Multi-line text input
 *   - Card: Container for content grouping
 *   - CardHeader: Optional card header section
 *   - CardFooter: Optional card footer section
 *
 * LOCATION: src/components/ui/index.ts
 */

// Button
export { Button } from './Button';
export type { ButtonProps } from './Button';

// Form Inputs
export { Input, Select, Textarea } from './Input';
export type { InputProps, SelectProps, TextareaProps } from './Input';

// Card
export { Card, CardHeader, CardFooter } from './Card';
export type { CardProps, CardHeaderProps, CardFooterProps } from './Card';
