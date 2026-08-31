import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

import Layout from '@/components/Layout';
import MellowCheckout from '@/components/checkout/MellowCheckout';
import BillingStep from '@/components/checkout/BillingStep';
import RealIdStep from '@/components/checkout/RealIdStep';
import PaymentStep from '@/components/checkout/PaymentStep';

import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';

export interface CheckoutAddress {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
}

export interface CheckoutProduct {
  id: number | string;
  name: string;
  quantity: number;
  price: number;
  image: string;
  total: number;
}

export interface ShippingMethod {
  id: string;
  name: string;
  price: number;
  description?: string;
}

const emptyAddress: CheckoutAddress = {
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

function parsePrice(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const number = parseFloat(
      value.replace(/[^0-9.-]+/g, '')
    );

    return Number.isFinite(number) ? number : 0;
  }

  return 0;
}

export default function CheckoutNewPage() {
  const router = useRouter();

  /*
   * ---------------------------------------------------------
   * CART
   * ---------------------------------------------------------
   */

  // const {
  //   cart,
  //   isLoading: cartLoading,
  // } = useCart();

      const {
      cart,
      isLoading: cartLoading,
      updateShippingMethod,
    } = useCart();

  /*
   * ---------------------------------------------------------
   * MELLOW FELLOW / FAUST AUTH
   * ---------------------------------------------------------
   *
   * Keep existing AuthContext.
   * This continues supporting normal Mellow Fellow login.
   */

  const {
    isAuthenticated: faustAuthenticated,
    isReady: faustReady,
  } = useAuth();

  /*
   * ---------------------------------------------------------
   * GOOGLE AUTH
   * ---------------------------------------------------------
   */

  const [googleAuthenticated, setGoogleAuthenticated] =
    useState<boolean | null>(null);

  const [googleAuthReady, setGoogleAuthReady] =
    useState(false);

  /*
   * Checkout authentication method.
   *
   * This is only checkout UI state. It is NOT the Google session.
   */
  type CheckoutAuthMethod = 'google' | 'mellow' | 'guest' | null;

  const CHECKOUT_AUTH_KEY = 'checkoutAuthMethod';

  const [checkoutAuthMethod, setCheckoutAuthMethod] =
    useState<CheckoutAuthMethod>(null);

  /*
   * Set while we're kicking an unauthenticated shopper to
   * /checkout-login, so we don't flash checkout content first.
   */
  const [redirectingToLogin, setRedirectingToLogin] =
    useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkGoogleSession() {
      try {
        const response = await fetch(
          '/api/auth/session',
          {
            method: 'GET',
            credentials: 'include',
          }
        );

        const data = await response.json();

        console.log(
          'GOOGLE CHECKOUT SESSION:',
          {
            status: response.status,
            data,
          }
        );

        if (!mounted) {
          return;
        }

        setGoogleAuthenticated(
          response.ok &&
          data?.isAuthenticated === true
        );
      } catch (error) {
        console.error(
          'Google checkout session check failed:',
          error
        );

        if (mounted) {
          setGoogleAuthenticated(false);
        }
      } finally {
        if (mounted) {
          setGoogleAuthReady(true);
        }
      }
    }

    checkGoogleSession();

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * ---------------------------------------------------------
   * COMBINED CHECKOUT AUTH
   * ---------------------------------------------------------
   */

  const checkoutAuthReady =
    faustReady &&
    googleAuthReady;

  /*
   * ---------------------------------------------------------
   * CHECKOUT AUTH METHOD
   * ---------------------------------------------------------
   *
   * Authentication remains controlled by the existing Faust/Google
   * sessions. sessionStorage only remembers which checkout option
   * was selected.
   */
  useEffect(() => {
    if (!checkoutAuthReady) {
      return;
    }

    let storedMethod: CheckoutAuthMethod = null;

    try {
      const value = sessionStorage.getItem(CHECKOUT_AUTH_KEY);

      if (
        value === 'google' ||
        value === 'mellow' ||
        value === 'guest'
      ) {
        storedMethod = value;
      }
    } catch (error) {
      console.warn(
        'Unable to read checkout auth method:',
        error
      );
    }

    /*
     * Actual authentication always wins over stored checkout state.
     */
    if (faustAuthenticated === true) {
      setCheckoutAuthMethod('mellow');
      console.log('MELLOW');
      return;
    }

    if (googleAuthenticated === true) {
      setCheckoutAuthMethod('google');
      console.log('GOOGLE');
      return;
    }

    /*
     * If the user is not authenticated, Guest is only valid when it
     * was explicitly chosen via /checkout-login's "Continue as Guest"
     * option. A stale "google" or "mellow" value must never make an
     * unauthenticated user look logged in.
     */
    if (storedMethod === 'guest') {
      setCheckoutAuthMethod('guest');
      console.log('GUEST');
      return;
    }

    /*
     * No auth session and no explicit guest choice: send the shopper
     * to sign in / choose guest checkout. Skip this if the cart is
     * empty - the empty cart state handles that case instead.
     */
    if (cart?.items?.length) {
      setRedirectingToLogin(true);
      router.replace('/checkout-login');
    }
  }, [
    checkoutAuthReady,
    faustAuthenticated,
    googleAuthenticated,
    cart,
    router,
  ]);

  const checkoutAuthenticated =
    checkoutAuthMethod === 'google' ||
    checkoutAuthMethod === 'mellow';

  /*
   * ---------------------------------------------------------
   * ADDRESS STATE
   * ---------------------------------------------------------
   */

  const [billing, setBilling] =
    useState<CheckoutAddress>(
      emptyAddress
    );

  const [shipping, setShipping] =
    useState<CheckoutAddress>(
      emptyAddress
    );

  const [customerLoaded, setCustomerLoaded] =
    useState(false);

  const [customerLoading, setCustomerLoading] =
    useState(false);

  const [customerError, setCustomerError] =
    useState<string | null>(null);

  /*
   * ---------------------------------------------------------
   * CUSTOMER ID
   * ---------------------------------------------------------
   *
   * Used by Real ID.
   */

  const [customerId, setCustomerId] =
    useState<number | null>(null);

  /*
   * ---------------------------------------------------------
   * REAL ID
   * ---------------------------------------------------------
   */

  const [realIdVerified, setRealIdVerified] =
    useState(false);

  /*
   * Your current RealIdStep only returns
   * onContinue(), not the check ID.
   *
   * Keep this nullable for now.
   */

  const [realIdCheckId, setRealIdCheckId] =
    useState<string | null>(null);

  /*
   * ---------------------------------------------------------
   * SHIPPING
   * ---------------------------------------------------------
   */

  // const [selectedShipping, setSelectedShipping] =
  //   useState('standard');

    const [selectedShipping, setSelectedShipping] =
  useState<string | null>(null);

  /*
   * ---------------------------------------------------------
   * CHECKOUT STEP
   * ---------------------------------------------------------
   */

  const [checkoutStep, setCheckoutStep] =
    useState<
      'shipping' |
      'billing' |
      'real-id' |
      'payment'
    >('shipping');

    /*
 * Scroll to top whenever checkout page/step changes.
 */
useEffect(() => {
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: 'auto',
  });
}, [router.asPath, checkoutStep]);

  /*
   * ---------------------------------------------------------
   * PRODUCTS
   * ---------------------------------------------------------
   */

  const products: CheckoutProduct[] =
    useMemo(() => {
      if (!cart?.items?.length) {
        return [];
      }

      return cart.items.map(
        (item: any) => {
          const price =
            parsePrice(
              item?.bbLocked &&
              typeof item?.bbUnitPrice === 'number'
                ? item.bbUnitPrice
                : item?.product?.price
            );

          const quantity =
            Number(item?.quantity) > 0
              ? Number(item.quantity)
              : 1;

          const total =
            parsePrice(item?.total);

          return {
            id:
              item?.product?.databaseId ||
              item?.product?.id ||
              item?.key,

            name:
              item?.product?.name ||
              'Product',

            quantity,

            price,

            total:
              total > 0
                ? total
                : price * quantity,

            image:
              item?.product?.image?.sourceUrl ||
              '',
          };
        }
      );
    }, [cart]);

  /*
   * ---------------------------------------------------------
   * SUBTOTAL
   * ---------------------------------------------------------
   */

  const subtotal = useMemo(() => {
    if (!cart) {
      return 0;
    }

    const cartSubtotal =
      parsePrice(cart.subtotal);

    if (cartSubtotal > 0) {
      return cartSubtotal;
    }

    return products.reduce(
      (sum, product) =>
        sum +
        product.price *
        product.quantity,
      0
    );
  }, [cart, products]);

  /*
   * ---------------------------------------------------------
   * SHIPPING METHODS
   * ---------------------------------------------------------
   */

  // const shippingMethods: ShippingMethod[] = [
  //   {
  //     id: 'standard',
  //     name: 'Standard Shipping',
  //     price: 5.99,
  //     description:
  //       'Arrives in 5-7 business days',
  //   },

  //   {
  //     id: 'express',
  //     name: 'Express Shipping',
  //     price: 9.99,
  //     description:
  //       'Arrives in 2-3 business days',
  //   },

  //   {
  //     id: 'overnight',
  //     name: 'Overnight Shipping',
  //     price: 24.99,
  //     description:
  //       'Next business day by 10:30 AM',
  //   },
  // ];

  /*
 * ---------------------------------------------------------
 * SHIPPING METHODS
 * ---------------------------------------------------------
 *
 * Shipping methods come dynamically from WooCommerce / WP.
 */

const wpShippingMethods =
  cart?.availableShippingMethods?.[0]?.rates || [];

const shippingMethods: ShippingMethod[] =
  wpShippingMethods.map((method: any) => ({
    id: method.id,
    name: method.label || method.name || '',
    price: parsePrice(method.cost),
    description: method.description || '',
  }));

const chosenShippingMethod =
  cart?.chosenShippingMethods?.[0] || null;

const selectedShippingMethod =
  shippingMethods.find(
    (method) =>
      method.id === selectedShipping
  ) ||
  shippingMethods.find(
    (method) =>
      method.id === chosenShippingMethod
  ) ||
  shippingMethods[0] ||
  null;

/*
 * Keep selected shipping method in sync with WooCommerce.
 */
useEffect(() => {
  if (!shippingMethods.length) {
    setSelectedShipping(null);
    return;
  }

  if (chosenShippingMethod) {
    setSelectedShipping(chosenShippingMethod);
    return;
  }

  if (!selectedShipping) {
    setSelectedShipping(
      shippingMethods[0].id
    );
  }
}, [
  shippingMethods,
  chosenShippingMethod,
  selectedShipping,
]);

const handleShippingMethodChange = async (
  methodId: string
) => {
  setSelectedShipping(methodId);

  try {
    await updateShippingMethod(methodId);
  } catch (error) {
    console.error(
      'Failed to update shipping method:',
      error
    );
  }
};
  // const selectedShippingMethod =
  //   shippingMethods.find(
  //     (method) =>
  //       method.id === selectedShipping
  //   ) ||
  //   shippingMethods[0];

  /*
   * Reset all checkout customer data.
   *
   * This prevents customer data from a previous authentication
   * method from surviving into a Guest checkout.
   */
  const resetCheckoutCustomer = () => {
    setBilling(emptyAddress);
    setShipping(emptyAddress);
    setCustomerId(null);
    setCustomerLoaded(false);
    setCustomerError(null);
  };

  /*
   * ---------------------------------------------------------
   * LOAD CUSTOMER
   * ---------------------------------------------------------
   *
   * Works for:
   *
   * 1. Mellow Fellow login
   * 2. Google login
   * 3. Guest
   */

  useEffect(() => {
    if (!checkoutAuthReady) {
      return;
    }

    /*
     * Guest
     */

    if (
      checkoutAuthMethod === 'guest' ||
      checkoutAuthMethod === null
    ) {
      setBilling(emptyAddress);
      setShipping(emptyAddress);
      setCustomerId(null);
      setCustomerLoaded(true);

      return;
    }

    if (customerLoaded) {
      return;
    }

    let mounted = true;

    async function loadCustomer() {
      setCustomerLoading(true);
      setCustomerError(null);

      try {
        const response = await fetch(
          '/api/checkout/customer',
          {
            method: 'GET',
            credentials: 'include',
          }
        );

        const data =
          await response.json();

        console.log(
          'CHECKOUT CUSTOMER:',
          data
        );

        if (!mounted) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            data?.message ||
            data?.error ||
            'Unable to load customer'
          );
        }

        if (
          !data?.success ||
          !data?.customer
        ) {
          throw new Error(
            'Customer data was not returned'
          );
        }

        const customer =
          data.customer;

        /*
         * SAVE CUSTOMER ID
         */

        if (customer.id) {
          setCustomerId(
            Number(customer.id)
          );
        }

        const customerBilling =
          customer.billing || {};

        const customerShipping =
          customer.shipping || {};

        /*
         * BILLING
         */

        const newBilling:
          CheckoutAddress = {
            firstName:
              customerBilling.firstName ||
              customer.contact?.firstName ||
              '',

            lastName:
              customerBilling.lastName ||
              customer.contact?.lastName ||
              '',

            email:
              customerBilling.email ||
              customer.contact?.email ||
              customer.email ||
              '',

            phone:
              customerBilling.phone ||
              customer.contact?.phone ||
              '',

            address1:
              customerBilling.address1 ||
              '',

            address2:
              customerBilling.address2 ||
              '',

            city:
              customerBilling.city ||
              '',

            state:
              customerBilling.state ||
              '',

            postcode:
              customerBilling.postcode ||
              '',

            country:
              customerBilling.country ||
              'US',
          };

        /*
         * SHIPPING
         */

        let newShipping:
          CheckoutAddress;

        if (
          customerShipping.address1
        ) {
          newShipping = {
            firstName:
              customerShipping.firstName ||
              newBilling.firstName,

            lastName:
              customerShipping.lastName ||
              newBilling.lastName,

            email:
              newBilling.email,

            phone:
              customerShipping.phone ||
              newBilling.phone,

            address1:
              customerShipping.address1 ||
              '',

            address2:
              customerShipping.address2 ||
              '',

            city:
              customerShipping.city ||
              '',

            state:
              customerShipping.state ||
              '',

            postcode:
              customerShipping.postcode ||
              '',

            country:
              customerShipping.country ||
              'US',
          };
        } else {
          newShipping = {
            ...newBilling,
          };
        }

        setBilling(newBilling);
        setShipping(newShipping);

        setCustomerLoaded(true);

      } catch (error) {
        console.error(
          'Failed to load checkout customer:',
          error
        );

        if (mounted) {
          setCustomerError(
            error instanceof Error
              ? error.message
              : 'Unable to load customer'
          );

          /*
           * Do not block checkout.
           */

          setCustomerLoaded(true);
        }

      } finally {
        if (mounted) {
          setCustomerLoading(false);
        }
      }
    }

    loadCustomer();

    return () => {
      mounted = false;
    };

  }, [
    checkoutAuthReady,
    checkoutAuthMethod,
    customerLoaded,
  ]);

  /*
   * Whenever the checkout authentication method changes,
   * discard any previously loaded customer data.
   *
   * The actual authentication session is NOT logged out here.
   */
  useEffect(() => {
    if (!checkoutAuthReady || checkoutAuthMethod === null) {
      return;
    }

    resetCheckoutCustomer();
  }, [
    checkoutAuthReady,
    checkoutAuthMethod,
  ]);

  /*
   * ---------------------------------------------------------
   * DEBUG
   * ---------------------------------------------------------
   */

  useEffect(() => {
    console.log(
      '=== CHECKOUT AUTH ==='
    );

    console.log(
      'Faust authenticated:',
      faustAuthenticated
    );

    console.log(
      'Faust ready:',
      faustReady
    );

    console.log(
      'Google authenticated:',
      googleAuthenticated
    );

    console.log(
      'Google ready:',
      googleAuthReady
    );

    console.log(
      'Checkout auth method:',
      checkoutAuthMethod
    );

    console.log(
      'Checkout authenticated:',
      checkoutAuthenticated
    );

    console.log(
      'Checkout auth ready:',
      checkoutAuthReady
    );

    console.log(
      'Customer ID:',
      customerId
    );

    console.log(
      'Customer loaded:',
      customerLoaded
    );

    console.log(
      'Customer loading:',
      customerLoading
    );

    console.log(
      'Checkout step:',
      checkoutStep
    );

    console.log(
      'Real ID verified:',
      realIdVerified
    );
  }, [
    faustAuthenticated,
    faustReady,
    googleAuthenticated,
    googleAuthReady,
    checkoutAuthMethod,
    checkoutAuthenticated,
    checkoutAuthReady,
    customerId,
    customerLoaded,
    customerLoading,
    checkoutStep,
    realIdVerified,
  ]);

  /*
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
   */

  if (
    !checkoutAuthReady ||
    cartLoading ||
    customerLoading ||
    redirectingToLogin
  ) {
    return (
      <Layout title="Checkout">
        <div
          style={{
            minHeight: '60vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Loading checkout...
        </div>
      </Layout>
    );
  }

  /*
   * ---------------------------------------------------------
   * EMPTY CART
   * ---------------------------------------------------------
   */

  if (
    !cart ||
    !cart.items?.length ||
    !products.length
  ) {
    return (
      <Layout title="Checkout">
        <div
          style={{
            minHeight: '60vh',
            padding: '80px 20px',
            textAlign: 'center',
          }}
        >
          <h2>
            Your cart is empty
          </h2>

          <button
            type="button"
            onClick={() =>
              router.push('/shop')
            }
            style={{
              marginTop: 20,
              padding: '14px 30px',
              cursor: 'pointer',
            }}
          >
            Continue Shopping
          </button>
        </div>
      </Layout>
    );
  }

  /*
   * ---------------------------------------------------------
   * CHECKOUT
   * ---------------------------------------------------------
   */

  return (
    <Layout title="Checkout">

      {/* =====================================================
          SHIPPING / CHECKOUT
          ===================================================== */}

      {checkoutStep === 'shipping' && (
        <MellowCheckout
          isAuthenticated={
            checkoutAuthenticated
          }

          checkoutAuthMethod={
            checkoutAuthMethod
          }

          billing={billing}

          shipping={shipping}

          products={products}

          subtotal={subtotal}

          shippingMethods={
            shippingMethods
          }

          selectedShipping={
            selectedShipping
          }

          selectedShippingMethod={
            selectedShippingMethod
          }

          onBillingChange={
            setBilling
          }

          onShippingChange={
            setShipping
          }

         onShippingChangeMethod={
          handleShippingMethodChange
        }

          onContinueToBilling={() => {
            console.log(
              'GOING TO BILLING'
            );

            setCheckoutStep(
              'billing'
            );
          }}
        />
      )}

      {/* =====================================================
          BILLING
          ===================================================== */}

      {checkoutStep === 'billing' && (
        <BillingStep
          billing={billing}

          shipping={shipping}

          products={products}

          subtotal={subtotal}

          shippingPrice={
            selectedShippingMethod.price
          }

//           shippingPrice={
//   selectedShippingMethod
//     ? parsePrice(selectedShippingMethod.cost)
//     : 0
// }

          onBillingChange={
            setBilling
          }

          onBack={() => {
            setCheckoutStep(
              'shipping'
            );
          }}

          onContinue={() => {
            console.log(
              'BILLING COMPLETED:',
              billing
            );

            /*
             * Move to Real ID.
             */

            setCheckoutStep(
              'real-id'
            );
          }}
        />
      )}

      {/* =====================================================
          REAL ID
          ===================================================== */}

      {checkoutStep === 'real-id' && (
        <RealIdStep
          customer={{
            id: customerId,

            email:
              billing.email,

            firstName:
              billing.firstName,

            lastName:
              billing.lastName,
          }}

          onBack={() => {
            console.log(
              'BACK TO BILLING'
            );

            setCheckoutStep(
              'billing'
            );
          }}

          onContinue={() => {
            console.log(
              'REAL ID VERIFIED - GOING TO PAYMENT'
            );

            /*
             * Your current RealIdStep calls
             * onContinue only after:
             *
             * Real ID verification succeeds.
             */

            setRealIdVerified(true);

            /*
             * We don't receive the check ID
             * from your current RealIdStep.
             */

            setRealIdCheckId(null);

            /*
             * THIS IS THE IMPORTANT PART.
             */

            setCheckoutStep(
              'payment'
            );
          }}
        />
      )}

      {/* =====================================================
          PAYMENT
          ===================================================== */}

      {checkoutStep === 'payment' && (
        <PaymentStep
          products={products}

          subtotal={subtotal}

          shippingPrice={
            selectedShippingMethod.price
          }

//           shippingPrice={
//   selectedShippingMethod
//     ? parsePrice(selectedShippingMethod.cost)
//     : 0
// }

          onBack={() => {
            console.log(
              'BACK TO REAL ID'
            );

            setCheckoutStep(
              'real-id'
            );
          }}

          onPlaceOrder={(paymentData) => {
            console.log(
              'PAYMENT DATA:',
              paymentData
            );

            console.log(
              'REAL ID VERIFIED:',
              realIdVerified
            );

            console.log(
              'REAL ID CHECK ID:',
              realIdCheckId
            );

            console.log(
              'CUSTOMER ID:',
              customerId
            );

            /*
             * IMPORTANT:
             *
             * Payment UI + validation works here.
             *
             * Your existing Authorize.net
             * payment processing should be
             * connected here next.
             */
          }}
        />
      )}

    </Layout>
  );
}