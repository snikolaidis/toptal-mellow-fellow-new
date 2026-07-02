import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { useCart } from '@/context/CartContext';
import BillingForm from '@/components/checkout/BillingForm';
import ShippingForm from '@/components/checkout/ShippingForm';
import OrderSummary from '@/components/checkout/OrderSummary';
import MobileOrderSummary from '@/components/checkout/MobileOrderSummary';
import RealIdVerification from '@/components/RealIdVerification';

const REALID_ENABLED = process.env.NEXT_PUBLIC_REALID_ENABLED === 'true';
const CHECKOUT_PROGRESS_KEY = 'mf-checkout-progress';
const CHECKOUT_IDEMPOTENCY_KEY = 'mf-checkout-idempotency';
import { AddressData, PaymentData, SavedCardInfo } from '@/types/checkout';
import { processPayment } from '@/lib/authorize-net';
import SavedCardSelector from '@/components/checkout/SavedCardSelector';
import { klaviyoIdentify, klaviyoTrack } from '@/lib/klaviyo';
import { useAuth, getApolloAuthClient } from '@faustwp/core';
import { useQuery } from '@apollo/client';
import { GET_CUSTOMER } from '@/graphql/queries/auth';
import { validateBillingAddress, validateShippingAddress, isValid, ValidationErrors } from '@/lib/validation';
import styles from '@/styles/pages/checkout.module.css';

const emptyAddress: AddressData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  postcode: '',
  country: 'US',
};

/**
 * Generate a unique idempotency key for checkout requests
 * Prevents duplicate charges on network retries or double-clicks
 */
function generateIdempotencyKey(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `checkout_${timestamp}_${random}`;
}

function formatFrequency(period: string, interval: number): string {
  return interval > 1 ? `every ${interval} ${period}s` : `every ${period}`;
}

type CheckoutStep = 'billing' | 'shipping' | 'payment';

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, clearCart } = useCart();
  const { isAuthenticated } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [realIdVerified, setRealIdVerified] = useState(!REALID_ENABLED);
  const [realIdCheckId, setRealIdCheckId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<CheckoutStep>('billing');
  const [customerDataLoaded, setCustomerDataLoaded] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const skipFirstSaveRef = useRef(true);
  const submittingRef = useRef(false);

  // Address state
  const [billing, setBilling] = useState<AddressData>(emptyAddress);
  const [shipping, setShipping] = useState<AddressData>(emptyAddress);
  const [sameAsBilling, setSameAsBilling] = useState(true);

  const [subSchemes, setSubSchemes] = useState<Array<{ period: string; interval: number }>>([]);
  const [subscribe, setSubscribe] = useState(false);
  const [subChoice, setSubChoice] = useState<{ period: string; interval: number } | null>(null);
  const [subUnitPrices, setSubUnitPrices] = useState<Record<string, number>>({});
  const [subExpanded, setSubExpanded] = useState(false);

  // CSRF token for secure checkout
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [csrfLoading, setCsrfLoading] = useState(true);

  // Fetch customer data for logged-in users
  const client = isAuthenticated ? getApolloAuthClient() : null;
  const { data: customerData } = useQuery(GET_CUSTOMER, {
    client: client!,
    skip: !isAuthenticated || !client,
  });

  const cartItemIdsKey = (cart?.items || [])
    .map((i) => i.product?.databaseId)
    .filter((n) => typeof n === 'number' && n > 0)
    .join(',');

  useEffect(() => {
    const ids = cartItemIdsKey
      ? cartItemIdsKey.split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    if (!ids.length) {
      setSubSchemes([]);
      setSubscribe(false);
      setSubChoice(null);
      setSubUnitPrices({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const fields = ids
          .map(
            (id, i) =>
              `p${i}: product(id: ${id}, idType: DATABASE_ID) { ` +
              `... on SimpleProduct { subscriptionSchemes { period interval price } } ` +
              `... on VariableProduct { subscriptionSchemes { period interval price } } }`
          )
          .join('\n');
        const res = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ query: `{ ${fields} }` }),
        });
        const json = await res.json();
        const data = json?.data || {};
        const priceMap: Record<string, number> = {};
        const perItem = ids.map((id, i) => {
          const keys: string[] = [];
          const schemes = data[`p${i}`]?.subscriptionSchemes;
          if (Array.isArray(schemes)) {
            schemes.forEach((x: { period?: string; interval?: number; price?: string }) => {
              const key = `${x.period}_${Number(x.interval)}`;
              if (!keys.includes(key)) keys.push(key);
              const unit = parseFloat(String(x.price ?? ''));
              if (Number.isFinite(unit)) priceMap[`${id}_${key}`] = unit;
            });
          }
          return keys;
        });
        if (!cancelled) setSubUnitPrices(priceMap);
        let intersection = perItem.length ? perItem[0] : [];
        for (let i = 1; i < perItem.length; i++) {
          intersection = intersection.filter((k) => perItem[i].includes(k));
        }
        const schemes = intersection.map((k) => {
          const [period, interval] = k.split('_');
          return { period, interval: Number(interval) };
        });
        if (!cancelled) {
          setSubSchemes(schemes);
          setSubChoice(schemes[0] || null);
          if (schemes.length === 0) {
            setSubscribe(false);
          } else {
            let stored: { period: string; interval: number } | null = null;
            let allStored = true;
            for (const id of ids) {
              let raw: string | null = null;
              try {
                raw = window.sessionStorage.getItem(`mf_sub_${id}`);
              } catch {
                raw = null;
              }
              if (!raw) {
                allStored = false;
                break;
              }
              try {
                const parsed = JSON.parse(raw);
                const choice = { period: String(parsed.period), interval: Number(parsed.interval) };
                if (!stored) {
                  stored = choice;
                } else if (stored.period !== choice.period || stored.interval !== choice.interval) {
                  allStored = false;
                  break;
                }
              } catch {
                allStored = false;
                break;
              }
            }
            const inIntersection =
              !!stored && schemes.some((s) => s.period === stored!.period && s.interval === stored!.interval);
            if (allStored && stored && inIntersection) {
              setSubscribe(true);
              setSubChoice(stored);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setSubSchemes([]);
          setSubscribe(false);
          setSubUnitPrices({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cartItemIdsKey]);

  const subTotals = (choice: { period: string; interval: number } | null) => {
    if (!choice) return null;
    let recurring = 0;
    let oneTime = 0;
    for (const it of cart?.items || []) {
      const pid = it.product?.databaseId;
      const qty = it.quantity || 1;
      const line = parseFloat((it.total || '0').replace(/[^0-9.]/g, '')) || 0;
      const unit = subUnitPrices[`${pid}_${choice.period}_${choice.interval}`];
      if (unit == null) return null;
      recurring += unit * qty;
      oneTime += line;
    }
    return { recurring, savings: Math.max(0, oneTime - recurring) };
  };

  const subSummary =
    subscribe && subChoice
      ? (() => {
          const t = subTotals(subChoice);
          return t
            ? {
                savings: t.savings,
                recurring: t.recurring,
                label: formatFrequency(subChoice.period, subChoice.interval),
              }
            : undefined;
        })()
      : undefined;

  // Fetch CSRF token on component mount
  const fetchCsrfToken = useCallback(async () => {
    try {
      setCsrfLoading(true);
      const response = await fetch('/api/csrf-token');
      if (response.ok) {
        const data = await response.json();
        setCsrfToken(data.token);
      } else {
        console.error('Failed to fetch CSRF token');
      }
    } catch (err) {
      console.error('Error fetching CSRF token:', err);
    } finally {
      setCsrfLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCsrfToken();
  }, [fetchCsrfToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(CHECKOUT_PROGRESS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.billing) setBilling(saved.billing);
      if (saved.shipping) setShipping(saved.shipping);
      if (typeof saved.sameAsBilling === 'boolean') setSameAsBilling(saved.sameAsBilling);
      if (saved.step) setStep(saved.step);
      setCustomerDataLoaded(true);
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false;
      return;
    }
    try {
      window.sessionStorage.setItem(
        CHECKOUT_PROGRESS_KEY,
        JSON.stringify({ step, billing, shipping, sameAsBilling }),
      );
    } catch {
      void 0;
    }
  }, [step, billing, shipping, sameAsBilling]);

  // Pre-fill form with customer data when available
  useEffect(() => {
    if (customerData?.customer && !customerDataLoaded) {
      const customer = customerData.customer;
      const customerBilling = customer.billing;
      const customerShipping = customer.shipping;

      // Pre-fill billing with customer data
      setBilling({
        firstName: customerBilling?.firstName || customer.firstName || '',
        lastName: customerBilling?.lastName || customer.lastName || '',
        email: customerBilling?.email || customer.email || '',
        phone: customerBilling?.phone || '',
        address1: customerBilling?.address1 || '',
        address2: customerBilling?.address2 || '',
        city: customerBilling?.city || '',
        state: customerBilling?.state || '',
        postcode: customerBilling?.postcode || '',
        country: customerBilling?.country || 'US',
      });

      // Pre-fill shipping if available
      if (customerShipping?.address1) {
        setShipping({
          firstName: customerShipping.firstName || '',
          lastName: customerShipping.lastName || '',
          email: '',
          phone: '',
          address1: customerShipping.address1 || '',
          address2: customerShipping.address2 || '',
          city: customerShipping.city || '',
          state: customerShipping.state || '',
          postcode: customerShipping.postcode || '',
          country: customerShipping.country || 'US',
        });
        setSameAsBilling(false);
      }

      setCustomerDataLoaded(true);
    }
  }, [customerData, customerDataLoaded]);

  // Update billing field
  const updateBilling = (field: keyof AddressData, value: string) => {
    setBilling((prev) => ({ ...prev, [field]: value }));
    if (errors[`billing.${field}`]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[`billing.${field}`];
        return newErrors;
      });
    }
  };

  // Update shipping field
  const updateShipping = (field: keyof AddressData, value: string) => {
    setShipping((prev) => ({ ...prev, [field]: value }));
    if (errors[`shipping.${field}`]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[`shipping.${field}`];
        return newErrors;
      });
    }
  };

  // Handle billing form submit
  const handleBillingSubmit = () => {
    const billingErrors = validateBillingAddress(billing);
    if (!isValid(billingErrors)) {
      setErrors(billingErrors);
      return;
    }
    setErrors({});
    setError(null);

    const identity: Record<string, unknown> = { email: billing.email };
    if (billing.firstName) identity.first_name = billing.firstName;
    if (billing.lastName) identity.last_name = billing.lastName;
    if (billing.phone) identity.phone_number = billing.phone;
    klaviyoIdentify(identity);
    klaviyoTrack('Started Checkout', {
      $value: parseFloat(String(cart?.total ?? '0').replace(/[^0-9.]/g, '')) || 0,
      ItemNames: cart?.items.map((i) => i.product.name) ?? [],
      Items:
        cart?.items.map((i) => ({
          ProductID: i.product.databaseId,
          ProductName: i.product.name,
          Quantity: i.quantity,
          ItemPrice: i.product.price,
        })) ?? [],
    });

    setStep('shipping');
  };

  // Handle shipping form submit
  const handleShippingSubmit = () => {
    if (!sameAsBilling) {
      const shippingErrors = validateShippingAddress(shipping);
      if (!isValid(shippingErrors)) {
        setErrors(shippingErrors);
        return;
      }
    }
    setErrors({});
    setError(null);
    setStep('payment');
  };

  // Handle payment submission
  const handlePayment = async (paymentData: PaymentData) => {
    // Check if CSRF token is available
    if (!csrfToken) {
      setError('Security token not available. Please refresh the page and try again.');
      fetchCsrfToken();
      return;
    }

    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;

    setIsProcessing(true);
    setError(null);

    const finalShipping = sameAsBilling ? billing : shipping;
    const cartSignature = JSON.stringify({
      items: cart?.items.map((i) => [i.product.databaseId, i.quantity]) ?? [],
      total: cart?.total,
      coupons: cart?.appliedCoupons?.map((c) => c.code) ?? [],
    });
    let idempotencyKey = generateIdempotencyKey();
    if (typeof window !== 'undefined') {
      const storedIdem = window.sessionStorage.getItem(CHECKOUT_IDEMPOTENCY_KEY);
      if (storedIdem) {
        try {
          const parsed = JSON.parse(storedIdem);
          if (parsed && parsed.sig === cartSignature && parsed.key) {
            idempotencyKey = parsed.key;
          }
        } catch {
          idempotencyKey = generateIdempotencyKey();
        }
      }
      window.sessionStorage.setItem(
        CHECKOUT_IDEMPOTENCY_KEY,
        JSON.stringify({ key: idempotencyKey, sig: cartSignature })
      );
    }

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
          'X-Idempotency-Key': idempotencyKey,
        },
        credentials: 'include',
        body: JSON.stringify({
          billing,
          shipping: sameAsBilling ? undefined : finalShipping,
          paymentNonce: paymentData.opaqueData || undefined,
          savedCard: paymentData.savedCard || undefined,
          saveCard: paymentData.saveCard || false,
          subscription: subscribe && subChoice ? subChoice : undefined,
          amount: cart?.total,
          coupons: cart?.appliedCoupons?.map((c) => c.code) ?? [],
          items: cart?.items.map((item) => ({
            productId: item.product.databaseId,
            name: item.product.name,
            quantity: item.quantity,
            price: item.product.price,
          })),
        }),
      });

      const result = await response.json();

      if (response.status === 429) {
        const retryAfter = result.retryAfter || 60;
        setError(`Too many attempts. Please wait ${retryAfter} seconds and try again.`);
        fetchCsrfToken();
        return;
      }

      if (response.status === 403 && result.code === 'CSRF_INVALID') {
        setError('Your security token refreshed. Please press Pay again to complete your order.');
        fetchCsrfToken();
        return;
      }

      if (!response.ok || !result.success) {
        if (result.requiresSupport && result.transactionId) {
          const reason = result.message ? ` (${result.message})` : '';
          throw new Error(
            `Your payment was processed but we encountered an issue${reason}. Please contact support with Transaction ID: ${result.transactionId}`
          );
        }
        throw new Error(result.message || 'Checkout failed. Please try again.');
      }

      if (REALID_ENABLED && typeof window !== 'undefined' && realIdCheckId) {
        const orderId = result.orderDatabaseId || result.orderId;
        if (orderId) {
          fetch('/api/realid/real-id/v1/check/order/associate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checkId: realIdCheckId, orderId }),
          }).catch(() => {});
        }
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(CHECKOUT_PROGRESS_KEY);
        window.sessionStorage.removeItem(CHECKOUT_IDEMPOTENCY_KEY);
      }

      clearCart().catch(() => {});

      router.push({
        pathname: '/order-confirmation',
        query: {
          orderId: result.orderId,
          total: cart?.total,
        },
      });
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      fetchCsrfToken();
    } finally {
      submittingRef.current = false;
      setIsProcessing(false);
    }
  };

  if (!cart || cart.items.length === 0) {
    return (
      <Layout title="Checkout">
        <div className={styles.page}>
          <h1 className={styles.pageTitle}>Checkout</h1>
          <div className={styles.emptyCart}>
            <p>Your cart is empty. Add some products before checking out.</p>
          </div>
        </div>
      </Layout>
    );
  }

  const getStepNumber = (s: CheckoutStep): number => {
    switch (s) {
      case 'billing': return 1;
      case 'shipping': return 2;
      case 'payment': return 3;
    }
  };

  const currentStepNum = getStepNumber(step);

  return (
    <Layout title="Checkout">
      {/* Split background - white left, gray right */}
      <div className={styles.splitBg} aria-hidden="true" />

      <div className={styles.page}>
        {/* Left: Form section */}
        <div className={styles.formSection}>
          <h1 className={styles.pageTitle}>checkout</h1>

          {/* 3-Step Indicator */}
          <div className={styles.steps}>
            <div className={`${styles.step} ${step === 'billing' ? styles.stepActive : currentStepNum > 1 ? styles.stepCompleted : ''}`}>
              <span className={`${styles.stepNumber} ${currentStepNum >= 1 ? styles.stepNumberActive : ''}`}>1</span>
              <span>Billing</span>
            </div>
            <div className={styles.stepDivider} />
            <div className={`${styles.step} ${step === 'shipping' ? styles.stepActive : currentStepNum > 2 ? styles.stepCompleted : ''}`}>
              <span className={`${styles.stepNumber} ${currentStepNum >= 2 ? styles.stepNumberActive : ''}`}>2</span>
              <span>Shipping</span>
            </div>
            <div className={styles.stepDivider} />
            <div className={`${styles.step} ${step === 'payment' ? styles.stepActive : ''}`}>
              <span className={`${styles.stepNumber} ${currentStepNum >= 3 ? styles.stepNumberActive : ''}`}>3</span>
              <span>Payment</span>
            </div>
          </div>

          {error && (
            <div className={styles.errorMessage} role="alert">
              {error}
            </div>
          )}

          <div className={styles.form}>
            {step === 'billing' && (
              <BillingForm
                billing={billing}
                errors={errors}
                onUpdate={updateBilling}
                onSubmit={handleBillingSubmit}
              />
            )}

            {step === 'shipping' && (
              <ShippingForm
                billing={billing}
                shipping={shipping}
                sameAsBilling={sameAsBilling}
                errors={errors}
                onUpdateShipping={updateShipping}
                onSameAsBillingChange={setSameAsBilling}
                onSubmit={handleShippingSubmit}
                onBack={() => setStep('billing')}
              />
            )}

            {step === 'payment' && (
              <>
                {subSchemes.length > 0 && subChoice && (() => {
                  const totals = subTotals(subChoice);
                  const savings = totals?.savings ?? 0;
                  const names = (cart?.items || []).map((it) => it.product?.name).filter(Boolean);
                  const freqLabel = formatFrequency(subChoice.period, subChoice.interval);
                  if (!subscribe) {
                    return (
                      <div className={styles.subUpgrade}>
                        <h3 className={styles.subUpgradeTitle}>Upgrade to a subscription and save!</h3>
                        <p className={styles.subUpgradeText}>
                          Upgrade the following products to a subscription
                          {savings > 0 ? ` and save up to $${savings.toFixed(2)} today!` : '.'}
                        </p>
                        <ul className={styles.subUpgradeList}>
                          {names.map((n, i) => (
                            <li key={i}>{n}</li>
                          ))}
                        </ul>
                        <label className={styles.subDeliverLabel} htmlFor="mf-deliver">
                          Deliver every
                        </label>
                        <select
                          id="mf-deliver"
                          className={styles.subDeliverSelect}
                          value={`${subChoice.period}_${subChoice.interval}`}
                          onChange={(e) => {
                            const [period, interval] = e.target.value.split('_');
                            setSubChoice({ period, interval: Number(interval) });
                          }}
                        >
                          {subSchemes.map((s) => (
                            <option key={`${s.period}_${s.interval}`} value={`${s.period}_${s.interval}`}>
                              {formatFrequency(s.period, s.interval)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className={styles.subUpgradeBtn}
                          onClick={() => setSubscribe(true)}
                        >
                          Upgrade all to a subscription
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div className={styles.subSaved}>
                      <button
                        type="button"
                        className={styles.subSavedHead}
                        onClick={() => setSubExpanded((v) => !v)}
                        aria-expanded={subExpanded}
                      >
                        <svg className={styles.subSavedCheck} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span className={styles.subSavedText}>
                          You saved ${savings.toFixed(2)} by upgrading products to a subscription!
                        </span>
                        <svg
                          className={`${styles.subSavedChevron} ${subExpanded ? styles.subSavedChevronUp : ''}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {subExpanded && (
                        <div className={styles.subSavedBody}>
                          <p className={styles.subSavedDeliver}>Deliver every {freqLabel}:</p>
                          <ul className={styles.subUpgradeList}>
                            {names.map((n, i) => (
                              <li key={i}>{n}</li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            className={styles.subUndo}
                            onClick={() => setSubscribe(false)}
                          >
                            Undo savings
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <RealIdVerification
                  customer={{
                    id: customerData?.customer?.databaseId ?? null,
                    email: billing.email,
                    firstName: billing.firstName,
                    lastName: billing.lastName,
                  }}
                  onVerifiedChange={(verified, cid) => {
                    setRealIdVerified(verified);
                    if (cid) setRealIdCheckId(cid);
                  }}
                />
                <PaymentForm
                  onSubmit={handlePayment}
                  onBack={() => setStep('shipping')}
                  isProcessing={isProcessing}
                  isLoading={csrfLoading}
                  amount={subSummary ? `$${subSummary.recurring.toFixed(2)}` : cart.total}
                  realIdBlocked={!realIdVerified}
                  isAuthenticated={!!isAuthenticated}
                />
              </>
            )}
          </div>
        </div>

        {/* Right: Order Summary (desktop only) */}
        <aside className={styles.summarySection}>
          <OrderSummary cart={cart} subscription={subSummary} />
        </aside>
      </div>

      {/* Mobile: Fixed bottom summary */}
      <MobileOrderSummary cart={cart} subscription={subSummary} />
    </Layout>
  );
}

// Payment form component using Authorize.net Accept.js
function PaymentForm({
  onSubmit,
  onBack,
  isProcessing,
  isLoading = false,
  amount,
  realIdBlocked = false,
  isAuthenticated = false,
}: {
  onSubmit: (data: PaymentData) => void;
  onBack: () => void;
  isProcessing: boolean;
  isLoading?: boolean;
  amount: string;
  realIdBlocked?: boolean;
  isAuthenticated?: boolean;
}) {
  const isDisabled = isProcessing || isLoading || realIdBlocked;
  const [cardNumber, setCardNumber] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardError, setCardError] = useState<string | null>(null);
  const [saveCard, setSaveCard] = useState(false);

  // Saved cards state
  const [savedCards, setSavedCards] = useState<SavedCardInfo[]>([]);
  const [customerProfileId, setCustomerProfileId] = useState<string | null>(null);
  const [selectedSavedCard, setSelectedSavedCard] = useState<string | null>(null);
  const [loadingCards, setLoadingCards] = useState(false);

  // Fetch saved cards for authenticated users
  useEffect(() => {
    if (!isAuthenticated) return;
    setLoadingCards(true);
    fetch('/api/account/payment-methods', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.cards?.length > 0) {
          setSavedCards(data.cards);
          setCustomerProfileId(data.customerProfileId);
          setSelectedSavedCard(data.cards[0].paymentProfileId);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingCards(false));
  }, [isAuthenticated]);

  const usingSavedCard = selectedSavedCard !== null && savedCards.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCardError(null);

    // Using saved card — no tokenization needed
    if (usingSavedCard && customerProfileId) {
      onSubmit({
        savedCard: {
          customerProfileId,
          paymentProfileId: selectedSavedCard,
        },
      });
      return;
    }

    // New card — validate and tokenize
    if (!cardNumber || cardNumber.replace(/\s/g, '').length < 13) {
      setCardError('Please enter a valid card number');
      return;
    }

    if (!expMonth || !expYear) {
      setCardError('Please enter a valid expiration date');
      return;
    }

    if (!cvv || cvv.length < 3) {
      setCardError('Please enter a valid CVV');
      return;
    }

    try {
      const opaqueData = await processPayment({
        cardNumber: cardNumber.replace(/\s/g, ''),
        expirationMonth: expMonth.padStart(2, '0'),
        expirationYear: expYear.length === 2 ? `20${expYear}` : expYear,
        cvv,
      });

      onSubmit({ opaqueData, saveCard: isAuthenticated && saveCard });
    } catch (err) {
      console.error('Tokenization error:', err);
      setCardError(
        err instanceof Error ? err.message : 'Failed to process card. Please try again.'
      );
    }
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length) {
      return parts.join(' ');
    } else {
      return value;
    }
  };

  return (
    <div className={styles.paymentContainer}>
      <h2>payment information</h2>
      <p className={styles.paymentNotice}>
        Your payment is secured by Authorize.net. Your card details are encrypted
        and never stored on our servers.
      </p>

      {/* Saved cards selector for authenticated users */}
      {isAuthenticated && !loadingCards && savedCards.length > 0 && (
        <SavedCardSelector
          cards={savedCards}
          selectedId={selectedSavedCard}
          onSelect={setSelectedSavedCard}
          disabled={isDisabled}
        />
      )}

      <form onSubmit={handleSubmit} className={styles.paymentForm}>
        {cardError && (
          <div className={styles.cardError} role="alert">
            {cardError}
          </div>
        )}

        {/* New card form — hidden when using saved card */}
        {!usingSavedCard && (
          <>
            <div className={styles.formGroup}>
              <label htmlFor="cardNumber">Card Number</label>
              <input
                type="text"
                id="cardNumber"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                placeholder="1234 5678 9012 3456"
                maxLength={19}
                autoComplete="cc-number"
                required
                disabled={isDisabled}
              />
            </div>

            <div className={styles.paymentFormRow}>
              <div className={styles.formGroup}>
                <label htmlFor="expMonth">Expiry Month</label>
                <select
                  id="expMonth"
                  value={expMonth}
                  onChange={(e) => setExpMonth(e.target.value)}
                  autoComplete="cc-exp-month"
                  required
                  disabled={isDisabled}
                >
                  <option value="">MM</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <option key={month} value={month.toString().padStart(2, '0')}>
                      {month.toString().padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="expYear">Expiry Year</label>
                <select
                  id="expYear"
                  value={expYear}
                  onChange={(e) => setExpYear(e.target.value)}
                  autoComplete="cc-exp-year"
                  required
                  disabled={isDisabled}
                >
                  <option value="">YY</option>
                  {Array.from({ length: 10 }, (_, i) => {
                    const year = new Date().getFullYear() + i;
                    return (
                      <option key={year} value={year.toString()}>
                        {year}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="cvv">CVV</label>
                <input
                  type="text"
                  id="cvv"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="123"
                  maxLength={4}
                  autoComplete="cc-csc"
                  required
                  disabled={isDisabled}
                />
              </div>
            </div>

            {/* Save card checkbox — authenticated users only */}
            {isAuthenticated && (
              <label className={styles.saveCardCheckbox}>
                <input
                  type="checkbox"
                  checked={saveCard}
                  onChange={(e) => setSaveCard(e.target.checked)}
                  disabled={isDisabled}
                />
                <span>Save this card for future purchases</span>
              </label>
            )}
          </>
        )}

        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.formActionsSecondary}
            onClick={onBack}
            disabled={isDisabled}
          >
            Back
          </button>
          <button
            type="submit"
            className={styles.formActionsPrimary}
            disabled={isDisabled}
          >
            {isLoading ? 'Loading...' : isProcessing ? 'Processing...' : `Pay ${amount}`}
          </button>
        </div>
      </form>

      <div className={styles.securityBadges}>
        <span>Secured by Authorize.net</span>
      </div>
    </div>
  );
}
