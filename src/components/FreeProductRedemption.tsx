import { useEffect, useState } from 'react';
import { useCart } from '@/context/CartContext';

interface ProductRedemptionData {
  id: number;
  rewardText: string;
  token: string;
  variantId: number | string;
  costInPoints?: number;
}

declare global {
  interface Window {
    onProductRedemption?: (data: ProductRedemptionData) => Promise<boolean>;
  }
}

const CART_ID_KEY = 'mf_loyalty_cart_id';

function resolveCartId(): string {
  try {
    const existing = window.sessionStorage.getItem(CART_ID_KEY);
    if (existing) return existing;
    const generated = `mf_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(CART_ID_KEY, generated);
    return generated;
  } catch {
    return `mf_${Date.now()}`;
  }
}

function getCustomerEmail(): string {
  if (typeof document === 'undefined') return '';
  const el = document.getElementById('swell-customer-identification');
  return el?.getAttribute('data-email') || '';
}

export default function FreeProductRedemption() {
  const { cart, addToCart, applyCoupon, openDrawer } = useCart();
  const [cartId, setCartId] = useState('');

  useEffect(() => {
    setCartId(resolveCartId());
  }, []);

  useEffect(() => {
    if (!cartId) return;

    const handler = async (data: ProductRedemptionData): Promise<boolean> => {
      try {
        const productId = Number(data?.variantId);
        const code = (data?.rewardText || '').trim();
        if (!productId || !code) {
          return false;
        }

        const res = await fetch('/api/loyalty/free-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cart_id: cartId,
            variant_id: String(data.variantId),
            customer_email: getCustomerEmail(),
            point_redemption_id: data.id,
            token: data.token,
            reward_text: code,
            product_id: productId,
          }),
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.verified || !json?.code) {
          return false;
        }

        await addToCart({ productId, quantity: 1 });
        await applyCoupon(json.code);
        openDrawer();
        return true;
      } catch {
        return false;
      }
    };

    window.onProductRedemption = handler;
    return () => {
      if (window.onProductRedemption === handler) {
        delete window.onProductRedemption;
      }
    };
  }, [cartId, addToCart, applyCoupon, openDrawer]);

  if (!cartId) {
    return null;
  }

  const hasPaidProduct = cart ? !cart.isEmpty : false;

  return (
    <div
      id="yotpo-loyalty-cart-data"
      data-cart-id={cartId}
      data-cart-currency="USD"
      data-free-product-points="0"
      data-applied-coupon-points="0"
      data-has-paid-product={hasPaidProduct ? 'true' : 'false'}
      data-has-free-product="false"
      style={{ display: 'none' }}
      suppressHydrationWarning
    />
  );
}
