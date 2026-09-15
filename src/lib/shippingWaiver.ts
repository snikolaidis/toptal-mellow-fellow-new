/*
 * Shared client-side reference for the "Forgot Something?" shipping
 * waiver - order-confirmation.tsx writes it the moment a customer
 * lands there, checkout.tsx reads it to waive shipping in the UI,
 * and ShippingWaiverBar / the cart drawer read it to show a
 * countdown instead of the normal "$X away from free shipping"
 * progress bar (which would otherwise contradict an already-waived
 * order).
 *
 * This is only ever a display/convenience hint. The actual
 * enforcement (order ownership, the 10-minute window) is
 * independently re-validated server-side in /api/checkout - see
 * validateShippingWaiver there.
 */

import { useEffect, useState } from 'react';

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

/**
 * Live countdown for whatever waiver is currently in sessionStorage,
 * checked once on mount and ticked from there. Returns null when
 * there's no active waiver (nothing to show), otherwise the
 * remaining milliseconds (0 once it expires, for one final render
 * before callers stop showing it).
 */
export function useShippingWaiverCountdown(): number | null {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    setDeadline(readShippingWaiver()?.deadline ?? null);
  }, []);

  useEffect(() => {
    if (!deadline) {
      setRemainingMs(null);
      return;
    }

    const tick = () => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        setRemainingMs(0);
        clearShippingWaiver();
      } else {
        setRemainingMs(remaining);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return remainingMs;
}
