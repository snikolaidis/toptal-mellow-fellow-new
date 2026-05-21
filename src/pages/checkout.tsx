import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { useCart } from '@/context/CartContext';
import BillingForm from '@/components/checkout/BillingForm';
import ShippingForm from '@/components/checkout/ShippingForm';
import OrderSummary from '@/components/checkout/OrderSummary';
import MobileOrderSummary from '@/components/checkout/MobileOrderSummary';
import { AddressData, PaymentData } from '@/types/checkout';
import { processPayment } from '@/lib/authorize-net';
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

type CheckoutStep = 'billing' | 'shipping' | 'payment';

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, clearCart } = useCart();
  const { isAuthenticated } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<CheckoutStep>('billing');
  const [customerDataLoaded, setCustomerDataLoaded] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});

  // Address state
  const [billing, setBilling] = useState<AddressData>(emptyAddress);
  const [shipping, setShipping] = useState<AddressData>(emptyAddress);
  const [sameAsBilling, setSameAsBilling] = useState(true);

  // CSRF token for secure checkout
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [csrfLoading, setCsrfLoading] = useState(true);

  // Fetch customer data for logged-in users
  const client = isAuthenticated ? getApolloAuthClient() : null;
  const { data: customerData } = useQuery(GET_CUSTOMER, {
    client: client!,
    skip: !isAuthenticated || !client,
  });

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

    setIsProcessing(true);
    setError(null);

    const idempotencyKey = generateIdempotencyKey();
    const finalShipping = sameAsBilling ? billing : shipping;

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
          paymentNonce: paymentData.opaqueData,
          amount: cart?.total,
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
        setError('Session expired. Please refresh the page and try again.');
        fetchCsrfToken();
        return;
      }

      if (!response.ok || !result.success) {
        if (result.requiresSupport && result.transactionId) {
          throw new Error(
            `Your payment was processed but we encountered an issue. Please contact support with Transaction ID: ${result.transactionId}`
          );
        }
        throw new Error(result.message || 'Checkout failed. Please try again.');
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
              <PaymentForm
                onSubmit={handlePayment}
                onBack={() => setStep('shipping')}
                isProcessing={isProcessing}
                isLoading={csrfLoading}
                amount={cart.total}
              />
            )}
          </div>
        </div>

        {/* Right: Order Summary (desktop only) */}
        <aside className={styles.summarySection}>
          <OrderSummary cart={cart} />
        </aside>
      </div>

      {/* Mobile: Fixed bottom summary */}
      <MobileOrderSummary cart={cart} />
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
}: {
  onSubmit: (data: PaymentData) => void;
  onBack: () => void;
  isProcessing: boolean;
  isLoading?: boolean;
  amount: string;
}) {
  const isDisabled = isProcessing || isLoading;
  const [cardNumber, setCardNumber] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardError, setCardError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCardError(null);

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

      onSubmit({ opaqueData });
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

      <form onSubmit={handleSubmit} className={styles.paymentForm}>
        {cardError && (
          <div className={styles.cardError} role="alert">
            {cardError}
          </div>
        )}

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
