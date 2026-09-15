import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { GiftIcon } from '@/components/icons';
import {
  useShippingWaiverCountdown,
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
  const remainingMs = useShippingWaiverCountdown();
  const [dismissed, setDismissed] = useState(false);

  // Reset the dismissal on every navigation - a bar closed on one page
  // shouldn't stay hidden site-wide for the rest of the session.
  useEffect(() => {
    setDismissed(false);
  }, [router.asPath]);

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
