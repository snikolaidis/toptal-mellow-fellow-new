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
import type { Cart as StoreCart, CartItem as StoreCartItem } from '@/lib/store-api';

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
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

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const cartRef = useRef<Cart | null>(null);
  cartRef.current = cart;

  const requestSeqRef = useRef(0);
  const nextSeq = () => ++requestSeqRef.current;
  const isStaleSeq = (seq: number) => seq !== requestSeqRef.current;

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

  // GraphQL client — only used for bundle operations
  const getClient = useCallback(() => {
    if (isAuthenticated) {
      try {
        return getApolloAuthClient();
      } catch {
        return getBrowserClient();
      }
    }
    return getBrowserClient();
  }, [isAuthenticated]);

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
      if (storeCart) setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
    } catch (err) {
      logError('CartContext.fetchCart', err);
      const cartError = new CartError('Failed to load cart', ErrorCode.CART_LOAD_FAILED);
      setError(getUserMessage(cartError));
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
    if (isReady && !hasFetchedRef.current) {
      fetchCart();
    }
  }, [isReady, fetchCart]);

  // Handle auth state changes
  useEffect(() => {
    if (!isReady) return;
    if (prevAuthState.current === null) {
      prevAuthState.current = isAuthenticated;
      return;
    }
    if (prevAuthState.current !== isAuthenticated) {
      prevAuthState.current = isAuthenticated;
      resetBrowserClient();
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
    setIsMutating(true);

    try {
      const storeCart = await addItemToStore(input.productId, input.quantity, input.variationId);
      if (isStaleSeq(seq)) return;
      if (storeCart) setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
    } catch (err) {
      if (!isStaleSeq(seq)) setCart(snapshot);
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
  }, []);

  // -------------------------------------------------------------------------
  // Bundle operations — still use GraphQL (custom mutations), then Store API fetch
  // -------------------------------------------------------------------------
  const addBundleToCart = useCallback(
    async (bundleId: number, productIds: number[], bundleName: string, discountPercent = 0) => {
      setError(null);
      const seq = nextSeq();
      hasFetchedRef.current = true;
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
        const storeCart = await fetchCartFromStore();
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
        // Fetch updated cart via Store API
        const storeCart = await fetchCartFromStore();
        if (isStaleSeq(seq)) return;
        if (storeCart) setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
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
      const unitPrice = item.quantity > 0 ? parseMoney(item.total) / item.quantity : 0;

      if (quantity <= 0) {
        const delta = -parseMoney(item.total);
        return enrichCartItems(
          {
            ...prev,
            items: prev.items.filter((i) => i.key !== key),
            subtotal: formatMoney(parseMoney(prev.subtotal) + delta),
            total: formatMoney(parseMoney(prev.total) + delta),
            itemsCount: prev.itemsCount - item.quantity,
            isEmpty: prev.items.length <= 1,
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
          itemsCount: prev.itemsCount + (quantity - item.quantity),
        },
        bundleItemMapRef.current
      );
    });

    setIsMutating(true);
    try {
      let storeCart: Cart | null;
      if (quantity <= 0) {
        storeCart = await removeItemFromStore(key);
      } else {
        storeCart = await updateItemInStore(key, quantity);
      }
      if (isStaleSeq(seq)) return;
      if (storeCart) setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
    } catch (err) {
      if (!isStaleSeq(seq)) setCart(snapshot);
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
  }, []);

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
      const delta = item ? -parseMoney(item.total) : 0;
      const removedQty = item ? item.quantity : 0;
      return enrichCartItems(
        {
          ...prev,
          items: prev.items.filter((i) => i.key !== key),
          subtotal: formatMoney(parseMoney(prev.subtotal) + delta),
          total: formatMoney(parseMoney(prev.total) + delta),
          itemsCount: prev.itemsCount - removedQty,
          isEmpty: prev.items.length <= 1,
        },
        bundleItemMapRef.current
      );
    });

    setIsMutating(true);
    try {
      const storeCart = await removeItemFromStore(key);
      if (isStaleSeq(seq)) return;
      if (storeCart) setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
    } catch (err) {
      if (!isStaleSeq(seq)) setCart(snapshot);
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
  }, []);

  // -------------------------------------------------------------------------
  // Clear cart via Store API
  // -------------------------------------------------------------------------
  const clearCart = useCallback(async () => {
    setError(null);
    const seq = nextSeq();
    setIsMutating(true);
    try {
      const storeCart = await clearStoreCart();
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
      setIsMutating(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Coupons via Store API
  // -------------------------------------------------------------------------
  const applyCoupon = useCallback(async (code: string): Promise<boolean> => {
    setError(null);
    const seq = nextSeq();
    setIsMutating(true);
    try {
      const storeCart = await applyCouponToStore(code);
      if (isStaleSeq(seq)) return true;
      if (storeCart) setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
      return true;
    } catch (err) {
      logError('CartContext.applyCoupon', err, { code });
      const message = extractCartErrorMessage(
        err,
        getUserMessage(new CartError('Invalid coupon code', ErrorCode.CART_UPDATE_FAILED))
      );
      setError(message);
      return false;
    } finally {
      setIsMutating(false);
    }
  }, []);

  const removeCoupon = useCallback(async (code: string) => {
    setError(null);
    const seq = nextSeq();
    setIsMutating(true);
    try {
      const storeCart = await removeCouponFromStore(code);
      if (isStaleSeq(seq)) return;
      if (storeCart) setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
    } catch (err) {
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
      setIsMutating(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Shipping via Store API
  // -------------------------------------------------------------------------
  const updateShippingMethod = useCallback(async (methodId: string) => {
    setError(null);
    const seq = nextSeq();
    setIsMutating(true);
    try {
      const storeCart = await selectShippingRate(0, methodId);
      if (isStaleSeq(seq)) return;
      if (storeCart) setCart(enrichCartItems(storeCart, bundleItemMapRef.current));
    } catch (err) {
      logError('CartContext.updateShippingMethod', err, { methodId });
      const cartError = new CartError('Failed to update shipping', ErrorCode.CART_UPDATE_FAILED);
      setError(getUserMessage(cartError));
      throw cartError;
    } finally {
      setIsMutating(false);
    }
  }, []);

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
