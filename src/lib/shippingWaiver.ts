/*
 * Shared client-side reference for the "Forgot Something?" shipping
 * waiver - order-confirmation.tsx writes it the moment a customer
 * lands there, checkout.tsx reads it to waive shipping in the UI,
 * and ShippingWaiverBar reads it to show a sitewide countdown.
 *
 * This is only ever a display/convenience hint. The actual
 * enforcement (order ownership, the 10-minute window) is
 * independently re-validated server-side in /api/checkout - see
 * validateShippingWaiver there.
 */

export const SHIPPING_WAIVER_KEY = 'mf-shipping-waiver';
export const SHIPPING_WAIVER_MINUTES = 10;

export interface ShippingWaiver {
  orderId: string;
  orderKey: string;
  deadline: number;
}

function isShippingWaiver(value: unknown): value is ShippingWaiver {
  const v = value as Partial<ShippingWaiver> | null;
  return (
    !!v &&
    typeof v.orderId === 'string' &&
    typeof v.orderKey === 'string' &&
    typeof v.deadline === 'number'
  );
}

/**
 * Reads the waiver back, returning null (and clearing it) if it's
 * missing, malformed, or past its deadline.
 */
export function readShippingWaiver(): ShippingWaiver | null {
  try {
    const stored = sessionStorage.getItem(SHIPPING_WAIVER_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    if (isShippingWaiver(parsed) && Date.now() < parsed.deadline) {
      return parsed;
    }

    sessionStorage.removeItem(SHIPPING_WAIVER_KEY);
    return null;
  } catch {
    return null;
  }
}

export function writeShippingWaiver(waiver: ShippingWaiver): void {
  try {
    sessionStorage.setItem(SHIPPING_WAIVER_KEY, JSON.stringify(waiver));
  } catch {}
}

export function clearShippingWaiver(): void {
  try {
    sessionStorage.removeItem(SHIPPING_WAIVER_KEY);
  } catch {}
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
