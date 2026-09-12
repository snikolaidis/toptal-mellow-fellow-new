import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { GiftIcon } from '@/components/icons';
import {
  readShippingWaiver,
  clearShippingWaiver,
  formatCountdown,
} from '@/lib/shippingWaiver';
import styles from './ShippingWaiverBar.module.css';

/*
 * Sitewide reminder of the "Forgot Something?" shipping waiver, so a
 * customer who lands on order-confirmation and then browses away
 * still sees the offer while it's live - not just on that one page.
 *
 * Purely a display convenience: the countdown here can never grant
 * anything by itself, /api/checkout independently re-validates order
 * ownership and the time window before ever waiving shipping.
 */
export default function ShippingWaiverBar() {
  const router = useRouter();
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Re-check on every navigation - covers landing on order-confirmation
  // (which writes the waiver) and later browsing to any other page.
  useEffect(() => {
    const waiver = readShippingWaiver();
    setDeadline(waiver?.deadline ?? null);
    setDismissed(false);
  }, [router.asPath]);

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

  const isOrderConfirmation = router.pathname === '/order-confirmation';

  if (
    dismissed ||
    isOrderConfirmation ||
    remainingMs === null ||
    remainingMs <= 0
  ) {
    return null;
  }

  return (
    <div className={styles.bar}>
      <span className={styles.message}>
        <GiftIcon />
        Free shipping on anything you add —{' '}
        <strong>{formatCountdown(remainingMs)}</strong> left
      </span>

      <div className={styles.actions}>
        <Link href="/shop" className={styles.shopLink}>
          Shop now
        </Link>

        <button
          type="button"
          className={styles.dismiss}
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
