import { FormEvent, useState } from "react";
import styles from "./PaymentStep.module.css";
import { processPayment } from "@/lib/authorize-net";
import { useCart } from "@/context/CartContext";
import LoyaltyCheckoutRewards from "@/components/LoyaltyCheckoutRewards";

interface Product {
  id: number | string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  image: string;
}

interface PaymentStepProps {
  products: Product[];
  subtotal: number;
  shippingPrice: number;
  // "Forgot Something?" order-confirmation add-on within its window -
  // the live WooCommerce cart session (and therefore cart.shippingTotal/
  // cart.total) never reflects this, since the waiver is only ever
  // applied at order-creation time - so this overrides those two
  // figures wherever they're displayed below.
  shippingWaiverActive?: boolean;
  onBack: () => void;
  onPlaceOrder?: (paymentData: {
    opaqueData: {
      dataDescriptor: string;
      dataValue: string;
    };
  }) => Promise<void> | void;
}

export default function PaymentStep({
  products,
  subtotal,
  shippingPrice,
  shippingWaiverActive = false,
  onBack,
  onPlaceOrder,
}: PaymentStepProps) {
  const { cart, applyCoupon, removeCoupon, error: cartError } = useCart();

  const [paymentMethod, setPaymentMethod] = useState<"card" | "klarna">("card");

  const [cardNumber, setCardNumber] = useState("");
  const [nameOnCard, setNameOnCard] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");

  const [promoOpen, setPromoOpen] = useState(false);
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);

  const [couponCode, setCouponCode] = useState("");
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  /**
   * Convert WooCommerce money values to numbers.
   *
   * Example:
   * "$20.00" -> 20
   * "20.00"  -> 20
   */
  const moneyToNumber = (value: string | number | undefined | null): number => {
    if (value === undefined || value === null) {
      return 0;
    }

    const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ""));

    return Number.isFinite(parsed) ? parsed : 0;
  };

  /**
   * WooCommerce cart.total is the final cart amount.
   *
   * It already contains:
   * - product subtotal
   * - shipping
   * - coupon discounts
   * - loyalty discounts
   * - other cart adjustments
   *
   * Therefore DO NOT add shipping again when cart.total exists.
   */
  const hasCartTotal =
    cart?.total !== undefined &&
    cart?.total !== null &&
    String(cart.total).trim() !== "";

  const total = hasCartTotal
    ? moneyToNumber(cart.total)
    : subtotal + shippingPrice;

  // cart.total (above) is WooCommerce's live cart session total, which
  // never reflects a waiver - it's only ever applied at order-creation
  // time. Override it for display when the waiver is active, using
  // cart.subtotal (already shipping-free) as the true total instead.
  const displayedTotal = shippingWaiverActive
    ? moneyToNumber(cart?.subtotal)
    : total;

  /**
   * WooCommerce discount total.
   */
  const discountTotal = moneyToNumber(cart?.discountTotal);

  /**
   * Apply coupon.
   */
  const handleApplyCoupon = async (event: FormEvent) => {
    event.preventDefault();

    const code = couponCode.trim();

    if (!code) {
      return;
    }

    setError("");
    setIsApplyingCoupon(true);

    try {
      const success = await applyCoupon(code);

      if (success) {
        setCouponCode("");
      }
    } catch (couponError) {
      setError(
        couponError instanceof Error
          ? couponError.message
          : "Unable to apply coupon.",
      );
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  /**
   * Remove coupon.
   */
  const handleRemoveCoupon = async (code: string) => {
    setError("");

    try {
      await removeCoupon(code);
    } catch (couponError) {
      setError(
        couponError instanceof Error
          ? couponError.message
          : "Unable to remove coupon.",
      );
    }
  };

  /**
   * EXISTING PAYMENT LOGIC
   *
   * Authorize.Net processing remains unchanged.
   */
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    setError("");

    if (paymentMethod === "card") {
      if (
        !cardNumber.trim() ||
        !nameOnCard.trim() ||
        !expiry.trim() ||
        !cvv.trim()
      ) {
        setError("Please complete all card details.");

        return;
      }

      if (cardNumber.replace(/\s/g, "").length < 13) {
        setError("Please enter a valid card number.");

        return;
      }

      if (!/^\d{2}\/\d{2}$/.test(expiry)) {
        setError("Expiry date must be in MM/YY format.");

        return;
      }

      if (!/^\d{3,4}$/.test(cvv)) {
        setError("Please enter a valid CVV.");

        return;
      }
    }

    if (!onPlaceOrder) {
      return;
    }

    try {
      setIsSubmitting(true);

      const opaqueData = await processPayment({
        cardNumber: cardNumber.replace(/\s/g, ""),
        expirationMonth: expiry.slice(0, 2),
        expirationYear: `20${expiry.slice(3)}`,
        cvv,
      });

      await onPlaceOrder({
        opaqueData,
      });
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Payment could not be processed. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);

    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);

    if (digits.length <= 2) {
      return digits;
    }

    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  };

  return (
    <div className={styles.page}>
      {/* PROGRESS */}
      <div className={styles.progress}>
        <span className={styles.done}>Checkout</span>

        <span>›</span>

        <span className={styles.done}>Shipping</span>

        <span>›</span>

        <span className={styles.done}>Billing</span>

        <span>›</span>

        <span className={styles.done}>Real ID</span>

        <span>›</span>

        <span className={styles.active}>Payment</span>
      </div>

      <div className={styles.layout}>
        {/* LEFT */}
        <main className={styles.left}>
          {/* PAYMENT METHOD */}
          <section className={styles.card}>
            <h3>Payment Method</h3>

            <label
              className={
                paymentMethod === "card"
                  ? `${styles.paymentOption} ${styles.selected}`
                  : styles.paymentOption
              }
            >
              <input
                type="radio"
                name="payment-method"
                checked={paymentMethod === "card"}
                onChange={() => setPaymentMethod("card")}
              />

              <span>Credit / Debit Card</span>

              <span className={styles.cardIcon}>
                <img src="/images/CardIcon.png" alt="Credit / Debit Card" />
              </span>
            </label>
          </section>

          {/* CARD DETAILS */}
          {paymentMethod === "card" && (
            <section className={styles.card}>
              <h3>Card Details</h3>

              <div className={styles.field}>
                <label>Card Number *</label>

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  placeholder="1234 5678 9012 3456"
                  value={cardNumber}
                  onChange={(event) =>
                    setCardNumber(formatCardNumber(event.target.value))
                  }
                />
              </div>

              <div className={styles.field}>
                <label>Name on Card *</label>

                <input
                  type="text"
                  autoComplete="cc-name"
                  placeholder="Jane Smith"
                  value={nameOnCard}
                  onChange={(event) => setNameOnCard(event.target.value)}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.field}>
                  <label>Expiry Date *</label>

                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    placeholder="MM/YY"
                    value={expiry}
                    onChange={(event) =>
                      setExpiry(formatExpiry(event.target.value))
                    }
                  />
                </div>

                <div className={styles.field}>
                  <label>CVV *</label>

                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    placeholder="123"
                    maxLength={4}
                    value={cvv}
                    onChange={(event) =>
                      setCvv(event.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                  />
                </div>
              </div>
            </section>
          )}

          {/* PROMO & GIFT CARDS */}
          <section className={styles.collapsible}>
            <button type="button" onClick={() => setPromoOpen(!promoOpen)}>
              <span>Promo & Gift Cards</span>

              <span>{promoOpen ? "⌃" : "⌄"}</span>
            </button>

            {promoOpen && (
              <div className={styles.collapseContent}>
                <form
                  onSubmit={handleApplyCoupon}
                  style={{
                    display: "flex",
                    gap: "8px",
                  }}
                >
                  <input
                    type="text"
                    placeholder="Enter promo code"
                    value={couponCode}
                    onChange={(event) => setCouponCode(event.target.value)}
                    disabled={isApplyingCoupon}
                  />

                  <button
                    type="submit"
                    className={styles.applyBtn}
                    disabled={isApplyingCoupon || !couponCode.trim()}
                  >
                    {isApplyingCoupon ? "Applying..." : "Apply"}
                  </button>
                </form>

                {cartError && <p className={styles.error}>{cartError}</p>}

                {/* APPLIED COUPONS */}
                {cart?.appliedCoupons && cart.appliedCoupons.length > 0 && (
                  <div
                    style={{
                      marginTop: "12px",
                    }}
                  >
                    {cart.appliedCoupons.map((coupon) => (
                      <div
                        key={coupon.code}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "10px",
                          marginBottom: "8px",
                        }}
                      >
                        <span>{coupon.code}</span>

                        {coupon.discountAmount && (
                          <span>-{coupon.discountAmount}</span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleRemoveCoupon(coupon.code)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* LOYALTY POINTS */}
          <section className={styles.collapsible}>
            <button type="button" onClick={() => setLoyaltyOpen(!loyaltyOpen)}>
              <span>Loyalty Points</span>

              <span>{loyaltyOpen ? "⌃" : "⌄"}</span>
            </button>

            {loyaltyOpen && (
              <div className={styles.collapseContent}>
                <LoyaltyCheckoutRewards />
              </div>
            )}
          </section>

          {/* ORDER TOTAL */}
          <section className={styles.totalCard}>
            <h3>Order Total</h3>

            <div className={styles.totalRow}>
              <span>Subtotal</span>

              <span>{cart?.subtotal}</span>
            </div>

            <div className={styles.totalRow}>
              <span>Shipping</span>

              {shippingWaiverActive ? (
                <span>
                  <s>{cart?.shippingTotal}</s> $0.00
                </span>
              ) : (
                <span>
                  {cart?.shippingTotal === "$0.00" ? "Free" : cart?.shippingTotal}
                </span>
              )}
            </div>

            {/* DISCOUNT */}
            {cart?.discountTotal && (
              <div className={styles.totalRow}>
                <span>Discount</span>

                <span>
                  -
                  {cart?.discountTotal}
                </span>
              </div>
            )}

            <div className={styles.totalRow}>
              <span>Estimated Tax (8%)</span>

              <span>$0.00</span>
            </div>

            <div className={styles.grandTotal}>
              <span>Total</span>

              <strong>${displayedTotal.toFixed(2)}</strong>
            </div>
          </section>

          {error && <div className={styles.error}>{error}</div>}

          {/* ACTIONS */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.backButton}
              onClick={onBack}
              disabled={isSubmitting}
            >
              Back to Billing
            </button>

            <button
              type="button"
              className={styles.placeOrder}
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Processing payment..."
                : `Place Order - $${displayedTotal.toFixed(2)}`}
            </button>
          </div>

          <p className={styles.terms}>
            By placing your order you agree to our Terms of Service and Privacy
            Policy.
          </p>
        </main>

        {/* RIGHT - ORDER SUMMARY */}
        <aside className={styles.summary}>
          <h3>Order Summary</h3>

          {cart?.items?.map((product) => (
            <div key={product.key} className={styles.product}>
              <div className={styles.productImage}>
                {product?.product.image ? (
                  <img
                    src={product?.product.image?.sourceUrl}
                    alt={product.product.image?.altText}
                  />
                ) : (
                  <div className={styles.placeholder} />
                )}

                <span>{product.quantity}</span>
              </div>

              <div className={styles.productInfo}>
                <strong>{product?.product?.name}</strong>
              </div>

              <strong>{product.total}</strong>
            </div>
          ))}

          <div className={styles.summaryRow}>
            <span>Subtotal</span>

            <span>{cart?.subtotal}</span>
          </div>

          <div className={styles.summaryRow}>
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

          {cart?.discountTotal !== "$0.00" && (
            <div className={styles.summaryRow}>
              <span>Discount</span>

              <span>-{cart?.discountTotal}</span>
            </div>
          )}

          <div className={styles.summaryRow}>
            <span>Tax</span>

            <span>$0.00</span>
          </div>

          <div className={styles.summaryTotal}>
            <span>Total</span>

            <strong>${displayedTotal.toFixed(2)}</strong>
          </div>
        </aside>
      </div>
    </div>
  );
}
