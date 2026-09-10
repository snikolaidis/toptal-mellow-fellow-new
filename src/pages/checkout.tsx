import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { useCart } from '@/context/CartContext';
import BillingForm from '@/components/checkout/BillingForm';
import ShippingForm from '@/components/checkout/ShippingForm';
import OrderSummary from '@/components/checkout/OrderSummary';
import MobileOrderSummary from '@/components/checkout/MobileOrderSummary';
import RealIdVerification, { STRONGLY_VERIFIED_STEPS } from '@/components/RealIdVerification';

// Bundle/sale discounts apply via the product's own sale price, not a coupon,
// so `product.price` is already the discounted unit price — `regularPrice`
// (when present) is the only source for the true original price.
function originalUnitPrice(item: { product: { price: string; regularPrice?: string } }): number {
  return parseFloat((item.product.regularPrice || item.product.price).replace(/[^0-9.]/g, '')) || 0;
}

const REALID_ENABLED = process.env.NEXT_PUBLIC_REALID_ENABLED === 'true';
const CHECKOUT_PROGRESS_KEY = 'mf-checkout-progress';
const CHECKOUT_IDEMPOTENCY_KEY = 'mf-checkout-idempotency';
import { AddressData, PaymentData, SavedCardInfo } from '@/types/checkout';
import { processPayment } from '@/lib/authorize-net';
import { collectWidgetSources } from '@/lib/widgetAttribution';
import SavedCardSelector from '@/components/checkout/SavedCardSelector';
import { klaviyoIdentify, klaviyoTrack } from '@/lib/klaviyo';
import { getApolloAuthClient } from '@faustwp/core';
import { useAuth } from '@/context/AuthContext';
import { useQuery, useMutation } from '@apollo/client';
import { GET_CUSTOMER_BILLING, UPDATE_CUSTOMER } from '@/graphql/queries/auth';
import { validateBillingAddress, validateShippingAddress, isValid, ValidationErrors } from '@/lib/validation';
import Link from 'next/link';
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
type RememberMeState = 'not_exist' | 'do_not_remember' | 'remember_30' | 'remember_60' | 'remember_90' | 'active' | 'forgotten';

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, clearCart, isLoading: cartLoading, bundleNames, bundleImages, bundleGroupSetCounts } = useCart();
  const { isAuthenticated, isReady: authReady } = useAuth();
  const prevAuthRef = useRef<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [realIdVerified, setRealIdVerified] = useState(!REALID_ENABLED);
  const [realIdCheckId, setRealIdCheckId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<CheckoutStep>('billing');
  const [customerDataLoaded, setCustomerDataLoaded] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const skipFirstSaveRef = useRef(true);
  const submittingRef = useRef(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [rememberMeState, setRememberMeState] = useState<RememberMeState>('not_exist');
  // rememberMeState starts at 'not_exist' - the same value it has once we've
  // confirmed there's genuinely no remembered check. Without a separate flag,
  // RealIdVerification (gated on rememberMeState !== 'active') would mount and
  // start the widget's own independent flow immediately, racing the async
  // server check below - and since the widget can silently overwrite the shared
  // real-id-check-id key with a check of its own choosing, that race can replace
  // a perfectly valid remembered check with a brand new, unverified one. Nothing
  // that depends on "is there a remembered check" should render until this is true.
  const [rememberMeChecked, setRememberMeChecked] = useState(false);

  // Address state
  const [billing, setBilling] = useState<AddressData>(emptyAddress);
  const [shipping, setShipping] = useState<AddressData>(emptyAddress);
  const [sameAsBilling, setSameAsBilling] = useState(true);

  // While Real ID is blocking payment, the widget script/UI takes a moment to load -
  // until then the screen is otherwise empty except for the standalone Back button
  // below. Only show it once real-id-check-loaded actually fires, and reset back to
  // hidden each time a fresh verification attempt starts.
  const [realIdLoaded, setRealIdLoaded] = useState(false);

  useEffect(() => {
    if (realIdVerified || typeof window === 'undefined') return;
    setRealIdLoaded(false);
    const onLoaded = () => setRealIdLoaded(true);
    window.addEventListener('real-id-check-loaded', onLoaded);
    return () => window.removeEventListener('real-id-check-loaded', onLoaded);
  }, [realIdVerified]);

  // When the payment step becomes visible, check whether this browser already has
  // a "remembered" Real ID check on file and whether it's still within its
  // remember-me window, so we can skip re-running the Real ID procedure.
  // localStorage is trivially forgeable via devtools (setItem three fake keys and
  // the payment form would appear with zero verification), so it's only ever a
  // hint here - the check's existence, completion, and ownership are all
  // re-confirmed against the server before ever trusting it enough to skip Real ID.
  useEffect(() => {
    if (!REALID_ENABLED || step !== 'payment' || typeof window === 'undefined') return;

    const checkId = window.localStorage.getItem('real-id-check-id');
    if (!checkId) {
      setRememberMeChecked(true);
      return;
    }

    // No expiration recorded yet doesn't mean expired - it means no remember-me
    // choice has been made for this check yet (still in progress, or verified but
    // not yet submitted). Deleting real-id-check-id here would rip the check out
    // from under Real ID mid-flow (React runs child effects, like the one that
    // creates/writes this check, before parent effects like this one on the same
    // render - so this used to fire immediately after the check was created).
    // Only an expiration that actually exists and has passed counts as expired.
    const expiration = window.localStorage.getItem(`real-id-check-${checkId}-expiration`);
    if (!expiration) {
      setRememberMeChecked(true);
      return;
    }

    const expirationTime = new Date(expiration).getTime();
    const diffDays = (expirationTime - Date.now()) / (1000 * 60 * 60 * 24);

    // Only for a check that's genuinely done for - actually expired, or fetched
    // fine but never reached a verified state for its own rightful owner. This
    // wipes the shared storage, so it must never fire just because the email
    // currently typed into the form happens not to match.
    const forgetThisCheck = () => {
      window.localStorage.removeItem(`real-id-check-${checkId}-completed`);
      window.localStorage.removeItem(`real-id-check-${checkId}-expiration`);
      window.localStorage.removeItem('real-id-check-id');
      setRememberMeState('not_exist');
      setRememberMeChecked(true);
    };

    // For "this isn't a match for the current session" - an email mismatch or a
    // failed lookup. The stored check may still be perfectly valid for whoever it
    // actually belongs to (e.g. a different family member checking out with their
    // own email on the same browser, right after this customer used remember-me) -
    // it must be left untouched. This session simply won't be treated as remembered.
    const skipWithoutForgetting = () => {
      setRememberMeState('not_exist');
      setRememberMeChecked(true);
    };

    if (Number.isNaN(expirationTime) || diffDays < 0) {
      forgetThisCheck();
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/realid/real-id/v1/checks/${checkId}`);
        if (!res.ok) throw new Error('verification lookup failed');
        const data = await res.json();
        const stepValue = data?.check?.step ?? data?.step;
        const statusValue = data?.check?.status ?? data?.status;
        const email = (data?.check?.email ?? data?.email ?? '').trim().toLowerCase();
        const currentEmail = (billing.email ?? '').trim().toLowerCase();

        const stepOk = STRONGLY_VERIFIED_STEPS.includes(stepValue) || STRONGLY_VERIFIED_STEPS.includes(statusValue);
        const completedLocally = window.localStorage.getItem(`real-id-check-${checkId}-completed`) === 'true';
        const ownedByCustomer = !!currentEmail && email === currentEmail;

        if (cancelled) return;
        if (stepOk && completedLocally && ownedByCustomer) {
          setRememberMeState('active');
          setRealIdVerified(true);
          // RealIdVerification never mounts for a remembered session (it's only
          // rendered while rememberMeState !== 'active'), so its onVerifiedChange
          // callback - the only other place that sets this - never fires. Without
          // this, handlePayment would send realIdCheckId: undefined to /api/checkout,
          // and the server-side guard correctly rejects an order with no check id.
          setRealIdCheckId(checkId);
          setRememberMeChecked(true);
        } else if (!ownedByCustomer) {
          skipWithoutForgetting();
        } else {
          forgetThisCheck();
        }
      } catch {
        if (!cancelled) skipWithoutForgetting();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, billing.email]);

  const [subSchemes, setSubSchemes] = useState<Array<{ period: string; interval: number }>>([]);
  const [subChecked, setSubChecked] = useState<number[]>([]);
  const [subChoice, setSubChoice] = useState<{ period: string; interval: number } | null>(null);
  const [subUnitPrices, setSubUnitPrices] = useState<Record<string, number>>({});

  // CSRF token for secure checkout
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [csrfLoading, setCsrfLoading] = useState(true);

  // Fetch customer data for logged-in users
  const client = isAuthenticated ? getApolloAuthClient() : null;
  const { data: customerData } = useQuery(GET_CUSTOMER_BILLING, {
    client: client ?? undefined,
    skip: !isAuthenticated || !client,
  });
  const [updateCustomer] = useMutation(UPDATE_CUSTOMER, { client: client ?? undefined });

  // Persist an edited billing/shipping address back to the customer's saved
  // profile — best-effort: failures here shouldn't block checkout.
  const saveAddressToProfile = useCallback(
    async (type: 'billing' | 'shipping', address: AddressData) => {
      if (!isAuthenticated || !client) return;
      const base = {
        firstName: address.firstName,
        lastName: address.lastName,
        address1: address.address1,
        address2: address.address2 || '',
        city: address.city,
        state: address.state,
        postcode: address.postcode,
        country: address.country,
      };
      const input =
        type === 'billing'
          ? { billing: { ...base, email: address.email || '', phone: address.phone || '' } }
          : { shipping: base };
      try {
        await updateCustomer({ variables: { input } });
      } catch {
        // best-effort — don't block checkout on profile save failures
      }
    },
    [isAuthenticated, client, updateCustomer]
  );

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
      setSubChecked([]);
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
        const union: string[] = [];
        perItem.forEach((keys) =>
          keys.forEach((k) => {
            if (!union.includes(k)) union.push(k);
          })
        );
        const schemes = union.map((k) => {
          const [period, interval] = k.split('_');
          return { period, interval: Number(interval) };
        });
        if (!cancelled) {
          setSubSchemes(schemes);
          if (schemes.length === 0) {
            setSubChoice(null);
            setSubChecked([]);
            return;
          }
          const chosen: Array<{ id: number; period: string; interval: number }> = [];
          for (const id of ids) {
            let raw: string | null = null;
            try {
              raw = window.sessionStorage.getItem(`mf_sub_${id}`);
            } catch {
              raw = null;
            }
            if (!raw) continue;
            try {
              const parsed = JSON.parse(raw);
              chosen.push({ id, period: String(parsed.period), interval: Number(parsed.interval) });
            } catch {
              void 0;
            }
          }
          let choice = schemes[0];
          if (chosen.length) {
            const c = chosen[0];
            if (schemes.some((s) => s.period === c.period && s.interval === c.interval)) {
              choice = { period: c.period, interval: c.interval };
            }
          }
          setSubChoice(choice);
          const checked = chosen
            .filter((c) => c.period === choice.period && c.interval === choice.interval)
            .map((c) => c.id)
            .filter((id) => priceMap[`${id}_${choice.period}_${choice.interval}`] != null);
          setSubChecked(checked);
        }
      } catch {
        if (!cancelled) {
          setSubSchemes([]);
          setSubChecked([]);
          setSubUnitPrices({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cartItemIdsKey]);

  const eligibleAt = (choice: { period: string; interval: number } | null, pid?: number) =>
    !!choice && pid != null && subUnitPrices[`${pid}_${choice.period}_${choice.interval}`] != null;

  const subTotals = (choice: { period: string; interval: number } | null, checkedIds: number[]) => {
    if (!choice || !checkedIds.length) return null;
    let recurring = 0;
    let oneTimeChecked = 0;
    for (const it of cart?.items || []) {
      const pid = it.product?.databaseId;
      if (pid == null || !checkedIds.includes(pid)) continue;
      const qty = it.quantity || 1;
      const line = parseFloat((it.total || '0').replace(/[^0-9.]/g, '')) || 0;
      const unit = subUnitPrices[`${pid}_${choice.period}_${choice.interval}`];
      if (unit == null) continue;
      recurring += unit * qty;
      oneTimeChecked += line;
    }
    if (recurring <= 0) return null;
    return { recurring, savings: Math.max(0, oneTimeChecked - recurring) };
  };

  const subSummary =
    subChecked.length > 0 && subChoice
      ? (() => {
        const t = subTotals(subChoice, subChecked);
        if (!t) return undefined;
        const fullTotal = parseFloat((cart?.total || '0').replace(/[^0-9.]/g, '')) || 0;
        return {
          savings: t.savings,
          recurring: t.recurring,
          total: Math.max(0, fullTotal - t.savings),
          label: formatFrequency(subChoice.period, subChoice.interval),
        };
      })()
      : undefined;

  const subscriptionCard = (() => {
    if (!subChoice || subSchemes.length === 0) return null;
    const eligible = (cart?.items || []).filter((it) => eligibleAt(subChoice, it.product?.databaseId));
    if (!eligible.length) return null;
    const totals = subTotals(subChoice, subChecked);
    const savings = totals?.savings ?? 0;
    const toggle = (pid: number) =>
      setSubChecked((prev) => (prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid]));
    return (
      <div className={styles.subUpgrade}>
        <h3 className={styles.subUpgradeTitle}>Subscribe &amp; save</h3>
        {savings > 0 ? (
          <p className={styles.subUpgradeText}>You save ${savings.toFixed(2)} on your subscription today.</p>
        ) : (
          <p className={styles.subUpgradeText}>Choose which products to subscribe and save.</p>
        )}
        <ul className={styles.subChoiceList}>
          {eligible.map((it) => {
            const pid = it.product!.databaseId;
            const qty = it.quantity || 1;
            const unit = subUnitPrices[`${pid}_${subChoice.period}_${subChoice.interval}`];
            const checked = subChecked.includes(pid);
            return (
              <li key={pid} className={styles.subChoiceItem}>
                <label className={styles.subChoiceLabel}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(pid)} />
                  <span className={styles.subChoiceName}>{it.product?.name}</span>
                </label>
                {unit != null && (
                  <span className={styles.subChoicePrice}>
                    ${(unit * qty).toFixed(2)} / {formatFrequency(subChoice.period, subChoice.interval)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {subSchemes.length > 1 && (
          <>
            <label className={styles.subDeliverLabel} htmlFor="mf-deliver">
              Deliver every
            </label>
            <select
              id="mf-deliver"
              className={styles.subDeliverSelect}
              value={`${subChoice.period}_${subChoice.interval}`}
              onChange={(e) => {
                const [period, interval] = e.target.value.split('_');
                const next = { period, interval: Number(interval) };
                setSubChoice(next);
                setSubChecked((prev) =>
                  prev.filter((pid) => subUnitPrices[`${pid}_${next.period}_${next.interval}`] != null)
                );
              }}
            >
              {subSchemes.map((s) => (
                <option key={`${s.period}_${s.interval}`} value={`${s.period}_${s.interval}`}>
                  {formatFrequency(s.period, s.interval)}
                </option>
              ))}
            </select>
          </>
        )}
        {subChecked.length > 0 && (
          <p className={styles.subCommit}>No commitment. Cancel anytime.</p>
        )}
      </div>
    );
  })();

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
      // Only skip the server pre-fill if we actually restored a real, filled-in
      // address — the saved shape always has a `billing` object (even with all
      // empty strings, from the initial state), so checking for the object alone
      // would wrongly block the customer's saved address from ever loading on
      // any return visit to checkout within the same tab session.
      if (saved.billing?.address1) setCustomerDataLoaded(true);
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

  // A logged-in customer's saved address (or a guest's own in-progress entry)
  // must never carry over across an actual auth change — otherwise logging
  // out in the same tab leaves the account's address sitting in the form for
  // whoever checks out next. Only reacts to a real transition, not the
  // initial auth check resolving.
  useEffect(() => {
    if (!authReady) return;
    if (prevAuthRef.current === null) {
      prevAuthRef.current = isAuthenticated;
      return;
    }
    if (prevAuthRef.current !== isAuthenticated) {
      prevAuthRef.current = isAuthenticated;
      try {
        window.sessionStorage.removeItem(CHECKOUT_PROGRESS_KEY);
      } catch {
        void 0;
      }
      setBilling(emptyAddress);
      setShipping(emptyAddress);
      setSameAsBilling(true);
      setStep('billing');
      setCustomerDataLoaded(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [isAuthenticated, authReady]);

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
    setBilling((prev) => {
      const next = { ...prev, [field]: value };

      // The Real ID verification state is connected to the verified email address.
      // When the billing email changes, we compare it with the last verified email:
      // If the email is different, we reset the verification and disable the Pay button.
      // If the user changes it back to the previous email (already verified), the verification
      // state is restored and the Pay button is enabled again. This way the verification
      // is email-specific and prevents a verification from one email address being reused for a different email.
      // This is a temporary solution, until we complete the "remember-me" options
      if (
        field === 'email' &&
        value.trim().toLowerCase() !== verifiedEmail?.trim().toLowerCase()
      ) {
        setRealIdVerified(false);
      } else if (
        field === 'email' &&
        value.trim().toLowerCase() === verifiedEmail?.trim().toLowerCase()
      ) {
        setRealIdVerified(true);
      }

      return next;
    });

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
    klaviyoTrack('Started Checkout (MFF-WOO)', {
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

    saveAddressToProfile('billing', billing);
    setStep('shipping');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle shipping form submit
  const handleShippingSubmit = () => {
    if (!sameAsBilling) {
      const shippingErrors = validateShippingAddress(shipping);
      if (!isValid(shippingErrors)) {
        setErrors(shippingErrors);
        return;
      }
      saveAddressToProfile('shipping', shipping);
    }
    setErrors({});
    setError(null);
    setStep('payment');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

    // Sum of every bundled line's (original - discounted) — passed through so
    // the order carries a "Bundle Discount" line the same way a coupon does
    // (see mellow-fellow-create-order.php).
    const bundleDiscountTotal = (cart?.items ?? []).reduce((sum, item) => {
      if (!item.bbGroupKey) return sum;
      const lineOriginal = item.quantity * originalUnitPrice(item);
      const lineTotal = parseFloat((item.total || '').replace(/[^0-9.]/g, '')) || 0;
      return sum + Math.max(0, lineOriginal - lineTotal);
    }, 0);

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
          subscriptionItems:
            subChecked.length > 0 && subChoice
              ? subChecked.map((pid) => ({
                productId: pid,
                period: subChoice.period,
                interval: subChoice.interval,
              }))
              : undefined,
          amount: cart?.total,
          coupons: cart?.appliedCoupons?.map((c) => c.code) ?? [],
          bundleDiscountTotal: bundleDiscountTotal > 0 ? bundleDiscountTotal : undefined,
          items: cart?.items.map((item) => ({
            productId: item.product.databaseId,
            name: item.product.name,
            quantity: item.quantity,
            price: item.bbLocked && typeof item.bbUnitPrice === 'number'
              ? `$${item.bbUnitPrice.toFixed(2)}`
              : item.product.price,
            // Lets the backend tag this line item as part of a bundle on the
            // order (see mellow-fellow-create-order.php) — undefined for any
            // item that isn't part of a bundle group, so non-bundle orders
            // are unaffected.
            bundleName: item.bbBundleId != null ? bundleNames[item.bbBundleId] : undefined,
            // The true pre-discount unit price, so the admin order screen can
            // show this line as discounted (subtotal vs. total) instead of a
            // flat, seemingly full-price line — see originalUnitPrice() above.
            regularUnitPrice: item.bbGroupKey ? originalUnitPrice(item) : undefined,
            // Lets the account order page regroup these line items back into
            // their bundle set, same as the cart/checkout already do client-side.
            bundleGroupKey: item.bbGroupKey || undefined,
            // Only set for "fixed" bundles — a fully-resolved dollar total for
            // this whole instance (bbFixedOriginalPrice is a per-set price;
            // bundleGroupSetCounts[groupKey] is how many sets this particular
            // groupKey represents, same multiplication CartContext's
            // groupCartItems does for the cart/checkout display). Sent
            // pre-resolved so the order page doesn't need to reconstruct
            // set-count math it has no data for. Absent for "byob" bundles,
            // where summing components' own regular prices (order line
            // subtotal) is already correct with no extra data needed.
            bundleGroupOriginalTotal:
              item.bbGroupKey && item.bbFixedOriginalPrice != null
                ? item.bbFixedOriginalPrice * (bundleGroupSetCounts[item.bbGroupKey] ?? 1)
                : undefined,
            // How many bundle sets this line's quantity represents — lets the
            // order page show the bundle's own quantity instead of summing
            // every component line's quantity (see checkout/[databaseId].tsx).
            bundleGroupSetCount: item.bbGroupKey
              ? bundleGroupSetCounts[item.bbGroupKey] ?? 1
              : undefined,
            // The bundle product's own image, so the order page can show it
            // on the bundle's header row (component products have no
            // relation to the bundle product's own image).
            bundleImageUrl: item.bbBundleId != null ? bundleImages[item.bbBundleId]?.sourceUrl : undefined,
            bundleImageAlt: item.bbBundleId != null ? bundleImages[item.bbBundleId]?.altText : undefined,
          })),
          sources: collectWidgetSources((cart?.items || []).map((i) => i.product.databaseId)),
          // Lets the server independently re-confirm Real ID verification before
          // the order is created — see mellow-fellow-realid-order-guard.php.
          realIdCheckId: REALID_ENABLED ? realIdCheckId || undefined : undefined,
        }),
      });

      const result = await response.json();

      if (response.status === 429) {
        const retryAfter = result.retryAfter || 60;
        setError(`Too many attempts. Please wait ${retryAfter} seconds and try again.`);
        fetchCsrfToken();
        submittingRef.current = false;
        setIsProcessing(false);
        return;
      }

      if (!response.ok || !result.success) {
        if (result.paymentVoided) {
          throw new Error(
            'We could not complete your order, so your payment was reversed and you were not charged. Please try again.'
          );
        }
        if (result.requiresSupport && result.transactionId) {
          const reason = result.message ? ` (${result.message})` : '';
          throw new Error(
            `Your payment was processed but we encountered an issue${reason}. Please contact support with Transaction ID: ${result.transactionId}`
          );
        }
        throw new Error(result.message || 'Checkout failed. Please try again.');
      }

      // The Real ID remember-me choice is only ever applied once the purchase has
      // actually succeeded - never at form submission time, and never on failure.
      if (typeof window !== 'undefined') {
        const checkId = window.localStorage.getItem('real-id-check-id');
        if (checkId) {
          switch (paymentData.rememberOption) {
            case 'do_not_remember':
              window.localStorage.removeItem(`real-id-check-${checkId}-completed`);
              window.localStorage.removeItem(`real-id-check-${checkId}-expiration`);
              window.localStorage.removeItem('real-id-check-id');
              break;
            case 'remember_30':
            case 'remember_60':
            case 'remember_90': {
              const REMEMBER_DAYS: Record<string, number> = { remember_30: 30, remember_60: 60, remember_90: 90 };
              const days = REMEMBER_DAYS[paymentData.rememberOption];
              const expiration = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
              window.localStorage.setItem(`real-id-check-${checkId}-expiration`, expiration);
              break;
            }
          }
        }
      }

      if (REALID_ENABLED && typeof window !== 'undefined' && realIdCheckId) {
        const orderId = result.orderDatabaseId || result.orderId;
        if (orderId) {
          fetch('/api/realid/real-id/v1/check/order/associate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checkId: realIdCheckId, orderId }),
          }).catch(() => { });
        }
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(CHECKOUT_PROGRESS_KEY);
        window.sessionStorage.removeItem(CHECKOUT_IDEMPOTENCY_KEY);
      }

      await clearCart().catch(() => { });

      router.push({
        pathname: '/order-confirmation',
        query: {
          orderId: result.orderId,
          total: result.amountCharged ? `$${result.amountCharged}` : cart?.total,
        },
      });
      // Intentionally not resetting isProcessing/submittingRef here: router.push()
      // isn't awaited, so a finally block would re-enable every button (Back
      // included) while Next.js is still loading the order-confirmation page -
      // there's nothing to recover for on the success path, we're navigating away.
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      fetchCsrfToken();
      submittingRef.current = false;
      setIsProcessing(false);
    }
  };

  if (cartLoading && (!cart || cart.items.length === 0)) {
    return (
      <Layout title="Checkout">
        <div className={styles.splitBg} aria-hidden="true" />
        <div className={styles.page}>
          <div className={styles.formSection}>
            <h1 className={styles.pageTitle}>checkout</h1>
            <div className={styles.steps}>
              <div className={`${styles.step} ${styles.stepActive}`}>
                <span className={`${styles.stepNumber} ${styles.stepNumberActive}`}>1</span>
                <span>Billing</span>
              </div>
              <div className={styles.stepDivider} />
              <div className={styles.step}>
                <span className={styles.stepNumber}>2</span>
                <span>Shipping</span>
              </div>
              <div className={styles.stepDivider} />
              <div className={styles.step}>
                <span className={styles.stepNumber}>3</span>
                <span>Payment</span>
              </div>
            </div>
            <div className={styles.skeletonForm}>
              <div className={styles.skeletonLine} style={{ width: '40%', height: 14 }} />
              <div className={styles.skeletonRow}>
                <div className={styles.skeletonInput} />
                <div className={styles.skeletonInput} />
              </div>
              <div className={styles.skeletonLine} style={{ width: '30%', height: 14 }} />
              <div className={styles.skeletonRow}>
                <div className={styles.skeletonInput} />
                <div className={styles.skeletonInput} />
              </div>
              <div className={styles.skeletonLine} style={{ width: '25%', height: 14 }} />
              <div className={styles.skeletonInput} />
            </div>
          </div>
          <aside className={styles.summarySection}>
            <div className={styles.skeletonSummary}>
              <div className={styles.skeletonLine} style={{ width: '50%', height: 18 }} />
              {[1, 2, 3].map((i) => (
                <div key={i} className={styles.skeletonItemRow}>
                  <div className={styles.skeletonThumb} />
                  <div className={styles.skeletonItemInfo}>
                    <div className={styles.skeletonLine} style={{ width: '80%', height: 12 }} />
                    <div className={styles.skeletonLine} style={{ width: '30%', height: 12 }} />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </Layout>
    );
  }

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

          {!isAuthenticated && authReady && step === 'billing' && (
            <div className={styles.guestSignin}>
              Already have an account?{' '}
              <Link href="/login?redirect=/checkout" className={styles.guestSigninLink}>
                Sign in
              </Link>
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
                onBack={() => {
                  setStep('billing')
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}

            {step === 'payment' && (
              <>
                {rememberMeChecked && rememberMeState !== 'active' && (
                  <div
                    className={`${styles.collapsible} ${realIdVerified ? styles.collapsibleCollapsed : ''}`}
                  >
                    <div className={styles.collapsibleInner}>
                      <div className="read-id-main-wrapper">
                        <RealIdVerification
                          customer={{
                            id: customerData?.customer?.databaseId ?? null,
                            email: billing.email,
                            firstName: billing.firstName,
                            lastName: billing.lastName,
                          }}
                          onVerifiedChange={(verified, cid) => {
                            if (verified) {
                              setRealIdVerified(true);
                              setVerifiedEmail(billing.email ?? null);

                              window.scrollTo({
                                top: 0,
                                behavior: 'smooth',
                              });
                            }

                            if (cid) setRealIdCheckId(cid);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {!realIdVerified && realIdLoaded && (
                  <div className={styles.formActions} style={{ marginTop: '1rem' }}>
                    <button
                      type="button"
                      className={styles.formActionsSecondary}
                      onClick={() => {
                        setStep('shipping');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      Back
                    </button>
                    <span>&nbsp;</span>
                  </div>
                )}

                {realIdVerified && (
                  <PaymentForm
                    onSubmit={handlePayment}
                    onBack={() => {
                      setStep('shipping')
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    isProcessing={isProcessing}
                    isLoading={csrfLoading}
                    amount={subSummary ? `$${subSummary.total.toFixed(2)}` : cart.total}
                    realIdBlocked={!realIdVerified}
                    isAuthenticated={!!isAuthenticated}
                    rememberMeState={rememberMeState}
                    onForgetMe={() => {
                      // 'not_exist' (not 'forgotten') is what the remember-me radio
                      // picker in PaymentForm actually checks for - otherwise it has
                      // no way to reappear once verification completes again, until
                      // a full page reload resets this state back to its initial value.
                      setRememberMeState('not_exist');
                      setRealIdVerified(false);
                      setRealIdCheckId(null);
                      setVerifiedEmail(null);
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: Order Summary (desktop only) */}
        <aside className={styles.summarySection}>
          <OrderSummary cart={cart} subscription={subSummary} subscriptionSlot={subscriptionCard} />
        </aside>
      </div>

      {/* Mobile: Fixed bottom summary */}
      <MobileOrderSummary cart={cart} subscription={subSummary} subscriptionSlot={subscriptionCard} />
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
  rememberMeState,
  onForgetMe,
}: {
  onSubmit: (data: PaymentData) => void;
  onBack: () => void;
  isProcessing: boolean;
  isLoading?: boolean;
  amount: string;
  realIdBlocked?: boolean;
  isAuthenticated?: boolean;
  rememberMeState: RememberMeState;
  onForgetMe?: () => void;
}) {
  const isDisabled = isProcessing || isLoading || realIdBlocked;
  // The remember-me radio group only renders when rememberMeState === 'not_exist'
  // (see below) - during an already-active remembered session there's no new
  // choice being made, so this must default to 'active', not 'do_not_remember'.
  // Otherwise every purchase in an active session would submit 'do_not_remember'
  // by default and handlePayment would wipe out the very session being reused.
  const [selectedRememberOption, setSelectedRememberOption] = useState<RememberMeState>(
    rememberMeState === 'active' ? 'active' : 'do_not_remember'
  );
  const [cardNumber, setCardNumber] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardError, setCardError] = useState<string | null>(null);
  const [saveCard, setSaveCard] = useState(false);
  const [rememberDaysLeft, setRememberDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    if (rememberMeState !== 'active' || typeof window === 'undefined') {
      setRememberDaysLeft(null);
      return;
    }
    const checkId = window.localStorage.getItem('real-id-check-id');
    const expiration = checkId
      ? window.localStorage.getItem(`real-id-check-${checkId}-expiration`)
      : null;
    const expirationTime = expiration ? new Date(expiration).getTime() : NaN;
    if (Number.isNaN(expirationTime)) {
      setRememberDaysLeft(null);
      return;
    }
    const days = Math.ceil((expirationTime - Date.now()) / (1000 * 60 * 60 * 24));
    setRememberDaysLeft(days);
  }, [rememberMeState]);

  // PaymentForm only ever mounts once Real ID has already verified, so it starts
  // fully collapsed and flips open a frame after mount - giving the CSS transition
  // an actual "before" state to animate from, producing the slide-down reveal.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleForgetMe = () => {
    const checkId = window.localStorage.getItem('real-id-check-id');
    if (checkId) {
      window.localStorage.removeItem(`real-id-check-${checkId}-completed`);
      window.localStorage.removeItem(`real-id-check-${checkId}-expiration`);
    }
    window.localStorage.removeItem('real-id-check-id');
    onForgetMe?.();
  };

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
      .catch(() => { })
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
        rememberOption: selectedRememberOption,
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

      onSubmit({ opaqueData, saveCard: isAuthenticated && saveCard, rememberOption: selectedRememberOption });
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
      <div className={`${styles.collapsible} ${revealed ? '' : styles.collapsibleCollapsed}`}>
        <div className={styles.collapsibleInner}>

          {rememberMeState === 'active' && (
            <div className={styles.rememberMeActive}>
              <div className="App ri-flex ri-flex-col">
                <div className={`md:ri-rounded-t ri-w-full ri-box-border ${styles.realIdBrandBar}`}>
                  <div className="ri-flex ri-items-center ri-justify-between ri-max-w-xl ri-mx-auto ri-px-5">
                    <img src="https://res.cloudinary.com/tinyhouse/image/upload/v1600384235/Real%20ID/realIDbrand_white.svg" className="ri-w-24 md:ri-w-32" alt="ID verification required"></img>
                  </div>
                </div>
                <div id="content" className="ri-flex-grow ri-flex ri-flex-col ri-items-center ri-py-3 ri-bg-white md:ri-px-16">
                  <div className="ri-w-full ri-bg-white portrait:ri-h-full">
                    <div className="xl:ri-block ri-max-w-xl ri-mx-auto portrait:ri-h-full">
                      <div>
                        <div className="ri-text-center">

                          <p className="ri-pb-4 ri-px-3">
                            {rememberDaysLeft !== null
                              ? `We'll remember your identity verification for ${rememberDaysLeft} more day${rememberDaysLeft === 1 ? '' : 's'}.`
                              : "We're remembering your identity verification on this device."}
                          </p>

                          <button type="button" className={styles.formActionsSecondary} onClick={handleForgetMe}>
                            Forget me
                          </button>

                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {rememberMeState === 'not_exist' && (
            <div className={styles.rememberMe}>
              <div className="App ri-flex ri-flex-col">
                <div className={`md:ri-rounded-t ri-w-full ri-box-border ${styles.realIdBrandBar}`}>
                  <div className="ri-flex ri-items-center ri-justify-between ri-max-w-xl ri-mx-auto ri-px-5">
                    <img src="https://res.cloudinary.com/tinyhouse/image/upload/v1600384235/Real%20ID/realIDbrand_white.svg" className="ri-w-24 md:ri-w-32" alt="ID verification required"></img>
                  </div>
                </div>
                <div id="content" className="ri-flex-grow ri-flex ri-flex-col ri-items-center ri-py-3 ri-bg-white md:ri-px-16">
                  <div className="ri-w-full ri-bg-white portrait:ri-h-full">
                    <div className="xl:ri-block ri-max-w-xl ri-mx-auto portrait:ri-h-full">
                      <div>
                        <div className="ri-text-center">

                          <p className="ri-pb-4 ri-px-3">You're verified! Skip this step next time by letting us remember your Real ID check on this device:</p>

                          <ul className="ri-inline-block ri-text-left">
                            <li>
                              <label>
                                <input className="ri-mr-4" name="remember_me_radio" type="radio" value="do_not_remember" defaultChecked onChange={() => setSelectedRememberOption('do_not_remember')} />
                                <strong>Do not remember me</strong>
                              </label>
                            </li>
                            <li>
                              <label>
                                <input className="ri-mr-4" name="remember_me_radio" type="radio" value="remember_30" onChange={() => setSelectedRememberOption('remember_30')} />
                                Remember me for <strong>30 days</strong>
                              </label>
                            </li>
                            <li>
                              <label>
                                <input className="ri-mr-4" name="remember_me_radio" type="radio" value="remember_60" onChange={() => setSelectedRememberOption('remember_60')} />
                                Remember me for <strong>60 days</strong>
                              </label>
                            </li>
                            <li>
                              <label>
                                <input className="ri-mr-4" name="remember_me_radio" type="radio" value="remember_90" onChange={() => setSelectedRememberOption('remember_90')} />
                                Remember me for <strong>90 days</strong>
                              </label>
                            </li>
                          </ul>

                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

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
      </div>
    </div>
  );
}
