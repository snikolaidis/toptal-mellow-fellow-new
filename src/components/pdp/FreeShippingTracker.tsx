import { useCartOffers } from '@/config/cartOffers';
import { useCart } from '@/context/CartContext';

/**
 * How much more the shopper needs in their cart to unlock free shipping.
 *
 * The cart drawer's `TieredProgressBar` shows every reward tier with a
 * progress track; this is the PDP's cut-down version — one line, no track,
 * covering the free-shipping tier only.
 *
 * Threshold comes from the same `useCartOffers` source the drawer uses, so the
 * two can't drift. Its default (80) applies until `/api/shop/cart-offers`
 * answers.
 */
function TruckIcon() {
  return (
    <svg
      className="free-shipping-tracker__icon"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.5 6.5h11v9h-11z" />
      <path d="M13.5 9.5h3.6l3.4 3.4v2.6h-7z" />
      <circle cx="7" cy="17.5" r="1.9" />
      <circle cx="17" cy="17.5" r="1.9" />
    </svg>
  );
}

function parsePrice(price: string): number {
  return parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
}

export default function FreeShippingTracker() {
  const { freeShippingThreshold } = useCartOffers();
  const { cart } = useCart();

  if (!freeShippingThreshold || freeShippingThreshold <= 0) {
    return null;
  }

  const subtotal = parsePrice(cart?.subtotal || '0');
  const remaining = freeShippingThreshold - subtotal;
  const unlocked = remaining <= 0;

  return (
    <div className="free-shipping-tracker" data-unlocked={unlocked || undefined}>
      <TruckIcon />
      <p className="free-shipping-tracker__text">
        {unlocked ? (
          <>
            You&apos;ve unlocked <strong>free shipping</strong>.
          </>
        ) : (
          <>
            Add{' '}
            <strong className="free-shipping-tracker__amount">
              ${remaining.toFixed(2)}
            </strong>{' '}
            more to unlock free shipping.
          </>
        )}
      </p>
    </div>
  );
}
