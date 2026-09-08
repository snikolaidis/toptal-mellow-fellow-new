import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import Layout from "@/components/Layout";
import MellowCheckout from "@/components/checkout/MellowCheckout";
import BillingStep from "@/components/checkout/BillingStep";
import RealIdStep from "@/components/checkout/RealIdStep";
import PaymentStep from "@/components/checkout/PaymentStep";

import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";

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
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  postcode: "",
  country: "US",
};

type RememberMeOption =
  | "do_not_remember"
  | "remember_30"
  | "remember_60"
  | "remember_90";

interface StoredRealIdRemember {
  checkId: string;
  expiresAt: number;
  rememberOption?: RememberMeOption;
}

interface RememberedRealIdData {
  checkId: string;
  rememberOption: RememberMeOption;
}

const REAL_ID_REMEMBER_KEY_PREFIX = "realIdRemember:";

function getRealIdRememberKey(
  customerId: number | null,
  email: string,
): string | null {
  if (customerId) {
    return `${REAL_ID_REMEMBER_KEY_PREFIX}customer:${customerId}`;
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  return `${REAL_ID_REMEMBER_KEY_PREFIX}email:${encodeURIComponent(
    normalizedEmail,
  )}`;
}

function getRememberDays(rememberOption: RememberMeOption): number | null {
  switch (rememberOption) {
    case "remember_30":
      return 30;

    case "remember_60":
      return 60;

    case "remember_90":
      return 90;

    default:
      return null;
  }
}

/*
 * Clear only the browser-side Real ID state that can cause the
 * SDK to resume an older completed verification.
 *
 * This is called ONLY when there is no valid Remember Me record.
 */
function clearRealIdVerificationState(): void {
  if (typeof window === "undefined") {
    return;
  }

  const oldCheckId = window.localStorage.getItem("real-id-check-id");

  window.localStorage.removeItem("mf_age_verified");

  window.localStorage.removeItem("real-id-check-id");

  if (oldCheckId) {
    window.localStorage.removeItem(`real-id-check-${oldCheckId}-completed`);
  }
}

function getRememberedRealIdData(
  customerId: number | null,
  email: string,
): RememberedRealIdData | null {
  if (typeof window === "undefined") {
    return null;
  }

  const key = getRealIdRememberKey(customerId, email);

  if (!key) {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(key);

    if (!storedValue) {
      return null;
    }

    const stored: StoredRealIdRemember = JSON.parse(storedValue);

    /*
     * Missing/invalid/expired Remember Me record.
     */
    if (
      !stored?.checkId ||
      !stored?.expiresAt ||
      stored.expiresAt <= Date.now()
    ) {
      window.localStorage.removeItem(key);
      return null;
    }

    return {
      checkId: stored.checkId,
      rememberOption: stored.rememberOption || "remember_30",
    };
  } catch (error) {
    console.warn("Unable to read remembered Real ID verification:", error);

    window.localStorage.removeItem(key);

    return null;
  }
}

function getRememberedRealIdCheck(
  customerId: number | null,
  email: string,
): string | null {
  return getRememberedRealIdData(customerId, email)?.checkId ?? null;
}

function saveRememberedRealIdCheck(
  customerId: number | null,
  email: string,
  checkId: string,
  rememberOption: RememberMeOption,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const key = getRealIdRememberKey(customerId, email);

  if (!key) {
    return;
  }

  const rememberDays = getRememberDays(rememberOption);

  try {
    /*
     * DO NOT REMEMBER:
     *
     * Remove our Remember Me record.
     * We intentionally do not create any new Remember Me data.
     */
    if (!rememberDays) {
      window.localStorage.removeItem(key);
      return;
    }

    const expiresAt = Date.now() + rememberDays * 24 * 60 * 60 * 1000;

    const value: StoredRealIdRemember = {
      checkId,
      expiresAt,
      rememberOption,
    };

    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("Unable to save remembered Real ID verification:", error);
  }
}

function parsePrice(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const number = parseFloat(value.replace(/[^0-9.-]+/g, ""));

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

  const {
    cart,
    isLoading: cartLoading,
    updateShippingMethod,
    clearCart,
  } = useCart();

  /*
   * ---------------------------------------------------------
   * MELLOW FELLOW / FAUST AUTH
   * ---------------------------------------------------------
   */

  const { isAuthenticated: faustAuthenticated, isReady: faustReady } =
    useAuth();

  /*
   * ---------------------------------------------------------
   * GOOGLE AUTH
   * ---------------------------------------------------------
   */

  const [googleAuthenticated, setGoogleAuthenticated] = useState<
    boolean | null
  >(null);

  const [googleAuthReady, setGoogleAuthReady] = useState(false);

  type CheckoutAuthMethod = "google" | "mellow" | "guest" | null;

  const CHECKOUT_AUTH_KEY = "checkoutAuthMethod";
  const GUEST_EMAIL_KEY = "checkoutGuestEmail";

  const [checkoutAuthMethod, setCheckoutAuthMethod] =
    useState<CheckoutAuthMethod>(null);

  useEffect(() => {
    let mounted = true;

    async function checkGoogleSession() {
      try {
        const response = await fetch("/api/auth/session", {
          method: "GET",
          credentials: "include",
        });

        const data = await response.json();

        if (!mounted) {
          return;
        }

        setGoogleAuthenticated(response.ok && data?.isAuthenticated === true);
      } catch (error) {
        console.error("Google checkout session check failed:", error);

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

  const checkoutAuthReady = faustReady && googleAuthReady;

  /*
   * ---------------------------------------------------------
   * CHECKOUT AUTH METHOD
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!checkoutAuthReady) {
      return;
    }

    let storedMethod: CheckoutAuthMethod = null;

    try {
      const value = sessionStorage.getItem(CHECKOUT_AUTH_KEY);

      if (value === "google" || value === "mellow" || value === "guest") {
        storedMethod = value;
      }
    } catch (error) {
      console.warn("Unable to read checkout auth method:", error);
    }

    if (faustAuthenticated === true) {
      setCheckoutAuthMethod("mellow");

      return;
    }

    if (googleAuthenticated === true) {
      setCheckoutAuthMethod("google");

      return;
    }

    if (storedMethod === "guest") {
      setCheckoutAuthMethod("guest");
    } else {
      setCheckoutAuthMethod("guest");
    }
  }, [checkoutAuthReady, faustAuthenticated, googleAuthenticated]);

  const checkoutAuthenticated =
    checkoutAuthMethod === "google" || checkoutAuthMethod === "mellow";

  /*
   * ---------------------------------------------------------
   * ADDRESS STATE
   * ---------------------------------------------------------
   */

  const [billing, setBilling] = useState<CheckoutAddress>(emptyAddress);

  const [shipping, setShipping] = useState<CheckoutAddress>(emptyAddress);

  const [customerLoaded, setCustomerLoaded] = useState(false);

  const [customerLoading, setCustomerLoading] = useState(false);

  const [customerError, setCustomerError] = useState<string | null>(null);

  /*
   * ---------------------------------------------------------
   * CUSTOMER ID
   * ---------------------------------------------------------
   */

  const [customerId, setCustomerId] = useState<number | null>(null);

  /*
   * ---------------------------------------------------------
   * REAL ID
   * ---------------------------------------------------------
   */

  const [realIdVerified, setRealIdVerified] = useState(false);

  const [realIdCheckId, setRealIdCheckId] = useState<string | null>(null);

  /*
   * ---------------------------------------------------------
   * SHIPPING
   * ---------------------------------------------------------
   */

  const [selectedShipping, setSelectedShipping] = useState<string | null>(null);

  /*
   * ---------------------------------------------------------
   * CHECKOUT STEP
   * ---------------------------------------------------------
   */

  const [checkoutStep, setCheckoutStep] = useState<
    "shipping" | "billing" | "real-id" | "payment"
  >("shipping");

  /*
   * Scroll to top whenever checkout page/step changes.
   */
  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [router.asPath, checkoutStep]);

  /*
   * ---------------------------------------------------------
   * PRODUCTS
   * ---------------------------------------------------------
   */

  const products: CheckoutProduct[] = useMemo(() => {
    if (!cart?.items?.length) {
      return [];
    }

    return cart.items.map((item: any) => {
      const price = parsePrice(
        item?.bbLocked && typeof item?.bbUnitPrice === "number"
          ? item.bbUnitPrice
          : item?.product?.price,
      );

      const quantity = Number(item?.quantity) > 0 ? Number(item.quantity) : 1;

      const total = parsePrice(item?.total);

      return {
        id: item?.product?.databaseId || item?.product?.id || item?.key,

        name: item?.product?.name || "Product",

        quantity,

        price,

        total: total > 0 ? total : price * quantity,

        image: item?.product?.image?.sourceUrl || "",
      };
    });
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

    const cartSubtotal = parsePrice(cart.subtotal);

    if (cartSubtotal > 0) {
      return cartSubtotal;
    }

    return products.reduce(
      (sum, product) => sum + product.price * product.quantity,
      0,
    );
  }, [cart, products]);

  /*
   * ---------------------------------------------------------
   * SHIPPING METHODS
   * ---------------------------------------------------------
   */

  const wpShippingMethods = cart?.availableShippingMethods?.[0]?.rates || [];

  const shippingMethods: ShippingMethod[] = wpShippingMethods.map(
    (method: any) => ({
      id: method.id,
      name: method.label || method.name || "",
      price: parsePrice(method.cost),
      description: method.description || "",
    }),
  );

  const chosenShippingMethod = cart?.chosenShippingMethods?.[0] || null;

  const selectedShippingMethod =
    shippingMethods.find((method) => method.id === selectedShipping) ||
    shippingMethods.find((method) => method.id === chosenShippingMethod) ||
    shippingMethods[0] ||
    null;

  /*
   * Keep selected shipping method in sync
   * with WooCommerce.
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
      setSelectedShipping(shippingMethods[0].id);
    }
  }, [shippingMethods, chosenShippingMethod, selectedShipping]);

  const handleShippingMethodChange = async (methodId: string) => {
    setSelectedShipping(methodId);

    try {
      await updateShippingMethod(methodId);
    } catch (error) {
      console.error("Failed to update shipping method:", error);
    }
  };

  const handleSaveBilling = async () => {
    try {
      const response = await fetch("/api/checkout/customer", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          billing,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.message || data?.error || "Unable to save billing address.",
        );
      }

      return data.message || "Billing address updated successfully.";
    } catch (error) {
      console.error("Failed to save billing address:", error);

      throw error;
    }
  };
  /*
   * ---------------------------------------------------------
   * PLACE ORDER
   * ---------------------------------------------------------
   */

  const handlePlaceOrder = async (paymentData: {
    opaqueData: {
      dataDescriptor: string;
      dataValue: string;
    };
  }) => {
    const csrfResponse = await fetch("/api/csrf-token", {
      credentials: "include",
    });

    const csrfData = await csrfResponse.json();

    if (!csrfResponse.ok || !csrfData?.token) {
      throw new Error(
        "Unable to start a secure payment. Please refresh and try again.",
      );
    }

    const idempotencyKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const total = subtotal + (selectedShippingMethod?.price || 0);

    const response = await fetch("/api/checkout", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfData.token,
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        billing,
        shipping,
        paymentNonce: paymentData.opaqueData,
        amount: cart?.total || total.toFixed(2),
        items: products.map((product) => ({
          productId: Number(product.id),
          name: product.name,
          quantity: product.quantity,
          price: product.price.toFixed(2),
        })),
        coupons: cart?.appliedCoupons?.map((coupon: any) => coupon.code) || [],
        realIdCheckId: realIdVerified ? realIdCheckId || undefined : undefined,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result?.success) {
      throw new Error(
        result?.message || "Payment could not be completed. Please try again.",
      );
    }

    await clearCart().catch(() => undefined);

    await router.push({
      pathname: "/order-confirmation",
      query: {
        orderId: result.orderId,
        total: result.amountCharged
          ? `$${result.amountCharged}`
          : `$${total.toFixed(2)}`,
        firstName: billing.firstName || "",
      },
    });
  };

  /*
   * ---------------------------------------------------------
   * RESET CHECKOUT CUSTOMER
   * ---------------------------------------------------------
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
   */

  useEffect(() => {
    if (!checkoutAuthReady) {
      return;
    }

    /*
     * Guest
     */
    if (checkoutAuthMethod === "guest" || checkoutAuthMethod === null) {
      let guestEmail = "";

      try {
        guestEmail = sessionStorage.getItem(GUEST_EMAIL_KEY) || "";
      } catch (error) {
        console.warn("Unable to read guest email:", error);
      }

      setBilling({ ...emptyAddress, email: guestEmail });

      setShipping({ ...emptyAddress, email: guestEmail });

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
        const response = await fetch("/api/checkout/customer", {
          method: "GET",
          credentials: "include",
        });

        const data = await response.json();

        if (!mounted) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            data?.message || data?.error || "Unable to load customer",
          );
        }

        if (!data?.success || !data?.customer) {
          throw new Error("Customer data was not returned");
        }

        const customer = data.customer;

        /*
         * SAVE CUSTOMER ID
         */
        if (customer.id) {
          setCustomerId(Number(customer.id));
        }

        const customerBilling = customer.billing || {};

        const customerShipping = customer.shipping || {};

        /*
         * BILLING
         */
        const newBilling: CheckoutAddress = {
          firstName: customerBilling.firstName || "",

          lastName: customerBilling.lastName || "",

          email: customerBilling.email || customer.email || "",

          phone: customerBilling.phone || "",

          address1: customerBilling.address1 || "",

          address2: customerBilling.address2 || "",

          city: customerBilling.city || "",

          state: customerBilling.state || "",

          postcode: customerBilling.postcode || "",

          country: customerBilling.country || "US",
        };

        /*
         * SHIPPING
         */
        let newShipping: CheckoutAddress;

        if (customerShipping.address1) {
          newShipping = {
            firstName: customerShipping.firstName || newBilling.firstName,

            lastName: customerShipping.lastName || newBilling.lastName,

            email: newBilling.email,

            phone: customerShipping.phone || newBilling.phone,

            address1: customerShipping.address1 || "",

            address2: customerShipping.address2 || "",

            city: customerShipping.city || "",

            state: customerShipping.state || "",

            postcode: customerShipping.postcode || "",

            country: customerShipping.country || "US",
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
        console.error("Failed to load checkout customer:", error);

        if (mounted) {
          setCustomerError(
            error instanceof Error
              ? error.message
              : "Unable to load checkout customer",
          );

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
  }, [checkoutAuthReady, checkoutAuthMethod, customerLoaded]);

  /*
   * Whenever checkout authentication changes,
   * discard loaded customer data.
   */
  useEffect(() => {
    if (!checkoutAuthReady || checkoutAuthMethod === null) {
      return;
    }

    resetCheckoutCustomer();
  }, [checkoutAuthReady, checkoutAuthMethod]);

  /*
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
   */

  if (!checkoutAuthReady || cartLoading || customerLoading) {
    return (
      <Layout title="Checkout">
        <div
          style={{
            minHeight: "60vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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

  if (!cart || !cart.items?.length || !products.length) {
    return (
      <Layout title="Checkout">
        <div
          style={{
            minHeight: "60vh",
            padding: "80px 20px",
            textAlign: "center",
          }}
        >
          <h2>Your cart is empty</h2>

          <button
            type="button"
            onClick={() => router.push("/shop")}
            style={{
              marginTop: 20,
              padding: "14px 30px",
              cursor: "pointer",
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

      {checkoutStep === "shipping" && (
        <MellowCheckout
          isAuthenticated={checkoutAuthenticated}
          checkoutAuthMethod={checkoutAuthMethod}
          billing={billing}
          shipping={shipping}
          products={products}
          subtotal={subtotal}
          shippingMethods={shippingMethods}
          selectedShipping={selectedShipping ?? ''}
          selectedShippingMethod={selectedShippingMethod}
          onBillingChange={setBilling}
          onShippingChange={setShipping}
          onShippingChangeMethod={handleShippingMethodChange}
          onContinueToBilling={() => {
            setCheckoutStep("billing");
          }}
        />
      )}

      {/* =====================================================
          BILLING
          ===================================================== */}

      {checkoutStep === "billing" && (
        <BillingStep
          billing={billing}
          shipping={shipping}
          products={products}
          subtotal={subtotal}
          shippingPrice={
            selectedShippingMethod ? selectedShippingMethod.price : 0
          }
          onBillingChange={setBilling}
          onSaveBilling={handleSaveBilling}
          onBack={() => {
            setCheckoutStep("shipping");
          }}
          onContinue={() => {
            /*
             * -------------------------------------------------
             * REMEMBERED REAL ID
             * -------------------------------------------------
             *
             * Valid Remember Me:
             *   Billing -> Payment
             *
             * No Remember Me / expired:
             *   Clear old SDK state -> Real ID
             */
            const rememberedCheckId = getRememberedRealIdCheck(
              customerId,
              billing.email,
            );

            if (rememberedCheckId) {
              console.log(
                `[RealID][remember-me] skipping verification, reusing checkId=${rememberedCheckId} for customerId=${customerId} email=${billing.email}`,
              );

              setRealIdVerified(true);

              setRealIdCheckId(rememberedCheckId);

              setCheckoutStep("real-id");

              return;
            }

            /*
             * IMPORTANT:
             *
             * If there is no valid Remember Me record,
             * remove the old browser Real ID state.
             *
             * This prevents RealIdVerification / SDK from
             * reusing an old completed check after:
             *
             * - Remember Me expires
             * - user selected Do not remember
             */
            clearRealIdVerificationState();

            setRealIdVerified(false);

            setRealIdCheckId(null);

            setCheckoutStep("real-id");
          }}
        />
      )}

      {/* =====================================================
          REAL ID
          ===================================================== */}

      {checkoutStep === "real-id" && (() => {
        const rememberedData = getRememberedRealIdData(customerId, billing.email);
        return (
        <RealIdStep
          customer={{
            id: customerId,

            email: billing.email,

            firstName: billing.firstName,

            lastName: billing.lastName,
          }}
          initialCheckId={rememberedData?.checkId || realIdCheckId}
          initialRememberOption={rememberedData?.rememberOption}
          onBack={() => {
            setCheckoutStep("billing");
          }}
          onContinue={(checkId, rememberOption) => {
            /*
             * REMEMBER ME ONLY.
             *
             * do_not_remember:
             *   removes our Remember Me record.
             *
             * remember_30:
             *   saves for 30 days.
             *
             * remember_60:
             *   saves for 60 days.
             *
             * remember_90:
             *   saves for 90 days.
             */
            saveRememberedRealIdCheck(
              customerId,
              billing.email,
              checkId,
              rememberOption,
            );

            setRealIdVerified(true);

            setRealIdCheckId(checkId);

            setCheckoutStep("payment");
          }}
        />
        );
      })()}

      {/* =====================================================
          PAYMENT
          ===================================================== */}

      {checkoutStep === "payment" && (
        <PaymentStep
          products={products}
          subtotal={subtotal}
          shippingPrice={
            selectedShippingMethod ? selectedShippingMethod.price : 0
          }
          onBack={() => {
            setCheckoutStep("real-id");
          }}
          onPlaceOrder={handlePlaceOrder}
        />
      )}
    </Layout>
  );
}
