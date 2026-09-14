import styles from "./MellowCheckout.module.css";
import { useEffect, useState } from "react";
import { getApolloAuthClient, useAuth } from "@faustwp/core";
import { useMutation } from "@apollo/client";
import { UPDATE_CUSTOMER } from "@/graphql/queries/auth";
import { useCart } from "@/context/CartContext";
import FreeShippingUpsell from "./FreeShippingUpsell";

interface Address {
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

interface Product {
  id: number | string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  image: string;
}

interface ShippingMethod {
  id: string;
  name: string;
  price: number;
  description?: string;
}

interface MellowCheckoutProps {
  isAuthenticated: boolean;
  checkoutAuthMethod?: "google" | "mellow" | "guest" | null;
  billing: Address;
  shipping: Address;
  products: Product[];
  subtotal: number;
  shippingMethods: ShippingMethod[];
  selectedShipping: string;
  selectedShippingMethod: ShippingMethod;
  // "Forgot Something?" order-confirmation add-on within its window -
  // the method picker above still shows each method's real price (so
  // it remains a meaningful comparison), but the summary total here
  // reflects what will actually be charged.
  shippingWaiverActive?: boolean;
  onBillingChange: (value: Address) => void;
  onShippingChange: (value: Address) => void;
  onShippingChangeMethod: (value: string) => void;
  onContinueToBilling: () => void;
}

export default function MellowCheckout({
  isAuthenticated,
  checkoutAuthMethod,
  billing,
  shipping,
  products,
  subtotal,
  shippingMethods,
  selectedShipping,
  selectedShippingMethod,
  shippingWaiverActive = false,
  onBillingChange,
  onShippingChange,
  onShippingChangeMethod,
  onContinueToBilling,
}: MellowCheckoutProps) {
  const { isAuthenticated: faustAuthenticated } = useAuth();
  const { cart } = useCart();
  const client = getApolloAuthClient();
  const isGuestCheckout = checkoutAuthMethod === "guest";

  const [updateCustomer, { loading: savingCustomer }] = useMutation(
    UPDATE_CUSTOMER,
    {
      client,
    },
  );

  /*
   * Controls whether Contact Information is being edited.
   *
   * Logged-in users start in summary mode.
   * Guest users start in edit mode.
   */
  const [editingContact, setEditingContact] = useState(!isAuthenticated);

  /*
   * Controls whether Shipping Address is being edited.
   *
   * Logged-in users start in summary mode.
   * Guest users start in edit mode.
   */
  const [editingShipping, setEditingShipping] = useState(!isAuthenticated);

  /*
   * Prevent customer API from being loaded repeatedly.
   */
  const [customerLoaded, setCustomerLoaded] = useState(false);

  /*
   * Load logged-in WooCommerce customer.
   */
  useEffect(() => {
    if (!isAuthenticated) {
      setEditingContact(true);
      setEditingShipping(true);
      return;
    }

    if (customerLoaded) {
      return;
    }

    const loadCustomer = async () => {
      try {
        const response = await fetch("/api/checkout/customer");
        const data = await response.json();
        if (!response.ok || !data.success || !data.customer) {
          console.error("Unable to load checkout customer:", data);

          return;
        }

        const customer = data.customer;


        /*
         * Billing data
         */
        const customerBilling: Address = {
          firstName:
            customer.billing?.firstName || customer.contact?.firstName || "",

          lastName:
            customer.billing?.lastName || customer.contact?.lastName || "",

          email:
            customer.billing?.email ||
            customer.contact?.email ||
            customer.email ||
            "",

          phone: customer.billing?.phone || customer.contact?.phone || "",

          address1: customer.billing?.address1 || "",

          address2: customer.billing?.address2 || "",

          city: customer.billing?.city || "",

          state: customer.billing?.state || "",

          postcode: customer.billing?.postcode || "",

          country: customer.billing?.country || "US",
        };

        /*
         * Shipping data
         */
        const customerShipping: Address = {
          firstName:
            customer.shipping?.firstName ||
            customer.billing?.firstName ||
            customer.contact?.firstName ||
            "",

          lastName:
            customer.shipping?.lastName ||
            customer.billing?.lastName ||
            customer.contact?.lastName ||
            "",

          email:
            customer.billing?.email ||
            customer.contact?.email ||
            customer.email ||
            "",

          phone:
            customer.shipping?.phone ||
            customer.billing?.phone ||
            customer.contact?.phone ||
            "",

          address1: customer.shipping?.address1 || "",

          address2: customer.shipping?.address2 || "",

          city: customer.shipping?.city || "",

          state: customer.shipping?.state || "",

          postcode: customer.shipping?.postcode || "",

          country: customer.shipping?.country || "US",
        };

        /*
         * Send customer data to checkout page.
         */
        onBillingChange(customerBilling);

        onShippingChange(customerShipping);

        /*
         * Logged-in user starts in summary mode.
         */
        setEditingContact(false);
        setEditingShipping(false);

        setCustomerLoaded(true);
      } catch (error) {
        console.error("Failed to load checkout customer:", error);
      }
    };

    loadCustomer();
  }, [isAuthenticated, customerLoaded, onBillingChange, onShippingChange]);

  /*
   * When authentication changes from guest
   * to logged-in, reset editing states.
   */
  useEffect(() => {
    if (isAuthenticated) {
      setEditingContact(false);
      setEditingShipping(false);
    } else {
      setEditingContact(true);
      setEditingShipping(true);
    }
  }, [isAuthenticated]);

  /*
   * Update billing field.
   */
  const updateBilling = (field: keyof Address, value: string) => {
    onBillingChange({
      ...billing,
      [field]: value,
    });
  };

  /*
   * Update shipping field.
   */
  const updateShipping = (field: keyof Address, value: string) => {
    onShippingChange({
      ...shipping,
      [field]: value,
    });
  };

  /*
   * Save billing/contact information.
   *
   * Guest checkout only updates local checkout state.
   * Authenticated users also persist the address to the
   * logged-in WooCommerce customer profile.
   */
  // const saveContact = async () => {
  //   if (isAuthenticated) {
  //     try {
  //       await updateCustomer({
  //         variables: {
  //           input: {
  //             billing: {
  //               firstName: billing.firstName,
  //               lastName: billing.lastName,
  //               email: billing.email,
  //               phone: billing.phone,
  //               address1: billing.address1,
  //               address2: billing.address2 || '',
  //               city: billing.city,
  //               state: billing.state,
  //               postcode: billing.postcode,
  //               country: billing.country,
  //             },
  //           },
  //         },
  //       });
  //     } catch (error) {
  //       console.error(
  //         'Failed to save customer billing information:',
  //         error
  //       );
  //       return;
  //     }
  //   }

  //   setEditingContact(false);
  // };

  // const saveContact = async () => {
  //   try {
  //     const sessionResponse = await fetch(
  //       '/api/auth/session',
  //       {
  //         credentials: 'include',
  //       }
  //     );

  //     const session =
  //       await sessionResponse.json();

  //     /*
  //      * Only Google users use this new save API.
  //      *
  //      * Mellow Fellow and Guest remain unchanged.
  //      */
  //     if (
  //       sessionResponse.ok &&
  //       session?.isAuthenticated === true
  //     ) {
  //       const response = await fetch(
  //         '/api/checkout/google-customer',
  //         {
  //           method: 'POST',
  //           credentials: 'include',
  //           headers: {
  //             'Content-Type': 'application/json',
  //           },
  //           body: JSON.stringify({
  //             billing,
  //           }),
  //         }
  //       );

  //       const data =
  //         await response.json();

  //       if (!response.ok || !data.success) {
  //         console.error(
  //           'Google billing save failed:',
  //           data
  //         );

  //         return;
  //       }
  //     }

  //     setEditingContact(false);

  //   } catch (error) {
  //     console.error(
  //       'Google billing save error:',
  //       error
  //     );
  //   }
  // };

  const saveContact = async () => {
    /*
     * MELLOW FELLOW
     */
    if (faustAuthenticated) {
      try {
        await updateCustomer({
          variables: {
            input: {
              billing: {
                firstName: billing.firstName,
                lastName: billing.lastName,
                email: billing.email,
                phone: billing.phone,
                address1: billing.address1,
                address2: billing.address2,
                city: billing.city,
                state: billing.state,
                postcode: billing.postcode,
                country: billing.country,
              },

              shipping: {
                firstName: shipping.firstName,
                lastName: shipping.lastName,
                address1: shipping.address1,
                address2: shipping.address2,
                city: shipping.city,
                state: shipping.state,
                postcode: shipping.postcode,
                country: shipping.country,
              },
            },
          },
        });

      } catch (error) {
        console.error("Mellow Fellow billing update failed:", error);

        return;
      }

      setEditingContact(false);
      return;
    }

    /*
     * GUEST
     *
     * No account to persist to - the address is only kept in
     * local checkout state via onBillingChange/updateBilling.
     */
    if (isGuestCheckout) {
      setEditingContact(false);
      return;
    }

    /*
     * GOOGLE
     */
    try {
      const response = await fetch("/api/checkout/google-customer", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          billing: {
            firstName: billing.firstName,
            lastName: billing.lastName,
            email: billing.email,
            phone: billing.phone,
            address1: billing.address1,
            address2: billing.address2,
            city: billing.city,
            state: billing.state,
            postcode: billing.postcode,
            country: billing.country,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error("Google billing address update failed:", data);

        return;
      }

      setEditingContact(false);
    } catch (error) {
      console.error("Google billing address save failed:", error);
    }
  };
  /*
   * Save shipping information.
   *
   * Guest checkout only updates local checkout state.
   * Authenticated users also persist the address to the
   * logged-in WooCommerce customer profile.
   */
  // const saveShipping = async () => {
  //   if (isAuthenticated) {
  //     try {
  //       await updateCustomer({
  //         variables: {
  //           input: {
  //             shipping: {
  //               firstName: shipping.firstName,
  //               lastName: shipping.lastName,
  //               address1: shipping.address1,
  //               address2: shipping.address2 || '',
  //               city: shipping.city,
  //               state: shipping.state,
  //               postcode: shipping.postcode,
  //               country: shipping.country,
  //             },
  //           },
  //         },
  //       });
  //     } catch (error) {
  //       console.error(
  //         'Failed to save customer shipping information:',
  //         error
  //       );
  //       return;
  //     }
  //   }

  //   setEditingShipping(false);
  // };

  // const saveShipping = async () => {
  //   try {
  //     const sessionResponse = await fetch(
  //       '/api/auth/session',
  //       {
  //         credentials: 'include',
  //       }
  //     );

  //     const session =
  //       await sessionResponse.json();

  //     if (
  //       sessionResponse.ok &&
  //       session?.isAuthenticated === true
  //     ) {
  //       const response = await fetch(
  //         '/api/checkout/google-customer',
  //         {
  //           method: 'POST',
  //           credentials: 'include',
  //           headers: {
  //             'Content-Type': 'application/json',
  //           },
  //           body: JSON.stringify({
  //             shipping,
  //           }),
  //         }
  //       );

  //       const data =
  //         await response.json();

  //       if (!response.ok || !data.success) {
  //         console.error(
  //           'Google shipping save failed:',
  //           data
  //         );

  //         return;
  //       }
  //     }

  //     setEditingShipping(false);

  //   } catch (error) {
  //     console.error(
  //       'Google shipping save error:',
  //       error
  //     );
  //   }
  // };

  const saveShipping = async () => {
    /*
     * MELLOW FELLOW
     */
    if (faustAuthenticated) {
      try {
        await updateCustomer({
          variables: {
            input: {
              billing: {
                firstName: billing.firstName,
                lastName: billing.lastName,
                email: billing.email,
                phone: billing.phone,
                address1: billing.address1,
                address2: billing.address2,
                city: billing.city,
                state: billing.state,
                postcode: billing.postcode,
                country: billing.country,
              },

              shipping: {
                firstName: shipping.firstName,
                lastName: shipping.lastName,
                address1: shipping.address1,
                address2: shipping.address2,
                city: shipping.city,
                state: shipping.state,
                postcode: shipping.postcode,
                country: shipping.country,
              },
            },
          },
        });

        console.log("Mellow Fellow shipping address saved");
      } catch (error) {
        console.error("Mellow Fellow shipping update failed:", error);

        return;
      }

      setEditingShipping(false);
      return;
    }

    /*
     * GUEST
     *
     * No account to persist to - the address is only kept in
     * local checkout state via onShippingChange/updateShipping.
     */
    if (isGuestCheckout) {
      setEditingShipping(false);
      return;
    }

    /*
     * GOOGLE
     */
    try {
      const response = await fetch("/api/checkout/google-customer", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shipping: {
            firstName: shipping.firstName,
            lastName: shipping.lastName,
            address1: shipping.address1,
            address2: shipping.address2,
            city: shipping.city,
            state: shipping.state,
            postcode: shipping.postcode,
            country: shipping.country,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error("Google shipping address update failed:", data);

        return;
      }

      setEditingShipping(false);
    } catch (error) {
      console.error("Google shipping address save failed:", error);
    }
  };
  const subtotalAmount =
    (cart?.total?.replace("$", "") as any) * 1 - selectedShippingMethod.price;

  const displayedTotal = shippingWaiverActive
    ? subtotalAmount
    : (cart?.total?.replace("$", "") as any) * 1;

  return (
    <div className={styles.wrapper}>
      <div className={styles.checkoutContainer}>
        {/* =====================================================
            LEFT
        ====================================================== */}
        <main className={styles.left}>
          {/* Progress */}
          <div className={styles.progress}>
            <span className={styles.active}>Checkout</span>
            <span>›</span>
            <span>Shipping</span>
            <span>›</span>
            <span>Billing</span>
            <span>›</span>
            <span>Real ID</span>
            <span>›</span>
            <span>Payment</span>
          </div>

          {/* =================================================
              CONTACT INFORMATION
          ================================================== */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>Contact Information</h3>

              {!editingContact && (
                <button
                  type="button"
                  className={styles.editButton}
                  onClick={() => setEditingContact(true)}
                  aria-label="Edit contact information"
                >
                  ✎
                </button>
              )}
            </div>

            {editingContact ? (
              /*
               * EDIT CONTACT
               */
              <div className={styles.guestForm}>
                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>First Name *</label>

                    <input
                      value={billing.firstName}
                      onChange={(e) =>
                        updateBilling("firstName", e.target.value)
                      }
                    />
                  </div>

                  <div className={styles.field}>
                    <label>Last Name *</label>

                    <input
                      value={billing.lastName}
                      onChange={(e) =>
                        updateBilling("lastName", e.target.value)
                      }
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label>Email Address *</label>

                  <input
                    type="email"
                    value={billing.email}
                    onChange={(e) => updateBilling("email", e.target.value)}
                    readOnly={isGuestCheckout}
                  />
                </div>

                <div className={styles.field}>
                  <label>Phone Number *</label>

                  <input
                    type="tel"
                    value={billing.phone}
                    onChange={(e) => updateBilling("phone", e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  className={styles.continueBtn}
                  onClick={saveContact}
                >
                  SAVE
                </button>
              </div>
            ) : (
              /*
               * CONTACT SUMMARY
               */
              <div className={styles.info}>
                <strong>
                  {billing.firstName} {billing.lastName}
                </strong>

                {billing.email && <p>{billing.email}</p>}

                {billing.phone && <p>{billing.phone}</p>}
              </div>
            )}
          </section>

          {/* =================================================
              SHIPPING ADDRESS
          ================================================== */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>Shipping Address</h3>

              {!editingShipping && (
                <button
                  type="button"
                  className={styles.editButton}
                  onClick={() => setEditingShipping(true)}
                  aria-label="Edit shipping address"
                >
                  ✎
                </button>
              )}
            </div>

            {editingShipping ? (
              /*
               * EDIT SHIPPING
               */
              <div className={styles.guestForm}>
                <div className={styles.field}>
                  <label>Street Address *</label>

                  <input
                    value={shipping.address1}
                    onChange={(e) => updateShipping("address1", e.target.value)}
                  />
                </div>

                <div className={styles.field}>
                  <label>Apartment, Suite, Unit</label>

                  <input
                    value={shipping.address2}
                    onChange={(e) => updateShipping("address2", e.target.value)}
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>City *</label>

                    <input
                      value={shipping.city}
                      onChange={(e) => updateShipping("city", e.target.value)}
                    />
                  </div>

                  <div className={styles.field}>
                    <label>State *</label>

                    <input
                      value={shipping.state}
                      onChange={(e) => updateShipping("state", e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>ZIP Code *</label>

                    <input
                      value={shipping.postcode}
                      onChange={(e) =>
                        updateShipping("postcode", e.target.value)
                      }
                    />
                  </div>

                  <div className={styles.field}>
                    <label>Country *</label>

                    <select
                      value={shipping.country}
                      onChange={(e) =>
                        updateShipping("country", e.target.value)
                      }
                    >
                      <option value="US">United States</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.continueBtn}
                  onClick={saveShipping}
                >
                  SAVE
                </button>
              </div>
            ) : (
              /*
               * SHIPPING SUMMARY
               */
              <div className={styles.info}>
                <strong>
                  {shipping.firstName} {shipping.lastName}
                </strong>

                {shipping.address1 && <p>{shipping.address1}</p>}

                {shipping.address2 && <p>{shipping.address2}</p>}

                {(shipping.city || shipping.state || shipping.postcode) && (
                  <p>
                    {shipping.city}
                    {shipping.city && shipping.state ? ", " : ""}
                    {shipping.state} {shipping.postcode}
                  </p>
                )}

                {shipping.country && <p>{shipping.country}</p>}
              </div>
            )}
          </section>

          {/* =================================================
              SHIPPING METHOD
          ================================================== */}
          <section className={styles.card}>
            <h3>Shipping Method</h3>

            <FreeShippingUpsell />

            <div className={styles.shippingMethods}>
              {shippingMethods.map((method) => (
                <label
                  key={method.id}
                  className={
                    selectedShipping === method.id
                      ? `${styles.shippingMethod} ${styles.shippingMethodActive}`
                      : styles.shippingMethod
                  }
                >
                  <input
                    type="radio"
                    name="shipping-method"
                    value={method.id}
                    checked={selectedShipping === method.id}
                    onChange={() => onShippingChangeMethod(method.id)}
                  />

                  <div className={styles.shippingDetails}>
                    <strong>{method.name}</strong>

                    {method.description && <small>{method.description}</small>}
                  </div>

                  <strong>${method.price.toFixed(2)}</strong>
                </label>
              ))}
            </div>
          </section>

          {/* =================================================
              CONTINUE
          ================================================== */}
          <button
            type="button"
            className={styles.continueBtn}
            onClick={onContinueToBilling}
          >
            Continue to Billing
          </button>
        </main>

        {/* =====================================================
            RIGHT - ORDER SUMMARY
        ====================================================== */}
        <aside className={styles.right}>
          <section className={styles.summary}>
            <h3>Order Summary</h3>

            {cart?.items.map((product) => (
              <div key={product.key} className={styles.product}>
                <div className={styles.productImage}>
                  {product.product.image ? (
                    <img
                      src={product.product.image.sourceUrl}
                      alt={
                        product.product.image.altText ?? product.product.name
                      }
                    />
                  ) : (
                    <div className={styles.imagePlaceholder} />
                  )}
                </div>

                <div className={styles.productInfo}>
                  <strong>{product.product.name}</strong>

                  <p>Qty: {product.quantity}</p>
                </div>

                <strong>{product.total}</strong>
              </div>
            ))}

            <div className={styles.row}>
              <span>Subtotal</span>

              <span>${subtotalAmount?.toFixed(2)}</span>
            </div>

            <div className={styles.row}>
              <span>Shipping</span>

              {shippingWaiverActive ? (
                <span>
                  <s>${selectedShippingMethod.price.toFixed(2)}</s>{" "}
                  $0.00
                </span>
              ) : (
                <span>${selectedShippingMethod.price.toFixed(2)}</span>
              )}
            </div>

            <div className={styles.total}>
              <span>Total</span>

              <strong>${displayedTotal?.toFixed(2)}</strong>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
