import { FormEvent, useState } from 'react';
import styles from './PaymentStep.module.css';

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

  onBack: () => void;

  onPlaceOrder?: (paymentData: {
    cardNumber: string;
    nameOnCard: string;
    expiry: string;
    cvv: string;
    paymentMethod: 'card' | 'klarna';
  }) => void;
}

export default function PaymentStep({
  products,
  subtotal,
  shippingPrice,
  onBack,
  onPlaceOrder,
}: PaymentStepProps) {
  const [paymentMethod, setPaymentMethod] =
    useState<'card' | 'klarna'>('card');

  const [cardNumber, setCardNumber] =
    useState('');

  const [nameOnCard, setNameOnCard] =
    useState('');

  const [expiry, setExpiry] =
    useState('');

  const [cvv, setCvv] =
    useState('');

  const [promoOpen, setPromoOpen] =
    useState(false);

  const [loyaltyOpen, setLoyaltyOpen] =
    useState(false);

  const [error, setError] =
    useState('');

  const total =
    subtotal + shippingPrice;

  const handleSubmit = (
    event: FormEvent
  ) => {
    event.preventDefault();

    setError('');

    if (paymentMethod === 'card') {
      if (
        !cardNumber.trim() ||
        !nameOnCard.trim() ||
        !expiry.trim() ||
        !cvv.trim()
      ) {
        setError(
          'Please complete all card details.'
        );

        return;
      }

      if (cardNumber.replace(/\s/g, '').length < 13) {
        setError(
          'Please enter a valid card number.'
        );

        return;
      }

      if (!/^\d{2}\/\d{2}$/.test(expiry)) {
        setError(
          'Expiry date must be in MM/YY format.'
        );

        return;
      }

      if (!/^\d{3,4}$/.test(cvv)) {
        setError(
          'Please enter a valid CVV.'
        );

        return;
      }
    }

    if (onPlaceOrder) {
      onPlaceOrder({
        cardNumber,
        nameOnCard,
        expiry,
        cvv,
        paymentMethod,
      });
    }
  };

  const formatCardNumber = (
    value: string
  ) => {
    const digits =
      value
        .replace(/\D/g, '')
        .slice(0, 16);

    return digits.replace(
      /(.{4})/g,
      '$1 '
    ).trim();
  };

  const formatExpiry = (
    value: string
  ) => {
    const digits =
      value
        .replace(/\D/g, '')
        .slice(0, 4);

    if (digits.length <= 2) {
      return digits;
    }

    return `${digits.slice(
      0,
      2
    )}/${digits.slice(2)}`;
  };

  return (
    <div className={styles.page}>

      {/* PROGRESS */}
      <div className={styles.progress}>
        <span className={styles.done}>
          Checkout
        </span>

        <span>›</span>

        <span className={styles.done}>
          Shipping
        </span>

        <span>›</span>

        <span className={styles.done}>
          Billing
        </span>

        <span>›</span>

        <span className={styles.done}>
          Real ID
        </span>

        <span>›</span>

        <span className={styles.active}>
          Payment
        </span>
      </div>

      <div className={styles.layout}>

        {/* LEFT */}
        <main className={styles.left}>

          {/* PAYMENT METHOD */}
          <section className={styles.card}>

            <h3>
              Payment Method
            </h3>

            <label
              className={
                paymentMethod === 'card'
                  ? `${styles.paymentOption} ${styles.selected}`
                  : styles.paymentOption
              }
            >
              <input
                type="radio"
                name="payment-method"
                checked={
                  paymentMethod === 'card'
                }
                onChange={() =>
                  setPaymentMethod('card')
                }
              />

              <span>
                Credit / Debit Card
              </span>

              <span className={styles.cardIcon}>
                ▭
              </span>
            </label>

            <label
              className={
                paymentMethod === 'klarna'
                  ? `${styles.paymentOption} ${styles.selected}`
                  : styles.paymentOption
              }
            >
              <input
                type="radio"
                name="payment-method"
                checked={
                  paymentMethod === 'klarna'
                }
                onChange={() =>
                  setPaymentMethod('klarna')
                }
              />

              <span>
                Buy Now Pay Later
              </span>

              <span className={styles.klarna}>
                Klarna
              </span>
            </label>

          </section>

          {/* CARD DETAILS */}
          {paymentMethod === 'card' && (
            <section className={styles.card}>

              <h3>
                Card Details
              </h3>

              <div className={styles.field}>
                <label>
                  Card Number *
                </label>

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  placeholder="1234 5678 9012 3456"
                  value={cardNumber}
                  onChange={(event) =>
                    setCardNumber(
                      formatCardNumber(
                        event.target.value
                      )
                    )
                  }
                />
              </div>

              <div className={styles.field}>
                <label>
                  Name on Card *
                </label>

                <input
                  type="text"
                  autoComplete="cc-name"
                  placeholder="Jane Smith"
                  value={nameOnCard}
                  onChange={(event) =>
                    setNameOnCard(
                      event.target.value
                    )
                  }
                />
              </div>

              <div className={styles.formRow}>

                <div className={styles.field}>
                  <label>
                    Expiry Date *
                  </label>

                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    placeholder="MM/YY"
                    value={expiry}
                    onChange={(event) =>
                      setExpiry(
                        formatExpiry(
                          event.target.value
                        )
                      )
                    }
                  />
                </div>

                <div className={styles.field}>
                  <label>
                    CVV *
                  </label>

                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    placeholder="123"
                    maxLength={4}
                    value={cvv}
                    onChange={(event) =>
                      setCvv(
                        event.target.value
                          .replace(/\D/g, '')
                          .slice(0, 4)
                      )
                    }
                  />
                </div>

              </div>

            </section>
          )}

          {/* PROMO */}
          <section className={styles.collapsible}>

            <button
              type="button"
              onClick={() =>
                setPromoOpen(
                  !promoOpen
                )
              }
            >
              <span>
                Promo & Gift Cards
              </span>

              <span>
                {promoOpen ? '⌃' : '⌄'}
              </span>
            </button>

            {promoOpen && (
              <div className={styles.collapseContent}>

                <input
                  type="text"
                  placeholder="Enter promo code"
                />

                <button
                  type="button"
                  className={styles.applyBtn}
                >
                  Apply
                </button>

              </div>
            )}

          </section>

          {/* LOYALTY */}
          <section className={styles.collapsible}>

            <button
              type="button"
              onClick={() =>
                setLoyaltyOpen(
                  !loyaltyOpen
                )
              }
            >
              <span>
                Loyalty Points
              </span>

              <span>
                {loyaltyOpen ? '⌃' : '⌄'}
              </span>
            </button>

            {loyaltyOpen && (
              <div className={styles.collapseContent}>
                <p>
                  Available loyalty points
                  will appear here.
                </p>
              </div>
            )}

          </section>

          {/* ORDER TOTAL */}
          <section className={styles.totalCard}>

            <h3>
              Order Total
            </h3>

            <div className={styles.totalRow}>
              <span>
                Subtotal
              </span>

              <span>
                ${subtotal.toFixed(2)}
              </span>
            </div>

            <div className={styles.totalRow}>
              <span>
                Shipping
              </span>

              <span>
                {shippingPrice === 0
                  ? 'Free'
                  : `$${shippingPrice.toFixed(2)}`}
              </span>
            </div>

            <div className={styles.totalRow}>
              <span>
                Estimated Tax (8%)
              </span>

              <span>
                $0.00
              </span>
            </div>

            <div className={styles.grandTotal}>
              <span>
                Total
              </span>

              <strong>
                ${total.toFixed(2)}
              </strong>
            </div>

          </section>

          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          {/* ACTIONS */}
          <div className={styles.actions}>

            <button
              type="button"
              className={styles.backButton}
              onClick={onBack}
            >
              Back to Billing
            </button>

            <button
              type="button"
              className={styles.placeOrder}
              onClick={handleSubmit}
            >
              Place Order - $
              {total.toFixed(2)}
            </button>

          </div>

          <p className={styles.terms}>
            By placing your order you agree
            to our Terms of Service and
            Privacy Policy.
          </p>

        </main>

        {/* RIGHT */}
        <aside className={styles.summary}>

          <h3>
            Order Summary
          </h3>

          {products.map(
            (product) => (
              <div
                key={product.id}
                className={styles.product}
              >

                <div className={styles.productImage}>
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                    />
                  ) : (
                    <div
                      className={
                        styles.placeholder
                      }
                    />
                  )}

                  <span>
                    {product.quantity}
                  </span>
                </div>

                <div className={styles.productInfo}>
                  <strong>
                    {product.name}
                  </strong>
                </div>

                <strong>
                  ${product.total.toFixed(2)}
                </strong>

              </div>
            )
          )}

          <div className={styles.summaryRow}>
            <span>
              Subtotal
            </span>

            <span>
              ${subtotal.toFixed(2)}
            </span>
          </div>

          <div className={styles.summaryRow}>
            <span>
              Shipping
            </span>

            <span>
              {shippingPrice === 0
                ? 'Free'
                : `$${shippingPrice.toFixed(2)}`}
            </span>
          </div>

          <div className={styles.summaryRow}>
            <span>
              Tax
            </span>

            <span>
              $0.00
            </span>
          </div>

          <div className={styles.summaryTotal}>
            <span>
              Total
            </span>

            <strong>
              ${total.toFixed(2)}
            </strong>
          </div>

        </aside>

      </div>
    </div>
  );
}