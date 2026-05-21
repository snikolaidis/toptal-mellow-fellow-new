/**
 * Form Validation Utilities
 *
 * Reusable validation functions for forms throughout the application.
 */

import type { AddressData, CheckoutFormData } from '@/types/checkout';

export type ValidationErrors = Record<string, string>;

/**
 * Validate an email address format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate a phone number (basic validation - digits, spaces, dashes, parens)
 */
export function validatePhone(phone: string): boolean {
  if (!phone) return true; // Phone is optional
  const phoneRegex = /^[\d\s\-()+ ]{7,20}$/;
  return phoneRegex.test(phone);
}

/**
 * Validate a US ZIP code
 */
export function validateZipCode(zip: string, country: string = 'US'): boolean {
  if (country === 'US') {
    return /^\d{5}(-\d{4})?$/.test(zip);
  }
  if (country === 'CA') {
    return /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(zip);
  }
  // Generic validation for other countries
  return zip.length >= 3 && zip.length <= 10;
}

/**
 * Check if a string is empty or only whitespace
 */
export function isEmpty(value: string | undefined | null): boolean {
  return !value || !value.trim();
}

/**
 * Validate an address object
 *
 * @param address - The address data to validate
 * @param prefix - Prefix for error keys (e.g., 'billing' or 'shipping')
 * @param options - Validation options
 */
export function validateAddress(
  address: AddressData,
  prefix: string,
  options: { requireEmail?: boolean } = {}
): ValidationErrors {
  const errors: ValidationErrors = {};

  if (isEmpty(address.firstName)) {
    errors[`${prefix}.firstName`] = 'Required';
  }

  if (isEmpty(address.lastName)) {
    errors[`${prefix}.lastName`] = 'Required';
  }

  if (options.requireEmail) {
    if (isEmpty(address.email)) {
      errors[`${prefix}.email`] = 'Required';
    } else if (!validateEmail(address.email!)) {
      errors[`${prefix}.email`] = 'Invalid email address';
    }
  }

  if (address.phone && !validatePhone(address.phone)) {
    errors[`${prefix}.phone`] = 'Invalid phone number';
  }

  if (isEmpty(address.address1)) {
    errors[`${prefix}.address1`] = 'Required';
  }

  if (isEmpty(address.city)) {
    errors[`${prefix}.city`] = 'Required';
  }

  if (isEmpty(address.state)) {
    errors[`${prefix}.state`] = 'Required';
  }

  if (isEmpty(address.postcode)) {
    errors[`${prefix}.postcode`] = 'Required';
  }

  if (isEmpty(address.country)) {
    errors[`${prefix}.country`] = 'Required';
  }

  return errors;
}

/**
 * Validate checkout form data
 */
export function validateCheckoutForm(data: CheckoutFormData): ValidationErrors {
  let errors: ValidationErrors = {};

  // Validate billing (always required, with email)
  errors = {
    ...errors,
    ...validateAddress(data.billing, 'billing', { requireEmail: true }),
  };

  // Validate shipping if different from billing
  if (!data.sameAsBilling && data.shipping) {
    errors = {
      ...errors,
      ...validateAddress(data.shipping, 'shipping'),
    };
  }

  return errors;
}

/**
 * Validate billing address (requires email)
 */
export function validateBillingAddress(address: AddressData): ValidationErrors {
  return validateAddress(address, 'billing', { requireEmail: true });
}

/**
 * Validate shipping address (email not required)
 */
export function validateShippingAddress(address: AddressData): ValidationErrors {
  return validateAddress(address, 'shipping');
}

/**
 * Check if validation passed (no errors)
 */
export function isValid(errors: ValidationErrors): boolean {
  return Object.keys(errors).length === 0;
}

/**
 * Get error message for a field
 */
export function getFieldError(errors: ValidationErrors, field: string): string | undefined {
  return errors[field];
}

/**
 * Check if a specific field has an error
 */
export function hasFieldError(errors: ValidationErrors, field: string): boolean {
  return field in errors;
}
