import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { useAuth, getApolloAuthClient } from '@faustwp/core';
import { getBrowserClient, resetBrowserClient } from '@/lib/apollo-client';
import {
  GET_CART_LITE,
  ADD_TO_CART_LITE,
  ADD_BUNDLE_TO_CART,
  REMOVE_BUNDLE_FROM_CART,
  UPDATE_CART_ITEM_QUANTITY_LITE,
  REMOVE_FROM_CART_LITE,
  CLEAR_CART_LITE,
  APPLY_COUPON_LITE,
  REMOVE_COUPON_LITE,
  UPDATE_SHIPPING_METHOD,
} from '@/graphql/queries/cart';
import { ShippingPackage, AppliedCoupon } from '@/types/checkout';
import {
  CartError,
  ErrorCode,
  getUserMessage,
  logError,
} from '@/lib/errors';

/**
 * Cart Context - WooCommerce GraphQL Cart
 *
 * Uses WooCommerce as the source of truth for cart data.
 * The woographql-cart-persistence plugin handles saving/loading
 * cart data for logged-in users.
 */

/**
 * WooGraphQL returns error messages with HTML entities (e.g. &quot;).
 * Decode the common ones so messages render cleanly in the UI.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * WooCommerce surfaces specific, useful reasons for cart mutation failures
 * (e.g. "You cannot add that amount, only 4 remaining" for a stock limit) as
 * the GraphQL error message. Prefer that over a generic fallback so the user
 * finds out *why*, not just that something failed.
 */
function extractCartErrorMessage(err: unknown, fallback: string): string {
  const gqlMessage = (err as { graphQLErrors?: Array<{ message?: string }> })?.graphQLErrors?.[0]
    ?.message;
  const raw = gqlMessage || (err instanceof Error ? err.message : null) || fallback;
  return decodeHtmlEntities(raw);
}

// The optimistic quantity bump only updated the quantity digit — the line's
// own price and the cart subtotal/total stayed frozen at the pre-click value
// until the round-trip finished, which is what actually read as "nothing
// happening right away." Derive a unit price from the item's own
// total/quantity and apply the delta locally so price figures move instantly
// too; the authoritative server response still replaces all of this exactly
// once it lands.
function parseMoney(value: string | undefined): number {
  return parseFloat((value || '').replace(/[^0-9.-]/g, '')) || 0;
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

interface CartItem {
  key: string;
  quantity: number;
  total: string;
  bbBundleId?: number;
  bbGroupKey?: string;
  bbLocked?: boolean;
  bbUnitPrice?: number;
  product: {
    databaseId: number;
    name: string;
    slug: string;
    price: string;
    image?: {
      sourceUrl: string;
      altText: string;
    };
    productTypes?: Array<{ name: string; slug: string }>;
  };
  variation?: {
    databaseId: number;
    name: string;
    price: string;
  };
}

interface Cart {
  items: CartItem[];
  subtotal: string;
  total: string;
  discountTotal: string;
  shippingTotal: string;
  isEmpty: boolean;
  itemsCount: number;
  appliedCoupons: AppliedCoupon[];
  availableShippingMethods: ShippingPackage[];
  chosenShippingMethods: string[];
}

interface AddToCartInput {
  productId: number;
  quantity: number;
  variationId?: number;
}

export interface BundleGroupInstance {
  groupKey: string;
  items: CartItem[];
}

export interface BundleGroup {
  mergeKey: string;
  bundleId: number;
  bundleName: string;
  quantity: number;
  representativeItems: CartItem[];
  instances: BundleGroupInstance[];
}

export function groupCartItems(
  items: CartItem[],
  bundleNames: Record<number, string>
): { bundles: BundleGroup[]; standalone: CartItem[] } {
  const byGroupKey: Record<string, { bundleId: number; items: CartItem[] }> = {};
  const standalone: CartItem[] = [];

  for (const item of items) {
    if (item.bbGroupKey && item.bbBundleId != null) {
      if (!byGroupKey[item.bbGroupKey]) {
        byGroupKey[item.bbGroupKey] = { bundleId: item.bbBundleId, items: [] };
      }
      byGroupKey[item.bbGroupKey].items.push(item);
    } else {
      standalone.push(item);
    }
  }

  // Merge instances only when they share the same bundleId AND the same product set.
  // Different product selections from the same bundle builder appear as separate groups.
  const byProductSet: Record<string, BundleGroup> = {};
  for (const [groupKey, { bundleId, items: groupItems }] of Object.entries(byGroupKey)) {
    const productFingerprint = groupItems
      .map((i) => i.product.databaseId)
      .sort((a, b) => a - b)
      .join(',');
    const mergeKey = `${bundleId}:${productFingerprint}`;
    if (!byProductSet[mergeKey]) {
      byProductSet[mergeKey] = {
        mergeKey,
        bundleId,
        bundleName: bundleNames[bundleId] || 'Bundle',
        quantity: 0,
        representativeItems: groupItems,
        instances: [],
      };
    }
    byProductSet[mergeKey].instances.push({ groupKey, items: groupItems });
    byProductSet[mergeKey].quantity++;
  }

  return { bundles: Object.values(byProductSet), standalone };
}

interface CartContextType {
  cart: Cart | null;
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  isDrawerOpen: boolean;
  bundleNames: Record<number, string>;
  bundleDiscounts: Record<number, number>;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  addToCart: (input: AddToCartInput) => Promise<void>;
  addBundleToCart: (bundleId: number, productIds: number[], bundleName: string, discountPercent?: number) => Promise<void>;
  updateQuantity: (key: string, quantity: number) => Promise<void>;
  removeFromCart: (key: string) => Promise<void>;
  removeBundleGroup: (groupKeys: string[]) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
  applyCoupon: (code: string) => Promise<boolean>;
  removeCoupon: (code: string) => Promise<void>;
  updateShippingMethod: (methodId: string) => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

/**
 * Transform WooCommerce cart response to Cart interface
 */
function transformCartData(data: any): Cart | null {
  if (!data?.cart) return null;

  const contents = data.cart.contents?.nodes || [];

  return {
    items: contents.map((item: any) => ({
      key: item.key,
      quantity: item.quantity,
      total: item.total,
      bbBundleId: item.bbBundleId ?? undefined,
      bbGroupKey: item.bbGroupKey ?? undefined,
      bbLocked: item.bbLocked ?? undefined,
      bbUnitPrice: item.bbUnitPrice ?? undefined,
      product: {
        databaseId: item.product?.node?.databaseId,
        name: item.product?.node?.name,
        slug: item.product?.node?.slug,
        price: item.product?.node?.price,
        image: item.product?.node?.image,
        productTypes: item.product?.node?.mfproductTypes?.nodes || [],
      },
      variation: item.variation?.node
        ? {
            databaseId: item.variation.node.databaseId,
            name: item.variation.node.name,
            price: item.variation.node.price,
          }
        : undefined,
    })),
    subtotal: data.cart.subtotal || '$0.00',
    total: data.cart.total || '$0.00',
    discountTotal: data.cart.discountTotal || '$0.00',
    shippingTotal: data.cart.shippingTotal || '$0.00',
    isEmpty: data.cart.isEmpty ?? true,
    itemsCount: data.cart.contents?.itemCount || 0,
    appliedCoupons: data.cart.appliedCoupons || [],
    availableShippingMethods: data.cart.availableShippingMethods || [],
    chosenShippingMethods: data.cart.chosenShippingMethods || [],
  };
}

function enrichCartItems(
  cart: Cart,
  map: Record<string, { groupKey: string; bundleId: number }>
): Cart {
  const items = cart.items.map((item) => {
    if (item.bbGroupKey || !map[item.key]) return item;
    const { groupKey, bundleId } = map[item.key];
    return { ...item, bbGroupKey: groupKey, bbBundleId: bundleId };
  });
  return { ...cart, items };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Always-current ref for optimistic rollback
  const cartRef = useRef<Cart | null>(null);
  cartRef.current = cart;
  // Cart mutations round-trip through WooCommerce, so two overlapping calls
  // (e.g. clicking "+" twice, or picking a free gift while a quantity change
  // is still in flight) can resolve out of order. WooCommerce serializes
  // writes to the same PHP session, so the LAST request fired always reflects
  // every earlier one by the time it resolves — but the network responses can
  // still arrive out of order. Bump this on every mutation and only apply a
  // response's cart snapshot if no newer mutation has started since,
  // otherwise a late, stale response can overwrite a newer state and make
  // the cart appear to lose items.
  const requestSeqRef = useRef(0);
  const nextSeq = () => ++requestSeqRef.current;
  const isStaleSeq = (seq: number) => seq !== requestSeqRef.current;
  // bundleNames and bundleDiscounts use localStorage so they survive tab closes and new sessions.
  // bundleItemMap stays in sessionStorage because it maps ephemeral cart item keys.
  const [bundleNames, setBundleNames] = useState<Record<number, string>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('bundleNames') || '{}'); } catch { return {}; }
  });
  const [bundleDiscounts, setBundleDiscounts] = useState<Record<number, number>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('bundleDiscounts') || '{}'); } catch { return {}; }
  });
  const [bundleItemMap, setBundleItemMap] = useState<Record<string, { groupKey: string; bundleId: number }>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(sessionStorage.getItem('bundleItemMap') || '{}'); } catch { return {}; }
  });
  // Always-current ref so callbacks don't go stale
  const bundleItemMapRef = useRef(bundleItemMap);
  bundleItemMapRef.current = bundleItemMap;
  const { isAuthenticated, isReady } = useAuth();
  const prevAuthState = useRef<boolean | null>(null);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setIsDrawerOpen((prev) => !prev), []);

  /**
   * Get the appropriate Apollo client based on auth state
   * Uses authenticated client for logged-in users to ensure cart persistence
   */
  const getClient = useCallback(() => {
    if (isAuthenticated) {
      try {
        return getApolloAuthClient();
      } catch {
        // Fall back to browser client if auth client not available
        return getBrowserClient();
      }
    }
    return getBrowserClient();
  }, [isAuthenticated]);

  /**
   * Fetch cart from WooCommerce
   */
  const fetchCart = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const seq = nextSeq();

    try {
      const client = getClient();
      const { data } = await client.query({
        query: GET_CART_LITE,
        fetchPolicy: 'network-only',
      });

      if (isStaleSeq(seq)) return;
      const transformedCart = transformCartData(data);
      if (transformedCart) setCart(enrichCartItems(transformedCart, bundleItemMapRef.current));
    } catch (err) {
      logError('CartContext.fetchCart', err);
      const cartError = new CartError('Failed to load cart', ErrorCode.CART_LOAD_FAILED);
      setError(getUserMessage(cartError));
    } finally {
      setIsLoading(false);
    }
  }, [getClient]);

  /**
   * Refresh cart from WooCommerce
   */
  const refreshCart = useCallback(async () => {
    await fetchCart();
  }, [fetchCart]);

  // Initial cart load
  useEffect(() => {
    if (!isReady) return;
    fetchCart();
  }, [isReady, fetchCart]);

  // Handle auth state changes - reload cart for new user
  useEffect(() => {
    if (!isReady) return;

    // Skip on initial load
    if (prevAuthState.current === null) {
      prevAuthState.current = isAuthenticated;
      return;
    }

    // Auth state changed
    if (prevAuthState.current !== isAuthenticated) {
      prevAuthState.current = isAuthenticated;

      // Reset Apollo client cache
      resetBrowserClient();

      // Reload cart for new user
      fetchCart();
    }
  }, [isAuthenticated, isReady, fetchCart]);

  /**
   * Add item to cart
   */
  const addToCart = useCallback(async (input: AddToCartInput) => {
    setError(null);
    const seq = nextSeq();
    const snapshot = cartRef.current;

    // Optimistic update — if this product/variation is already in the cart,
    // bump its quantity immediately; we don't yet know the server-assigned
    // key for a genuinely new line item, so that case just waits for the
    // response (still guarded below so it can't be clobbered by a stale one).
    setCart((prev) => {
      if (!prev) return prev;
      const existing = prev.items.find(
        (i) =>
          i.product.databaseId === input.productId &&
          (input.variationId ? i.variation?.databaseId === input.variationId : !i.variation)
      );
      if (!existing) return prev;
      const unitPrice = existing.quantity > 0 ? parseMoney(existing.total) / existing.quantity : 0;
      const newQuantity = existing.quantity + input.quantity;
      const newTotal = unitPrice * newQuantity;
      const delta = newTotal - parseMoney(existing.total);
      return enrichCartItems(
        {
          ...prev,
          items: prev.items.map((i) =>
            i.key === existing.key ? { ...i, quantity: newQuantity, total: formatMoney(newTotal) } : i
          ),
          subtotal: formatMoney(parseMoney(prev.subtotal) + delta),
          total: formatMoney(parseMoney(prev.total) + delta),
        },
        bundleItemMapRef.current
      );
    });
    setIsDrawerOpen(true);
    setIsMutating(true);
    try {
      const client = getClient();
      const { data } = await client.mutate({
        mutation: ADD_TO_CART_LITE,
        variables: {
          productId: input.productId,
          quantity: input.quantity,
          variationId: input.variationId,
        },
      });

      if (isStaleSeq(seq)) return;
      const transformedCart = transformCartData({ cart: data.addToCart.cart });
      if (transformedCart) {
        setCart(enrichCartItems(transformedCart, bundleItemMapRef.current));
      }
    } catch (err) {
      if (!isStaleSeq(seq)) setCart(snapshot); // rollback
      logError('CartContext.addToCart', err, { productId: input.productId });
      const message = extractCartErrorMessage(
        err,
        getUserMessage(new CartError('Failed to add item to cart', ErrorCode.CART_ADD_FAILED))
      );
      setError(message);
      throw new CartError(message, ErrorCode.CART_ADD_FAILED);
    } finally {
      setIsMutating(false);
    }
  }, [getClient]);

  const addBundleToCart = useCallback(
    async (bundleId: number, productIds: number[], bundleName: string, discountPercent = 0) => {
      setError(null);
      const seq = nextSeq();
      setIsMutating(true);
      try {
        const client = getClient();
        const { data } = await client.mutate({
          mutation: ADD_BUNDLE_TO_CART,
          variables: { bundleId, productIds },
        });
        if (!data?.addBundleToCart?.success) {
          throw new Error(data?.addBundleToCart?.message || 'Bundle add failed');
        }
        // Persist the bundle name and discount so cart UI can label and price the group
        setBundleNames((prev) => {
          const next = { ...prev, [bundleId]: bundleName };
          try { localStorage.setItem('bundleNames', JSON.stringify(next)); } catch {}
          return next;
        });
        if (discountPercent > 0) {
          setBundleDiscounts((prev) => {
            const next = { ...prev, [bundleId]: discountPercent };
            try { localStorage.setItem('bundleDiscounts', JSON.stringify(next)); } catch {}
            return next;
          });
        }
        // Build fallback map: itemKey → { groupKey, bundleId } for when plugin doesn't set bbGroupKey
        const { groupKey, addedItemKeys } = data.addBundleToCart;
        if (groupKey && Array.isArray(addedItemKeys) && addedItemKeys.length > 0) {
          const additions: Record<string, { groupKey: string; bundleId: number }> = {};
          for (const itemKey of addedItemKeys) {
            additions[itemKey] = { groupKey, bundleId };
          }
          const nextMap = { ...bundleItemMapRef.current, ...additions };
          bundleItemMapRef.current = nextMap;
          setBundleItemMap(nextMap);
          try { sessionStorage.setItem('bundleItemMap', JSON.stringify(nextMap)); } catch {}
        }
        // Refetch cart since the payload doesn't return cart data
        const { data: cartData } = await client.query({
          query: GET_CART_LITE,
          fetchPolicy: 'network-only',
        });
        if (isStaleSeq(seq)) return;
        const transformedCart = transformCartData(cartData);
        if (transformedCart) {
          setCart(enrichCartItems(transformedCart, bundleItemMapRef.current));
          setIsDrawerOpen(true);
        }
      } catch (err) {
        logError('CartContext.addBundleToCart', err, { bundleId });
        // Preserve the original plugin message (e.g. "Please add at least 4 items") when available.
        const pluginMessage = err instanceof Error ? err.message : null;
        const cartError = new CartError(
          pluginMessage || 'Failed to add bundle to cart',
          ErrorCode.CART_ADD_FAILED
        );
        setError(pluginMessage || getUserMessage(cartError));
        throw cartError;
      } finally {
        setIsMutating(false);
      }
    },
    [getClient]
  );

  const removeBundleGroup = useCallback(
    async (groupKeys: string[]) => {
      setError(null);
      const seq = nextSeq();
      setIsMutating(true);
      try {
        const client = getClient();
        for (const groupKey of groupKeys) {
          await client.mutate({
            mutation: REMOVE_BUNDLE_FROM_CART,
            variables: { groupKey },
          });
        }
        const { data: cartData } = await client.query({
          query: GET_CART_LITE,
          fetchPolicy: 'network-only',
        });
        if (isStaleSeq(seq)) return;
        const transformedCart = transformCartData(cartData);
        if (transformedCart) setCart(enrichCartItems(transformedCart, bundleItemMapRef.current));
      } catch (err) {
        logError('CartContext.removeBundleGroup', err);
        const cartError = new CartError('Failed to remove bundle', ErrorCode.CART_REMOVE_FAILED);
        setError(getUserMessage(cartError));
        throw cartError;
      } finally {
        setIsMutating(false);
      }
    },
    [getClient]
  );

  /**
   * Update item quantity
   */
  const updateQuantity = useCallback(async (key: string, quantity: number) => {
    setError(null);
    const seq = nextSeq();
    const snapshot = cartRef.current;

    // Optimistic update — apply change immediately before server responds.
    // Derive a unit price from the item's own total/quantity so the line
    // price and cart subtotal/total move instantly too, not just the digit.
    setCart((prev) => {
      if (!prev) return prev;
      const item = prev.items.find((i) => i.key === key);
      if (!item) return prev;
      const unitPrice = item.quantity > 0 ? parseMoney(item.total) / item.quantity : 0;

      if (quantity <= 0) {
        const delta = -parseMoney(item.total);
        return enrichCartItems(
          {
            ...prev,
            items: prev.items.filter((i) => i.key !== key),
            subtotal: formatMoney(parseMoney(prev.subtotal) + delta),
            total: formatMoney(parseMoney(prev.total) + delta),
          },
          bundleItemMapRef.current
        );
      }

      const newTotal = unitPrice * quantity;
      const delta = newTotal - parseMoney(item.total);
      return enrichCartItems(
        {
          ...prev,
          items: prev.items.map((i) =>
            i.key === key ? { ...i, quantity, total: formatMoney(newTotal) } : i
          ),
          subtotal: formatMoney(parseMoney(prev.subtotal) + delta),
          total: formatMoney(parseMoney(prev.total) + delta),
        },
        bundleItemMapRef.current
      );
    });

    setIsMutating(true);
    try {
      const client = getClient();

      if (quantity <= 0) {
        const { data } = await client.mutate({
          mutation: REMOVE_FROM_CART_LITE,
          variables: { keys: [key] },
        });
        if (isStaleSeq(seq)) return;
        const transformedCart = transformCartData({ cart: data.removeItemsFromCart.cart });
        if (transformedCart) setCart(enrichCartItems(transformedCart, bundleItemMapRef.current));
        return;
      }

      const { data } = await client.mutate({
        mutation: UPDATE_CART_ITEM_QUANTITY_LITE,
        variables: { key, quantity },
      });
      if (isStaleSeq(seq)) return;
      const transformedCart = transformCartData({ cart: data.updateItemQuantities.cart });
      if (transformedCart) setCart(enrichCartItems(transformedCart, bundleItemMapRef.current));
    } catch (err) {
      if (!isStaleSeq(seq)) setCart(snapshot); // rollback
      logError('CartContext.updateQuantity', err, { key, quantity });
      const message = extractCartErrorMessage(
        err,
        getUserMessage(new CartError('Failed to update cart', ErrorCode.CART_UPDATE_FAILED))
      );
      setError(message);
      throw new CartError(message, ErrorCode.CART_UPDATE_FAILED);
    } finally {
      setIsMutating(false);
    }
  }, [getClient]);

  /**
   * Remove item from cart
   */
  const removeFromCart = useCallback(async (key: string) => {
    setError(null);
    const seq = nextSeq();
    const snapshot = cartRef.current;

    // Optimistic update — remove immediately, we already have the full item
    // locally, and adjust subtotal/total by its price so those move too.
    setCart((prev) => {
      if (!prev) return prev;
      const item = prev.items.find((i) => i.key === key);
      const delta = item ? -parseMoney(item.total) : 0;
      return enrichCartItems(
        {
          ...prev,
          items: prev.items.filter((i) => i.key !== key),
          subtotal: formatMoney(parseMoney(prev.subtotal) + delta),
          total: formatMoney(parseMoney(prev.total) + delta),
        },
        bundleItemMapRef.current
      );
    });

    setIsMutating(true);
    try {
      const client = getClient();
      const { data } = await client.mutate({
        mutation: REMOVE_FROM_CART_LITE,
        variables: { keys: [key] },
      });
      if (isStaleSeq(seq)) return;
      const transformedCart = transformCartData({ cart: data.removeItemsFromCart.cart });
      if (transformedCart) setCart(enrichCartItems(transformedCart, bundleItemMapRef.current));
    } catch (err) {
      if (!isStaleSeq(seq)) setCart(snapshot); // rollback
      logError('CartContext.removeFromCart', err, { key });
      const message = extractCartErrorMessage(
        err,
        getUserMessage(new CartError('Failed to remove item', ErrorCode.CART_REMOVE_FAILED))
      );
      setError(message);
      throw new CartError(message, ErrorCode.CART_REMOVE_FAILED);
    } finally {
      setIsMutating(false);
    }
  }, [getClient]);

  /**
   * Clear cart
   */
  const clearCart = useCallback(async () => {
    setError(null);
    const seq = nextSeq();
    setIsMutating(true);
    try {
      const client = getClient();
      const { data } = await client.mutate({
        mutation: CLEAR_CART_LITE,
      });

      if (isStaleSeq(seq)) return;
      const transformedCart = transformCartData({ cart: data.emptyCart.cart });
      if (transformedCart) {
        setCart(enrichCartItems(transformedCart, bundleItemMapRef.current));
      }
    } catch (err) {
      logError('CartContext.clearCart', err);
      // Reset cart state to empty regardless
      setCart({
        items: [],
        subtotal: '$0.00',
        total: '$0.00',
        discountTotal: '$0.00',
        shippingTotal: '$0.00',
        isEmpty: true,
        itemsCount: 0,
        appliedCoupons: [],
        availableShippingMethods: [],
        chosenShippingMethods: [],
      });
    } finally {
      setIsMutating(false);
    }
  }, [getClient]);

  /**
   * Apply coupon
   */
  const applyCoupon = useCallback(async (code: string): Promise<boolean> => {
    setError(null);
    const seq = nextSeq();
    setIsMutating(true);
    try {
      const client = getClient();
      const { data } = await client.mutate({
        mutation: APPLY_COUPON_LITE,
        variables: { code },
      });

      if (isStaleSeq(seq)) return true;
      const transformedCart = transformCartData({ cart: data.applyCoupon.cart });
      if (transformedCart) {
        setCart(enrichCartItems(transformedCart, bundleItemMapRef.current));
      }

      return true;
    } catch (err) {
      logError('CartContext.applyCoupon', err, { code });
      const gqlMessage = (err as { graphQLErrors?: Array<{ message?: string }> })?.graphQLErrors?.[0]
        ?.message;
      const rawMessage =
        gqlMessage ||
        (err instanceof Error ? err.message : null) ||
        getUserMessage(new CartError('Invalid coupon code', ErrorCode.CART_UPDATE_FAILED));
      const message = decodeHtmlEntities(rawMessage);
      setError(message);
      return false;
    } finally {
      setIsMutating(false);
    }
  }, [getClient]);

  /**
   * Remove coupon
   */
  const removeCoupon = useCallback(async (code: string) => {
    setError(null);
    const seq = nextSeq();
    setIsMutating(true);
    try {
      const client = getClient();
      const { data } = await client.mutate({
        mutation: REMOVE_COUPON_LITE,
        variables: { code },
      });

      if (isStaleSeq(seq)) return;
      const transformedCart = transformCartData({ cart: data.removeCoupons.cart });
      if (transformedCart) {
        setCart(enrichCartItems(transformedCart, bundleItemMapRef.current));
      }
    } catch (err) {
      logError('CartContext.removeCoupon', err, { code });
      const cartError = new CartError('Failed to remove coupon', ErrorCode.CART_UPDATE_FAILED);
      setError(getUserMessage(cartError));
      throw cartError;
    } finally {
      setIsMutating(false);
    }
  }, [getClient]);

  /**
   * Update shipping method
   */
  const updateShippingMethod = useCallback(async (methodId: string) => {
    setError(null);
    const seq = nextSeq();
    setIsMutating(true);
    try {
      const client = getClient();
      const { data } = await client.mutate({
        mutation: UPDATE_SHIPPING_METHOD,
        variables: { shippingMethods: [methodId] },
      });

      if (isStaleSeq(seq)) return;
      const transformedCart = transformCartData({ cart: data.updateShippingMethod.cart });
      if (transformedCart) {
        setCart(enrichCartItems(transformedCart, bundleItemMapRef.current));
      }
    } catch (err) {
      logError('CartContext.updateShippingMethod', err, { methodId });
      const cartError = new CartError('Failed to update shipping', ErrorCode.CART_UPDATE_FAILED);
      setError(getUserMessage(cartError));
      throw cartError;
    } finally {
      setIsMutating(false);
    }
  }, [getClient]);

  return (
    <CartContext.Provider
      value={{
        cart,
        isLoading,
        isMutating,
        error,
        isDrawerOpen,
        bundleNames,
        bundleDiscounts,
        openDrawer,
        closeDrawer,
        toggleDrawer,
        addToCart,
        addBundleToCart,
        updateQuantity,
        removeFromCart,
        removeBundleGroup,
        clearCart,
        refreshCart,
        applyCoupon,
        removeCoupon,
        updateShippingMethod,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
