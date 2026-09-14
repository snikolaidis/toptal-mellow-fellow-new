import { AppliedCoupon, ShippingPackage } from '@/types/checkout';

// ---------------------------------------------------------------------------
// Types matching the existing Cart / CartItem interfaces in CartContext
// ---------------------------------------------------------------------------

export interface CartItem {
  key: string;
  quantity: number;
  total: string;
  subtotal?: string;
  bbBundleId?: number;
  bbGroupKey?: string;
  bbLocked?: boolean;
  bbUnitPrice?: number;
  bbFixedOriginalPrice?: number;
  // "fixed" | "mystery" — when "mystery", mask this line's own product name/image.
  bbMode?: 'fixed' | 'mystery';
  isFreeGift?: boolean;
  product: {
    databaseId: number;
    name: string;
    slug: string;
    price: string;
    regularPrice?: string;
    image?: { sourceUrl: string; altText: string };
    productTypes?: Array<{ name: string; slug: string }>;
  };
  variation?: {
    databaseId: number;
    name: string;
    price: string;
  };
}

// Automatic promotions applied by the promotion engine (resolver), surfaced via the
// Store API cart extension so the cart can render locked chips. Empty when the engine
// is off, so this is safe to read unconditionally.
export interface CartPromotion {
  code: string;
  label: string;
  amount: number;      // dollars saved
  removable: boolean;  // automatic promotions render as a locked chip (no remove)
}

export interface Cart {
  items: CartItem[];
  subtotal: string;
  total: string;
  discountTotal: string;
  shippingTotal: string;
  isEmpty: boolean;
  itemsCount: number;
  appliedCoupons: AppliedCoupon[];
  promotions: CartPromotion[];
  availableShippingMethods: ShippingPackage[];
  chosenShippingMethods: string[];
}

// ---------------------------------------------------------------------------
// Price helpers — Store API returns prices in minor units (cents as strings)
// ---------------------------------------------------------------------------

function minorToFormatted(minorUnits: string | number | null | undefined, decimals = 2): string {
  const raw = parseInt(String(minorUnits ?? '0'), 10) || 0;
  const divisor = Math.pow(10, decimals);
  return `$${(raw / divisor).toFixed(decimals)}`;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function extractSlugFromPermalink(permalink: string): string {
  try {
    const url = new URL(permalink);
    const parts = url.pathname.replace(/\/$/, '').split('/');
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Transform Store API response → internal Cart shape
// ---------------------------------------------------------------------------

export function transformStoreApiCart(data: any): Cart | null {
  if (!data || typeof data !== 'object') return null;

  const items: CartItem[] = (data.items || []).map((item: any) => {
    const decimals = item.prices?.currency_minor_unit ?? 2;
    const price = minorToFormatted(item.prices?.price, decimals);
    // The Bundle Builder plugin (and any product-level sale price) discounts
    // via `prices.price`, not a coupon — so `totals.line_subtotal` already
    // reflects the discounted price too. `prices.regular_price` is the only
    // field that still carries the true pre-discount unit price.
    const regularPrice = item.prices?.regular_price
      ? minorToFormatted(item.prices.regular_price, decimals)
      : undefined;
    const totalsDecimals = item.totals?.currency_minor_unit ?? decimals;
    const lineTotal = minorToFormatted(item.totals?.line_total, totalsDecimals);
    const lineSubtotal = minorToFormatted(item.totals?.line_subtotal, totalsDecimals);

    const image = item.images?.[0];

    const variationAttrs: Array<{ attribute: string; value: string }> = item.variation || [];
    const hasVariation = variationAttrs.length > 0;

    // "bundle" = Bundle Builder plugin's own Store API extension
    // (bundle_id/group_key/locked/unit_price/mode). "mellow-fellow" = ours
    // (bb_fixed_original_price, mf_free_gift only).
    const bundleExt = item.extensions?.['bundle'] || {};
    const mf = item.extensions?.['mellow-fellow'] || {};
    const bbGroupKey = typeof bundleExt.group_key === 'string' && bundleExt.group_key ? bundleExt.group_key : undefined;
    const bbBundleId = bundleExt.bundle_id ? Number(bundleExt.bundle_id) : undefined;
    const bbMode = bundleExt.mode === 'fixed' || bundleExt.mode === 'mystery' ? bundleExt.mode : undefined;
    const isFreeGift = mf.mf_free_gift === true || undefined;

    return {
      key: item.key,
      quantity: item.quantity,
      total: lineTotal,
      subtotal: lineSubtotal,
      bbGroupKey,
      bbBundleId,
      bbLocked: bundleExt.locked === true || undefined,
      bbUnitPrice: typeof bundleExt.unit_price === 'number' ? bundleExt.unit_price : undefined,
      bbFixedOriginalPrice: typeof mf.bb_fixed_original_price === 'number' ? mf.bb_fixed_original_price : undefined,
      bbMode,
      isFreeGift,
      product: {
        databaseId: item.id,
        name: decodeHtmlEntities(item.name || ''),
        slug: extractSlugFromPermalink(item.permalink || ''),
        price,
        regularPrice,
        image: image
          ? { sourceUrl: image.src || image.thumbnail, altText: image.alt || '' }
          : undefined,
        productTypes: [],
      },
      variation: hasVariation
        ? {
            databaseId: item.id,
            name: variationAttrs.map((v: any) => `${v.attribute}: ${v.value}`).join(', '),
            price,
          }
        : undefined,
    } as CartItem;
  });

  const totalsDecimals = data.totals?.currency_minor_unit ?? 2;

  const shippingMethods: ShippingPackage[] = (data.shipping_rates || []).map((pkg: any) => ({
    packageDetails: pkg.name || 'Shipment',
    supportsShippingCalculator: true,
    rates: (pkg.shipping_rates || []).map((rate: any) => ({
      id: rate.rate_id,
      instanceId: rate.instance_id,
      methodId: rate.method_id,
      label: rate.name,
      cost: minorToFormatted(rate.price, rate.currency_minor_unit ?? totalsDecimals),
    })),
  }));

  const chosenMethods = (data.shipping_rates || []).flatMap((pkg: any) =>
    (pkg.shipping_rates || [])
      .filter((rate: any) => rate.selected)
      .map((rate: any) => rate.rate_id)
  );

  const coupons: AppliedCoupon[] = (data.coupons || []).map((c: any) => ({
    code: c.code,
    discountAmount: minorToFormatted(c.totals?.total_discount, c.totals?.currency_minor_unit ?? totalsDecimals),
    discountTax: minorToFormatted(c.totals?.total_discount_tax, c.totals?.currency_minor_unit ?? totalsDecimals),
  }));

  const promotions: CartPromotion[] = (
    data.extensions?.['mellow-fellow-promotions']?.promotions || []
  ).map((p: any) => ({
    code: String(p.code ?? ''),
    label: String(p.label ?? p.code ?? ''),
    amount: Number(p.amount ?? 0),
    removable: Boolean(p.removable),
  }));

  // Derive the "Free gift" chip client-side from the gift line itself. The gift
  // is a $0 cart line flagged isFreeGift (which serializes reliably), so we don't
  // depend on the server promotions extension for the chip — custom Store API
  // extension namespaces are brittle to serialize (WooCommerce's context filtering
  // nulls them), whereas the item flag is always present. Only add it if the
  // server didn't already surface it, so there's never a duplicate chip.
  const giftItem = items.find((i) => i.isFreeGift);
  if (giftItem && !promotions.some((p) => p.code === 'mf-free-gift')) {
    const regular = parseFloat(
      (giftItem.product.regularPrice || giftItem.product.price || '').replace(/[^0-9.]/g, '')
    ) || 0;
    promotions.push({ code: 'mf-free-gift', label: 'Free gift', amount: regular, removable: false });
  }

  return {
    items,
    subtotal: minorToFormatted(data.totals?.total_items, totalsDecimals),
    total: minorToFormatted(data.totals?.total_price, totalsDecimals),
    discountTotal: minorToFormatted(data.totals?.total_discount, totalsDecimals),
    shippingTotal: minorToFormatted(data.totals?.total_shipping, totalsDecimals),
    isEmpty: items.length === 0,
    itemsCount: data.items_count ?? items.length,
    appliedCoupons: coupons,
    promotions,
    availableShippingMethods: shippingMethods,
    chosenShippingMethods: chosenMethods,
  };
}

// ---------------------------------------------------------------------------
// Store API fetch wrapper — calls our proxy at /api/store/...
// ---------------------------------------------------------------------------

export class StoreApiError extends Error {
  status: number;
  code: string;
  updatedCart: Cart | null;

  constructor(message: string, status: number, code = 'store_api_error', rawData?: any) {
    super(message);
    this.name = 'StoreApiError';
    this.status = status;
    this.code = code;
    // 409 responses include the current server-side cart state for reconciliation.
    this.updatedCart = status === 409 && rawData ? transformStoreApiCart(rawData) : null;
  }
}

const GATEWAY_ERRORS = new Set([502, 503, 504]);

function isRetryable(err: unknown): boolean {
  return err instanceof StoreApiError && (GATEWAY_ERRORS.has(err.status) || err.code === 'invalid_response');
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function storeApiFetch<T = any>(
  path: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
  } = {},
  retries = 0
): Promise<T> {
  const { method = 'GET', body } = options;

  const res = await fetch(`/api/store/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  let data: any;
  try {
    data = await res.json();
  } catch {
    const err = new StoreApiError(
      `Store API returned non-JSON response (${res.status})`,
      res.status,
      'invalid_response'
    );
    if (retries > 0) { await delay(1000); return storeApiFetch(path, options, retries - 1); }
    throw err;
  }

  if (data?._sessionExpired) {
    throw new StoreApiError(
      'Your cart session has expired.',
      res.status,
      'session_expired'
    );
  }

  if (!res.ok) {
    const err = new StoreApiError(
      data?.message || `Store API error (${res.status})`,
      res.status,
      data?.code || 'store_api_error',
      data
    );
    if (retries > 0 && isRetryable(err)) { await delay(1000); return storeApiFetch(path, options, retries - 1); }
    throw err;
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Cart-specific Store API operations
// ---------------------------------------------------------------------------

export async function fetchCartFromStore(): Promise<Cart | null> {
  const data = await storeApiFetch('cart', {}, 1);
  return transformStoreApiCart(data);
}

export async function addItemToStore(
  productId: number,
  quantity: number,
  variationId?: number,
  variation?: Array<{ attribute: string; value: string }>
): Promise<Cart | null> {
  const body: Record<string, unknown> = { id: productId, quantity };
  if (variationId) {
    body.id = variationId;
    if (variation) body.variation = variation;
  }
  const data = await storeApiFetch('cart/add-item', { method: 'POST', body });
  return transformStoreApiCart(data);
}

export async function updateItemInStore(
  key: string,
  quantity: number
): Promise<Cart | null> {
  const data = await storeApiFetch('cart/update-item', {
    method: 'POST',
    body: { key, quantity },
  }, 1);
  return transformStoreApiCart(data);
}

export async function removeItemFromStore(key: string): Promise<Cart | null> {
  const data = await storeApiFetch('cart/remove-item', {
    method: 'POST',
    body: { key },
  }, 1);
  return transformStoreApiCart(data);
}

export async function clearStoreCart(): Promise<Cart | null> {
  // Primary: single server-side call via WC Store API extensions.
  // The mellow-fellow-cart-persistence mu-plugin registers a callback that
  // calls WC()->cart->empty_cart(true) — clears items, coupons, fees, and
  // session data in one PHP execution instead of N sequential HTTP requests.
  try {
    const data = await storeApiFetch('cart/extensions', {
      method: 'POST',
      body: { namespace: 'mellow-fellow/cart-ops', data: { action: 'empty_cart' } },
    });
    return transformStoreApiCart(data);
  } catch {
    // Extension not registered (mu-plugin not deployed yet) — fall back to
    // batch removal which still sends one HTTP request for all operations.
  }

  // Fallback: DELETE /cart/coupons (all) + DELETE /cart/items (all).
  // Two calls total regardless of how many items/coupons exist.
  try { await storeApiFetch('cart/coupons', { method: 'DELETE' }); } catch {}
  try { await storeApiFetch('cart/items', { method: 'DELETE' }); } catch {}

  return fetchCartFromStore();
}

export async function addBundleToStore(
  bundleId: number,
  productIds: number[]
): Promise<Cart | null> {
  const data = await storeApiFetch('cart/extensions', {
    method: 'POST',
    body: {
      namespace: 'mellow-fellow/cart-ops',
      data: { action: 'add_bundle', bundle_id: bundleId, product_ids: productIds },
    },
  });
  return transformStoreApiCart(data);
}

export async function addFixedBundleToStore(
  productId: number,
  quantity: number
): Promise<Cart | null> {
  const data = await storeApiFetch('cart/extensions', {
    method: 'POST',
    body: {
      namespace: 'mellow-fellow/cart-ops',
      data: { action: 'add_fixed_bundle', product_id: productId, quantity },
    },
  });
  return transformStoreApiCart(data);
}

export async function removeBundleGroupsFromStore(groupKeys: string[]): Promise<Cart | null> {
  const data = await storeApiFetch('cart/extensions', {
    method: 'POST',
    body: {
      namespace: 'mellow-fellow/cart-ops',
      data: { action: 'remove_bundle_group', group_keys: groupKeys },
    },
  });
  return transformStoreApiCart(data);
}

export async function addFreeGiftToStore(productId: number): Promise<Cart | null> {
  const data = await storeApiFetch('cart/extensions', {
    method: 'POST',
    body: {
      namespace: 'mellow-fellow/cart-ops',
      data: { action: 'add_free_gift', product_id: productId },
    },
  });
  return transformStoreApiCart(data);
}

export async function removeFreeGiftFromStore(): Promise<Cart | null> {
  const data = await storeApiFetch('cart/extensions', {
    method: 'POST',
    body: {
      namespace: 'mellow-fellow/cart-ops',
      data: { action: 'remove_free_gift' },
    },
  });
  return transformStoreApiCart(data);
}

export async function applyCouponToStore(code: string): Promise<Cart | null> {
  const data = await storeApiFetch('cart/apply-coupon', {
    method: 'POST',
    body: { code },
  }, 1);
  return transformStoreApiCart(data);
}

export async function removeCouponFromStore(code: string): Promise<Cart | null> {
  const data = await storeApiFetch('cart/remove-coupon', {
    method: 'POST',
    body: { code },
  }, 1);
  return transformStoreApiCart(data);
}

export async function selectShippingRate(
  packageId: number,
  rateId: string
): Promise<Cart | null> {
  const data = await storeApiFetch('cart/select-shipping-rate', {
    method: 'POST',
    body: { package_id: packageId, rate_id: rateId },
  }, 1);
  return transformStoreApiCart(data);
}
