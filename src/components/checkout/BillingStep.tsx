import { useState } from "react";
import styles from "./BillingStep.module.css";
import { useCart } from "@/context/CartContext";

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

interface BillingStepProps {
  billing: Address;
  shipping: Address;

  products: Product[];

  subtotal: number;
  shippingPrice: number;
  // "Forgot Something?" order-confirmation add-on within its window -
  // the live WooCommerce cart session (and therefore cart.shippingTotal/
  // cart.total) never reflects this, since the waiver is only ever
  // applied at order-creation time - so the summary below has to
  // override those two figures itself when it's active.
  shippingWaiverActive?: boolean;

  onBillingChange: (value: Address) => void;
  onSaveBilling: () => Promise<string>;
  onBack: () => void;
  onContinue: () => void;
}

export default function BillingStep({
  billing,
  shipping,
  products,
  subtotal,
  shippingPrice,
  shippingWaiverActive = false,
  onBillingChange,
  onSaveBilling,
  onBack,
  onContinue,
}: BillingStepProps) {
  const { cart } = useCart();
  /*
   * Checkbox ONLY controls:
   *
   * checked   -> show shipping address
   * unchecked -> show billing form
   */
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  /*
   * Keep the user's manually entered billing address
   * separate from the shipping address.
   *
   * We NEVER clear billing when the checkbox changes.
   */
  /*const shippingAsBilling: Address = {
    ...shipping,

    firstName:
      shipping.firstName ||
      billing.firstName ||
      '',

    lastName:
      shipping.lastName ||
      billing.lastName ||
      '',

    email:
      billing.email ||
      shipping.email ||
      '',

    phone:
      billing.phone ||
      shipping.phone ||
      '',
  };*/

  /*
   * Checkbox handler.
   *
   * Checked:
   *   Copy shipping into billing and show shipping summary.
   *
   * Unchecked:
   *   Show billing form.
   *
   * IMPORTANT:
   * We do NOT clear billing when unchecked.
   */
  /*const handleSameAsShippingChange = (
    checked: boolean
  ) => {
    setSameAsShipping(checked);

    if (checked) {
      onBillingChange(shippingAsBilling);
    }
  };*/

  const handleSameAsShippingChange = (checked: boolean) => {
    setSameAsShipping(checked);
  };

  /*
   * Update billing form.
   */
  const updateBilling = (field: keyof Address, value: string) => {
    onBillingChange({
      ...billing,
      [field]: value,
    });
  };

  /*
   * Save button.
   *
   * Billing is already stored through onBillingChange()
   * while typing, so Save does not need to do anything else.
   */
  const handleSaveBilling = async () => {
    setSaveMessage(null);
    setSaveError(null);

    try {
      const message = await onSaveBilling();
      setSaveMessage(message);
      setSameAsShipping(false);
    } catch (error) {
      console.error("Failed to save billing address:", error);
      setSaveError(
        error instanceof Error
          ? error.message
          : "Failed to save billing address.",
      );
    }
  };

  const displayedBilling = sameAsShipping ? shipping : billing;

  const subtotalAmount =
    (cart?.total?.replace("$", "") as any) * 1 -
    (cart?.shippingTotal?.replace("$", "") as any) * 1;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* =========================================
            LEFT
        ========================================== */}

        <main className={styles.left}>
          {/* Progress */}

          <div className={styles.progress}>
            <span>Checkout</span>

            <span>›</span>

            <span>Shipping</span>

            <span>›</span>

            <span className={styles.active}>Billing</span>

            <span>›</span>

            <span>Real ID</span>

            <span>›</span>

            <span>Payment</span>
          </div>

          {/* =====================================
              BILLING CARD
          ====================================== */}

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Billing Address</h2>
            </div>

            {/* =====================================
                SAME AS SHIPPING CHECKBOX
            ====================================== */}

            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={sameAsShipping}
                onChange={(e) => handleSameAsShippingChange(e.target.checked)}
              />

              <span>Same as shipping address</span>
            </label>

            {/* =====================================
                CHECKED:
                SHOW SHIPPING ADDRESS
            ====================================== */}

            {sameAsShipping ? (
              <div className={styles.addressSummary}>
                <strong>
                  {displayedBilling.firstName} {displayedBilling.lastName}
                </strong>

                {displayedBilling.address1 && (
                  <p>{displayedBilling.address1}</p>
                )}

                {displayedBilling.address2 && (
                  <p>{displayedBilling.address2}</p>
                )}

                {(displayedBilling.city ||
                  displayedBilling.state ||
                  displayedBilling.postcode) && (
                  <p>
                    {displayedBilling.city}
                    {displayedBilling.city && displayedBilling.state
                      ? ", "
                      : " "}
                    {displayedBilling.state} {displayedBilling.postcode}
                  </p>
                )}

                {displayedBilling.country && <p>{displayedBilling.country}</p>}
              </div>
            ) : (
              /* =================================
                 UNCHECKED:
                 SHOW BILLING FORM
              ================================== */

              <div className={styles.form}>
                {/* First Name / Last Name */}

                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>First Name *</label>

                    <input
                      type="text"
                      value={billing.firstName || ""}
                      onChange={(e) =>
                        updateBilling("firstName", e.target.value)
                      }
                    />
                  </div>

                  <div className={styles.field}>
                    <label>Last Name *</label>

                    <input
                      type="text"
                      value={billing.lastName || ""}
                      onChange={(e) =>
                        updateBilling("lastName", e.target.value)
                      }
                    />
                  </div>
                </div>

                {/* Street Address */}

                <div className={styles.field}>
                  <label>Street Address *</label>

                  <input
                    type="text"
                    value={billing.address1 || ""}
                    onChange={(e) => updateBilling("address1", e.target.value)}
                  />
                </div>

                {/* Apartment */}

                <div className={styles.field}>
                  <label>Apartment, Suite, Unit</label>

                  <input
                    type="text"
                    value={billing.address2 || ""}
                    onChange={(e) => updateBilling("address2", e.target.value)}
                  />
                </div>

                {/* City / State */}

                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>City *</label>

                    <input
                      type="text"
                      value={billing.city || ""}
                      onChange={(e) => updateBilling("city", e.target.value)}
                    />
                  </div>

                  <div className={styles.field}>
                    <label>State *</label>

                    <input
                      type="text"
                      value={billing.state || ""}
                      onChange={(e) => updateBilling("state", e.target.value)}
                    />
                  </div>
                </div>

                {/* ZIP / Country */}

                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>ZIP Code *</label>

                    <input
                      type="text"
                      value={billing.postcode || ""}
                      onChange={(e) =>
                        updateBilling("postcode", e.target.value)
                      }
                    />
                  </div>

                  <div className={styles.field}>
                    <label>Country *</label>

                    <select
                      value={billing.country || "US"}
                      onChange={(e) => updateBilling("country", e.target.value)}
                    >
                      <option value="US">United States</option>
                    </select>
                  </div>
                </div>

                {/* Save */}

                <div className={styles.formRow}>
                  <button
                    type="button"
                    className={styles.saveButton}
                    onClick={handleSaveBilling}
                  >
                    Save
                  </button>
                </div>

                {(saveMessage || saveError) && (
                  <p
                    className={
                      saveError ? styles.saveErrorNote : styles.saveNote
                    }
                  >
                    {saveError || saveMessage}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* =====================================
              NAVIGATION
          ====================================== */}

          <div className={styles.navigation}>
            <button
              type="button"
              className={styles.backButton}
              onClick={onBack}
            >
              Back to Shipping
            </button>

            <button
              type="button"
              className={styles.continueButton}
              onClick={onContinue}
            >
              Continue to Age Verification
            </button>
          </div>
        </main>

        {/* =========================================
            RIGHT - ORDER SUMMARY
        ========================================== */}

        <aside className={styles.right}>
          <section className={styles.summary}>
            <h2>Order Summary</h2>

            {cart?.items.map((product) => (
              <div key={product.key} className={styles.product}>
                <div className={styles.productImage}>
                  {product.product.image ? (
                    <img
                      src={product.product.image.sourceUrl}
                      alt={product?.product?.image?.altText}
                    />
                  ) : (
                    <div className={styles.placeholder} />
                  )}

                  <span className={styles.quantity}>{product.quantity}</span>
                </div>

                <div className={styles.productInfo}>
                  <strong>{product.product.name}</strong>
                </div>

                <strong>{product.total}</strong>
              </div>
            ))}

            <div className={styles.row}>
              <span>Subtotal</span>

              <span>${subtotalAmount.toFixed(2)}</span>
            </div>

            <div className={styles.row}>
              <span>Shipping</span>

              {shippingWaiverActive ? (
                <span>
                  <s>{cart?.shippingTotal}</s> $0.00
                </span>
              ) : (
                <span>
                  {cart?.shippingTotal === "$0.00"
                    ? "Free"
                    : `${cart?.shippingTotal}`}
                </span>
              )}
            </div>

            <div className={styles.total}>
              <span>Total</span>

              <strong>
                {shippingWaiverActive
                  ? `$${subtotalAmount.toFixed(2)}`
                  : cart?.total}
              </strong>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
