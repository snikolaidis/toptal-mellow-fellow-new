import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { useAuth } from '@/context/AuthContext';
import { getBrowserClient, resetBrowserClient } from '@/lib/apollo-client';
import {
  ADD_BUNDLE_TO_CART,
  REMOVE_BUNDLE_FROM_CART,
} from '@/graphql/queries/cart';
import { ShippingPackage, AppliedCoupon } from '@/types/checkout';
import {
  CartError,
  ErrorCode,
  getUserMessage,
  logError,
} from '@/lib/errors';
import {
  fetchCartFromStore,
  addItemToStore,
  updateItemInStore,
  removeItemFromStore,
  clearStoreCart,
  applyCouponToStore,
  removeCouponFromStore,
  selectShippingRate,
  StoreApiError,
} from '@/lib/store-api';
import {
  buildRecsCacheKey,
  isRecsFresh,
  setRecsCache,
  fetchRecommendations,
} from '@/lib/recsCache';
import type { Cart as StoreCart, CartItem as StoreCartItem } from '@/lib/store-api';

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

function extractCartErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof StoreApiError) {
    return decodeHtmlEntities(err.message);
  }
  const gqlMessage = (err as { graphQLErrors?: Array<{ message?: string }> })?.graphQLErrors?.[0]
    ?.message;
  const raw = gqlMessage || (err instanceof Error ? err.message : null) || fallback;
  return decodeHtmlEntities(raw);
}

function parseMoney(value: string | undefined): number {
  return parseFloat((value || '').replace(/[^0-9.-]/g, '')) || 0;
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

// Re-export the types from store-api so components importing from CartContext still work
type CartItem = StoreCartItem;
type Cart = StoreCart;

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
  cartReady: boolean;
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

const CART_CACHE_KEY = 'mf_cart_cache';

function readCachedCart(): Cart | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CART_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items)) return parsed as Cart;
  } catch {}
  return null;
}

function writeCachedCart(cart: Cart | null) {
  try {
    if (cart && cart.items.length > 0) localStorage.setItem(CART_CACHE_KEY, JSON.stringify(cart));
    else localStorage.removeItem(CART_CACHE_KEY);
  } catch {}
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(readCachedCart);
  const [isLoading, setIsLoading] = useState(false);
  const [cartReady, setCartReady] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const cartRef = useRef<Cart | null>(null);
  cartRef.current = cart;

  const requestSeqRef = useRef(0);
  const nextSeq = () => ++requestSeqRef.current;
  const isStaleSeq = (seq: number) => seq !== requestSeqRef.current;

  // Mutation queue — serializes Store API calls so concurrent requests don't
  // cause lost-update races (request B loading stale state before A saves).
  const mutationQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const enqueueMutation = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const queued = mutationQueueRef.current.then(fn, fn);
    mutationQueueRef.current = queued.catch(() => {});
    return queued;
  }, []);

  const mutatingCountRef = useRef(0);
  const startMutation = useCallback(() => {
    mutatingCountRef.current++;
    setIsMutating(true);
  }, []);
  const endMutation = useCallback(() => {
    mutatingCountRef.current = Math.max(0, mutatingCountRef.current - 1);
    if (mutatingCountRef.current === 0) setIsMutating(false);
  }, []);

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
  const bundleItemMapRef = useRef(bundleItemMap);
  bundleItemMapRef.current = bundleItemMap;

  const { isAuthenticated, isReady } = useAuth();
  const prevAuthState = useRef<boolean | null>(null);
  const hasFetchedRef = useRef(false);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setIsDrawerOpen((prev) => !prev), []);

  // GraphQL client — only used for bundle operations. Always the same-origin
  // browser client, even when logged in: every other cart operation already
  // runs through the Store API's anonymous Cart-Token session regardless of
  // auth state (see fetchCartFromStore/addItemToStore/etc. below), so bundle
  // add/remove has to land in that same session to be visible afterward.
  // The authenticated Apollo client hits WordPress directly cross-origin with
  // a Bearer JWT, bypassing the Store API bridge entirely and resolving to a
  // *different* WC session (keyed by the logged-in user's ID) — a leftover
  // from before cart ops moved to the Store API, when the whole cart lived in
  // GraphQL and needed that per-user session for persistence.
  const getClient = useCallback(() => getBrowserClient(), []);

  function isSessionExpired(err: unknown): boolean {
    return err instanceof StoreApiError && err.code === 'session_expired';
  }

  function resetToEmptyCart() {
    const empty: StoreCart = {
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
    };
    setCart(empty);
    writeCachedCart(null);
    try { localStorage.removeItem(CART_CACHE_KEY); } catch {}
    setError('Your cart session has expired. Please add your items again.');
  }

  // -------------------------------------------------------------------------
  // Fetch cart via WooCommerce Store API (no spinlock)
  // -------------------------------------------------------------------------
  const fetchCart = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const seq = nextSeq();

    try {
      const storeCart = await fetchCartFromStore();
      if (isStaleSeq(seq)) return;
      hasFetchedRef.current = true;
      if (storeCart) {
        const enriched = enrichCartItems(storeCart, bundleItemMapRef.current);
        setCart(enriched);
        writeCachedCart(enriched);
      }
      setCartReady(true);
    } catch (err) {
      if (isSessionExpired(err)) { resetToEmptyCart(); setCartReady(true); return; }
      logError('CartContext.fetchCart', err);
      const cartError = new CartError('Failed to load cart', ErrorCode.CART_LOAD_FAILED);
      setError(getUserMessage(cartError));
      setCartReady(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshCart = useCallback(async () => {
    await fetchCart();
  }, [fetchCart]);

  // Fetch cart on page load so the counter and cart page are accurate on reload.
  // Safe now that all cart ops use the Store API (database sessions, no PHP file-lock contention).
  useEffect(() => {
    if (!isReady || hasFetchedRef.current) return;

    if (isAuthenticated) {
      fetch('/api/cart/restore-for-user', {
        method: 'POST',
        credentials: 'include',
      })
        .catch(() => {})
        .finally(() => {
          fetchCart();
        });
    } else {
      fetchCart();
    }
  }, [isReady, isAuthenticated, fetchCart]);

  // Handle auth state changes — clear cached cart so the fresh fetch from the
  // new session (guest or authenticated) isn't masked by stale localStorage data.
  useEffect(() => {
    if (!isReady) return;
    if (prevAuthState.current === null) {
      prevAuthState.current = isAuthenticated;
      return;
    }
    if (prevAuthState.current !== isAuthenticated) {
      prevAuthState.current = isAuthenticated;
      resetBrowserClient();
      writeCachedCart(null);
      hasFetchedRef.current = true;
      fetchCart();
    }
  }, [isAuthenticated, isReady, fetchCart]);

  // -------------------------------------------------------------------------
  // Add item via Store API — full optimistic UI including NEW items
  // -------------------------------------------------------------------------
  const addToCart = useCallback(async (input: AddToCartInput) => {
    setError(null);
    const seq = nextSeq();
    const snapshot = cartRef.current;

    // Optimistic update — works for both existing and new items
    setCart((prev) => {
      if (!prev) {
        // Cart hasn't loaded yet — create a placeholder cart with the new item
        return {
          items: [{
            key: `optimistic-${input.productId}-${input.variationId || 0}`,
            quantity: input.quantity,
            total: '$0.00',
            product: {
              databaseId: input.productId,
              name: 'Adding...',
              slug: '',
              price: '$0.00',
            },
            variation: input.variationId
              ? { databaseId: input.variationId, name: '', price: '$0.00' }
              : undefined,
          }],
          subtotal: '$0.00',
          total: '$0.00',
          discountTotal: '$0.00',
          shippingTotal: '$0.00',
          isEmpty: false,
          itemsCount: input.quantity,
          appliedCoupons: [],
          availableShippingMethods: [],
          chosenShippingMethods: [],
        };
      }

      const existing = prev.items.find(
        (i) =>
          i.product.databaseId === input.productId &&
          (input.variationId ? i.variation?.databaseId === input.variationId : !i.variation)
      );

      if (existing) {
        const newQuantity = existing.quantity + input.quantity;
        return enrichCartItems(
          {
            ...prev,
            items: prev.items.map((i) =>
              i.key === existing.key ? { ...i, quantity: newQuantity } : i
            ),
            itemsCount: prev.itemsCount + input.quantity,
            isEmpty: false,
          },
          bundleItemMapRef.current
        );
      }

      // New item — add a placeholder that will be replaced by the server response
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            key: `optimistic-${input.productId}-${input.variationId || 0}`,
            quantity: input.quantity,
            total: '$0.00',
            product: {
              databaseId: input.productId,
              name: 'Adding...',
              slug: '',
              price: '$0.00',
            },
            variation: input.variationId
              ? { databaseId: input.variationId, name: '', price: '$0.00' }
              : undefined,
          },
        ],
        itemsCount: prev.itemsCount + input.quantity,
        isEmpty: false,
      };
    });

    hasFetchedRef.current = true;
    setIsDrawerOpen(true);
    startMutation();

    try {
      const storeCart = await enqueueMutation(() => addItemToStore(input.productId, input.quantity, input.variationId));
      if (isStaleSeq(seq)) return;
      if (storeCart) setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
    } catch (err) {
      if (isSessionExpired(err)) { resetToEmptyCart(); return; }
      if (!isStaleSeq(seq)) setCart(snapshot);
      logError('CartContext.addToCart', err, { productId: input.productId });
      const message = extractCartErrorMessage(
        err,
        getUserMessage(new CartError('Failed to add item to cart', ErrorCode.CART_ADD_FAILED))
      );
      setError(message);
      throw new CartError(message, ErrorCode.CART_ADD_FAILED);
    } finally {
      endMutation();
    }
  }, [enqueueMutation, startMutation, endMutation]);

  // -------------------------------------------------------------------------
  // Bundle operations — still use GraphQL (custom mutations), then Store API fetch
  // -------------------------------------------------------------------------
  const addBundleToCart = useCallback(
    async (bundleId: number, productIds: number[], bundleName: string, discountPercent = 0) => {
      setError(null);
      const seq = nextSeq();
      hasFetchedRef.current = true;
      startMutation();
      try {
        const client = getClient();
        const { data } = await client.mutate({
          mutation: ADD_BUNDLE_TO_CART,
          variables: { bundleId, productIds },
        });
        if (!data?.addBundleToCart?.success) {
          throw new Error(data?.addBundleToCart?.message || 'Bundle add failed');
        }

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

        // Fetch updated cart via Store API instead of GraphQL
        const storeCart = await enqueueMutation(() => fetchCartFromStore());
        if (isStaleSeq(seq)) return;
        if (storeCart) {
          setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
          setIsDrawerOpen(true);
        }
      } catch (err) {
        logError('CartContext.addBundleToCart', err, { bundleId });
        const pluginMessage = err instanceof Error ? err.message : null;
        const cartError = new CartError(
          pluginMessage || 'Failed to add bundle to cart',
          ErrorCode.CART_ADD_FAILED
        );
        setError(pluginMessage || getUserMessage(cartError));
        throw cartError;
      } finally {
        endMutation();
      }
    },
    [getClient, enqueueMutation, startMutation, endMutation]
  );

  const removeBundleGroup = useCallback(
    async (groupKeys: string[]) => {
      setError(null);
      const seq = nextSeq();
      startMutation();
      try {
        const client = getClient();
        for (const groupKey of groupKeys) {
          await client.mutate({
            mutation: REMOVE_BUNDLE_FROM_CART,
            variables: { groupKey },
          });
        }
        // Fetch updated cart via Store API
        const storeCart = await enqueueMutation(() => fetchCartFromStore());
        if (isStaleSeq(seq)) return;
        if (storeCart) setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
      } catch (err) {
        logError('CartContext.removeBundleGroup', err);
        const cartError = new CartError('Failed to remove bundle', ErrorCode.CART_REMOVE_FAILED);
        setError(getUserMessage(cartError));
        throw cartError;
      } finally {
        endMutation();
      }
    },
    [getClient, enqueueMutation, startMutation, endMutation]
  );

  // -------------------------------------------------------------------------
  // Update quantity via Store API — optimistic
  // -------------------------------------------------------------------------
  const updateQuantity = useCallback(async (key: string, quantity: number) => {
    setError(null);
    const seq = nextSeq();
    const snapshot = cartRef.current;

    setCart((prev) => {
      if (!prev) return prev;
      const item = prev.items.find((i) => i.key === key);
      if (!item) return prev;

      if (quantity <= 0) {
        const itemSub = parseMoney(item.subtotal || item.total);
        return enrichCartItems(
          {
            ...prev,
            items: prev.items.filter((i) => i.key !== key),
            itemsCount: prev.itemsCount - item.quantity,
            isEmpty: prev.items.length <= 1,
            subtotal: formatMoney(Math.max(0, parseMoney(prev.subtotal) - itemSub)),
          },
          bundleItemMapRef.current
        );
      }

      const unitPrice = item.quantity > 0 ? parseMoney(item.subtotal || item.total) / item.quantity : 0;
      const delta = quantity - item.quantity;
      return enrichCartItems(
        {
          ...prev,
          items: prev.items.map((i) =>
            i.key === key ? { ...i, quantity } : i
          ),
          itemsCount: prev.itemsCount + delta,
          subtotal: formatMoney(Math.max(0, parseMoney(prev.subtotal) + unitPrice * delta)),
        },
        bundleItemMapRef.current
      );
    });

    startMutation();
    try {
      let storeCart: Cart | null;
      if (quantity <= 0) {
        storeCart = await enqueueMutation(() => removeItemFromStore(key));
      } else {
        storeCart = await enqueueMutation(() => updateItemInStore(key, quantity));
      }
      if (isStaleSeq(seq)) return;
      if (storeCart) setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
    } catch (err) {
      if (isSessionExpired(err)) { resetToEmptyCart(); return; }
      if (!isStaleSeq(seq)) setCart(snapshot);
      logError('CartContext.updateQuantity', err, { key, quantity });
      const message = extractCartErrorMessage(
        err,
        getUserMessage(new CartError('Failed to update cart', ErrorCode.CART_UPDATE_FAILED))
      );
      setError(message);
      throw new CartError(message, ErrorCode.CART_UPDATE_FAILED);
    } finally {
      endMutation();
    }
  }, [enqueueMutation, startMutation, endMutation]);

  // -------------------------------------------------------------------------
  // Remove item via Store API — optimistic
  // -------------------------------------------------------------------------
  const removeFromCart = useCallback(async (key: string) => {
    setError(null);
    const seq = nextSeq();
    const snapshot = cartRef.current;

    setCart((prev) => {
      if (!prev) return prev;
      const item = prev.items.find((i) => i.key === key);
      const removedQty = item ? item.quantity : 0;
      const itemSub = item ? parseMoney(item.subtotal || item.total) : 0;
      return enrichCartItems(
        {
          ...prev,
          items: prev.items.filter((i) => i.key !== key),
          itemsCount: prev.itemsCount - removedQty,
          isEmpty: prev.items.length <= 1,
          subtotal: formatMoney(Math.max(0, parseMoney(prev.subtotal) - itemSub)),
        },
        bundleItemMapRef.current
      );
    });

    startMutation();
    try {
      const storeCart = await enqueueMutation(() => removeItemFromStore(key));
      if (isStaleSeq(seq)) {
        enqueueMutation(() => fetchCartFromStore()).then((fresh) => {
          if (fresh) setCart(enrichCartItems(fresh, bundleItemMapRef.current));
        }).catch(() => {});
        return;
      }
      if (storeCart) setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
    } catch (err) {
      if (isSessionExpired(err)) { resetToEmptyCart(); return; }
      if (!isStaleSeq(seq)) setCart(snapshot);
      logError('CartContext.removeFromCart', err, { key });
      const message = extractCartErrorMessage(
        err,
        getUserMessage(new CartError('Failed to remove item', ErrorCode.CART_REMOVE_FAILED))
      );
      setError(message);
      throw new CartError(message, ErrorCode.CART_REMOVE_FAILED);
    } finally {
      endMutation();
    }
  }, [enqueueMutation, startMutation, endMutation]);

  // -------------------------------------------------------------------------
  // Clear cart via Store API
  // -------------------------------------------------------------------------
  const clearCart = useCallback(async () => {
    setError(null);
    const seq = nextSeq();
    startMutation();
    writeCachedCart(null);
    try {
      const storeCart = await enqueueMutation(() => clearStoreCart());
      if (isStaleSeq(seq)) return;
      if (storeCart) {
        setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
      }
    } catch (err) {
      logError('CartContext.clearCart', err);
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
      endMutation();
    }
  }, [enqueueMutation, startMutation, endMutation]);

  // -------------------------------------------------------------------------
  // Coupons via Store API
  // -------------------------------------------------------------------------
  const applyCoupon = useCallback(async (code: string): Promise<boolean> => {
    setError(null);
    const seq = nextSeq();
    startMutation();
    try {
      const storeCart = await enqueueMutation(() => applyCouponToStore(code));
      if (isStaleSeq(seq)) return true;
      if (storeCart) setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
      return true;
    } catch (err) {
      if (isSessionExpired(err)) {
        try {
          const freshCart = await fetchCartFromStore();
          if (!isStaleSeq(seq) && freshCart && freshCart.items.length > 0) {
            setCart(enrichCartItems(freshCart, bundleItemMapRef.current));
            setError('Could not apply coupon. Please try again.');
            return false;
          }
        } catch {}
        resetToEmptyCart();
        return false;
      }
      logError('CartContext.applyCoupon', err, { code });
      const message = extractCartErrorMessage(
        err,
        getUserMessage(new CartError('Invalid coupon code', ErrorCode.CART_UPDATE_FAILED))
      );
      setError(message);
      return false;
    } finally {
      endMutation();
    }
  }, [enqueueMutation, startMutation, endMutation]);

  const removeCoupon = useCallback(async (code: string) => {
    setError(null);
    const seq = nextSeq();
    startMutation();
    try {
      const storeCart = await enqueueMutation(() => removeCouponFromStore(code));
      if (isStaleSeq(seq)) return;
      if (storeCart) setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
    } catch (err) {
      if (isSessionExpired(err)) {
        try {
          const freshCart = await fetchCartFromStore();
          if (!isStaleSeq(seq) && freshCart && freshCart.items.length > 0) {
            setCart(enrichCartItems(freshCart, bundleItemMapRef.current));
            setError('Could not remove coupon. Please try again.');
            return;
          }
        } catch {}
        resetToEmptyCart();
        return;
      }
      if (err instanceof StoreApiError && (err.status === 409 || err.status === 400)) {
        // Coupon already removed or deleted server-side — sync local state
        try {
          const freshCart = await fetchCartFromStore();
          if (!isStaleSeq(seq) && freshCart) {
            setCart(enrichCartItems(freshCart, bundleItemMapRef.current));
          }
        } catch {}
        return;
      }
      logError('CartContext.removeCoupon', err, { code });
      const cartError = new CartError('Failed to remove coupon', ErrorCode.CART_UPDATE_FAILED);
      setError(getUserMessage(cartError));
      throw cartError;
    } finally {
      endMutation();
    }
  }, [enqueueMutation, startMutation, endMutation]);

  // -------------------------------------------------------------------------
  // Shipping via Store API
  // -------------------------------------------------------------------------
  const updateShippingMethod = useCallback(async (methodId: string) => {
    setError(null);
    const seq = nextSeq();
    startMutation();
    try {
      const storeCart = await enqueueMutation(() => selectShippingRate(0, methodId));
      if (isStaleSeq(seq)) return;
      if (storeCart) setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
    } catch (err) {
      logError('CartContext.updateShippingMethod', err, { methodId });
      const cartError = new CartError('Failed to update shipping', ErrorCode.CART_UPDATE_FAILED);
      setError(getUserMessage(cartError));
      throw cartError;
    } finally {
      endMutation();
    }
  }, [enqueueMutation, startMutation, endMutation]);

  useEffect(() => { writeCachedCart(cart); }, [cart]);

  // Prefetch recommendations in the background whenever cart composition changes.
  // This warms the cache so the CartDrawer shows recs instantly when opened.
  const cartItemIds = cart?.items.map((i) => i.product.databaseId).join(',') || '';
  const cartSubtotalStr = cart?.subtotal || '';
  useEffect(() => {
    if (!cart || cart.items.length === 0) return;
    const productIds = cart.items.map((i) => i.product.databaseId);
    const productSlugs = cart.items.map((i) => i.product.slug);
    const subtotal = parseFloat(cart.subtotal.replace(/[^0-9.]/g, '')) || 0;
    const key = buildRecsCacheKey(productIds, subtotal);
    if (isRecsFresh(key)) return;
    fetchRecommendations(productIds, productSlugs, subtotal)
      .then((products) => setRecsCache(key, products))
      .catch(() => {});
  }, [cartItemIds, cartSubtotalStr]);

  return (
    <CartContext.Provider
      value={{
        cart,
        isLoading,
        cartReady,
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
