import styles from './MellowCheckout.module.css';

export default function MellowCheckout() {
  return (
    <div className={styles.checkoutPage}>
      <div className={styles.checkoutContainer}>

        {/* =========================
            PROGRESS
        ========================== */}
        <div className={styles.progressBar}>
          <div className={styles.progressItem}>
            <span className={`${styles.progressNumber} ${styles.active}`}>
              1
            </span>
            <span>Checkout</span>
          </div>

          <span className={styles.progressLine} />

          <div className={styles.progressItem}>
            <span className={styles.progressNumber}>2</span>
            <span>Shipping</span>
          </div>

          <span className={styles.progressLine} />

          <div className={styles.progressItem}>
            <span className={styles.progressNumber}>3</span>
            <span>Billing</span>
          </div>

          <span className={styles.progressLine} />

          <div className={styles.progressItem}>
            <span className={styles.progressNumber}>4</span>
            <span>Real ID</span>
          </div>

          <span className={styles.progressLine} />

          <div className={styles.progressItem}>
            <span className={styles.progressNumber}>5</span>
            <span>Payment</span>
          </div>
        </div>

        {/* =========================
            MAIN GRID
        ========================== */}
        <div className={styles.mainGrid}>

          {/* =========================
              LEFT COLUMN
          ========================== */}
          <main className={styles.leftColumn}>

            {/* CONTACT INFORMATION */}
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2>Contact Information</h2>
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>
                    First Name <span>*</span>
                  </label>

                  <input
                    type="text"
                    placeholder="Jane"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>
                    Last Name <span>*</span>
                  </label>

                  <input
                    type="text"
                    placeholder="Smith"
                  />
                </div>

                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label>
                    Phone Number <span>*</span>
                  </label>

                  <input
                    type="text"
                    placeholder="(555) 000-0000"
                  />

                  <small>For delivery updates only</small>
                </div>
              </div>

              <label className={styles.accountCheckbox}>
                <input type="checkbox" />
                <span>
                  Create a Mellow account to redeem points!
                </span>
              </label>
            </section>

            {/* SHIPPING ADDRESS */}
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2>Shipping Address</h2>
              </div>

              <div className={styles.addressForm}>

                <div className={styles.formGroup}>
                  <label>
                    Street Address <span>*</span>
                  </label>

                  <input
                    type="text"
                    placeholder="123 Main St"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>
                    Apartment, Suite, Unit (optional)
                  </label>

                  <input
                    type="text"
                    placeholder="Apt 4B"
                  />
                </div>

                <div className={styles.addressRow}>
                  <div className={styles.formGroup}>
                    <label>
                      City <span>*</span>
                    </label>

                    <input
                      type="text"
                      placeholder="Brooklyn"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>
                      State <span>*</span>
                    </label>

                    <select defaultValue="">
                      <option value="" disabled>
                        Select state
                      </option>
                      <option>New York</option>
                      <option>California</option>
                      <option>Texas</option>
                      <option>Florida</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label>
                      ZIP Code <span>*</span>
                    </label>

                    <input
                      type="text"
                      placeholder="11201"
                    />
                  </div>
                </div>

              </div>
            </section>

            {/* SHIPPING METHOD */}
            <section className={styles.card}>

              <div className={styles.cardHeader}>
                <h2>Shipping Method</h2>
              </div>

              <div className={styles.freeShipping}>
                Add <strong>$18.03</strong> more to get free shipping!

                <span>Shop Now <b>⌄</b></span>
              </div>

              <div className={styles.shippingProgress}>
                <div />
              </div>

              <div className={styles.shippingOptions}>

                <label className={styles.shippingOption}>
                  <div className={styles.shippingRadio}>
                    <input
                      type="radio"
                      name="shipping"
                      defaultChecked
                    />
                  </div>

                  <div className={styles.shippingInfo}>
                    <strong>Standard Shipping</strong>
                    <small>Arrives in 5–7 business days</small>
                  </div>

                  <strong className={styles.shippingPrice}>
                    $5.99
                  </strong>
                </label>

                <label className={styles.shippingOption}>
                  <div className={styles.shippingRadio}>
                    <input
                      type="radio"
                      name="shipping"
                    />
                  </div>

                  <div className={styles.shippingInfo}>
                    <strong>Express Shipping</strong>
                    <small>Arrives in 2–3 business days</small>
                  </div>

                  <strong className={styles.shippingPrice}>
                    $9.99
                  </strong>
                </label>

                <label className={styles.shippingOption}>
                  <div className={styles.shippingRadio}>
                    <input
                      type="radio"
                      name="shipping"
                    />
                  </div>

                  <div className={styles.shippingInfo}>
                    <strong>Overnight Shipping</strong>
                    <small>Next business day by 10:30 AM</small>
                  </div>

                  <strong className={styles.shippingPrice}>
                    $24.99
                  </strong>
                </label>

              </div>

            </section>

            {/* ACTION BUTTONS */}
            <div className={styles.actionButtons}>
              <button className={styles.backButton}>
                Back to Cart
              </button>

              <button className={styles.continueButton}>
                Continue to Billing
              </button>
            </div>

          </main>

          {/* =========================
              RIGHT COLUMN
          ========================== */}
          <aside className={styles.rightColumn}>

            <div className={styles.orderSummary}>

              <h2>Order Summary</h2>

              {/* PRODUCT 1 */}
              <div className={styles.product}>

                <div className={styles.productImage}>
                  <img
                    src="https://placehold.co/80x80"
                    alt="Delta 8 THC + CBD Seltzer Beverage"
                  />

                  <span className={styles.quantityBadge}>
                    2
                  </span>
                </div>

                <div className={styles.productInfo}>
                  <strong>
                    Delta 8 THC + CBD Seltzer Beverage
                  </strong>

                  <small>
                    Strawberry Mango 4-Pack
                  </small>

                  <b>$59.98</b>
                </div>

              </div>

              {/* PRODUCT 2 */}
              <div className={styles.product}>

                <div className={styles.productImage}>
                  <img
                    src="https://placehold.co/80x80"
                    alt="Live Resin Vape Pen"
                  />

                  <span className={styles.quantityBadge}>
                    1
                  </span>
                </div>

                <div className={styles.productInfo}>
                  <strong>
                    Live Resin Vape Pen 2ML
                  </strong>

                  <small>
                    Blue Dream
                  </small>

                  <b>$39.99</b>
                </div>

              </div>

              <div className={styles.summaryDivider} />

              <div className={styles.summaryRow}>
                <span>Subtotal</span>
                <strong>$99.97</strong>
              </div>

              <div className={styles.summaryRow}>
                <span>Shipping</span>
                <strong className={styles.free}>
                  Free
                </strong>
              </div>

              <div className={styles.summaryRow}>
                <span>Estimated tax</span>
                <strong>$8.00</strong>
              </div>

              <div className={styles.totalRow}>
                <span>Total</span>
                <strong>$107.97</strong>
              </div>

            </div>

          </aside>

        </div>

        {/* =========================
            MOBILE ORDER SUMMARY
        ========================== */}
        <div className={styles.mobileOrderSummary}>
          <span>
            🛒 Order Summary
          </span>

          <strong>
            $107.97
          </strong>

          <span className={styles.mobileArrow}>
            ⌄
          </span>
        </div>

      </div>
    </div>
  );
}