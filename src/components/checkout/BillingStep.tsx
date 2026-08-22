import { useEffect, useState } from 'react';
import styles from './BillingStep.module.css';

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

  onBillingChange: (value: Address) => void;

  onBack: () => void;
  onContinue: () => void;
}

export default function BillingStep({
  billing,
  shipping,
  products,
  subtotal,
  shippingPrice,
  onBillingChange,
  onBack,
  onContinue,
}: BillingStepProps) {
  const [sameAsShipping, setSameAsShipping] =
    useState(true);

  const [editing, setEditing] =
    useState(false);

  /*
   * When the page opens, use shipping address
   * as billing address.
   */
  useEffect(() => {
    if (sameAsShipping) {
      onBillingChange({
        ...shipping,
        email: billing.email,
        phone: billing.phone,
      });
    }
  }, []);

  /*
   * Keep billing synced with shipping while
   * "Same as shipping" is enabled.
   */
  useEffect(() => {
    if (!sameAsShipping) {
      return;
    }

    onBillingChange({
      ...shipping,
      email: billing.email,
      phone: billing.phone,
    });
  }, [
    sameAsShipping,
    shipping,
  ]);

  const updateBilling = (
    field: keyof Address,
    value: string
  ) => {
    onBillingChange({
      ...billing,
      [field]: value,
    });
  };

  const total =
    subtotal + shippingPrice;

  return (
    <div className={styles.page}>

      <div className={styles.container}>

        {/* =========================================
            LEFT
        ========================================== */}

        <main className={styles.left}>

          {/* Progress */}

          <div className={styles.progress}>

            <span>
              Checkout
            </span>

            <span>›</span>

            <span>
              Shipping
            </span>

            <span>›</span>

            <span className={styles.active}>
              Billing
            </span>

            <span>›</span>

            <span>
              Real ID
            </span>

            <span>›</span>

            <span>
              Payment
            </span>

          </div>

          {/* =====================================
              BILLING CARD
          ====================================== */}

          <section className={styles.card}>

            <div className={styles.cardHeader}>

              <h2>
                Billing Address
              </h2>

              {!editing && (
                <button
                  type="button"
                  className={styles.editButton}
                  onClick={() =>
                    setEditing(true)
                  }
                >
                  ✎
                </button>
              )}

            </div>

            {/* Same as shipping */}

            {!editing && (
              <label
                className={
                  styles.checkboxRow
                }
              >

                <input
                  type="checkbox"
                  checked={sameAsShipping}
                  onChange={(e) => {
                    const checked =
                      e.target.checked;

                    setSameAsShipping(
                      checked
                    );

                    if (checked) {
                      onBillingChange({
                        ...shipping,
                        email:
                          billing.email,
                        phone:
                          billing.phone,
                      });
                    }
                  }}
                />

                <span>
                  Same as shipping address
                </span>

              </label>
            )}

            {/* =================================
                SUMMARY
            ================================== */}

            {!editing ? (

              <div
                className={
                  styles.addressSummary
                }
              >

                <strong>
                  {billing.firstName}{' '}
                  {billing.lastName}
                </strong>

                {billing.address1 && (
                  <p>
                    {billing.address1}
                  </p>
                )}

                {billing.address2 && (
                  <p>
                    {billing.address2}
                  </p>
                )}

                {(billing.city ||
                  billing.state ||
                  billing.postcode) && (
                  <p>
                    {billing.city}
                    {billing.city &&
                    billing.state
                      ? ', '
                      : ' '}

                    {billing.state}{' '}

                    {billing.postcode}
                  </p>
                )}

                {billing.country && (
                  <p>
                    {billing.country}
                  </p>
                )}

              </div>

            ) : (

              /* =================================
                 EDIT FORM
              ================================== */

              <div
                className={
                  styles.form
                }
              >

                <div
                  className={
                    styles.formRow
                  }
                >

                  <div
                    className={
                      styles.field
                    }
                  >

                    <label>
                      First Name *
                    </label>

                    <input
                      value={
                        billing.firstName
                      }
                      onChange={(e) =>
                        updateBilling(
                          'firstName',
                          e.target.value
                        )
                      }
                    />

                  </div>

                  <div
                    className={
                      styles.field
                    }
                  >

                    <label>
                      Last Name *
                    </label>

                    <input
                      value={
                        billing.lastName
                      }
                      onChange={(e) =>
                        updateBilling(
                          'lastName',
                          e.target.value
                        )
                      }
                    />

                  </div>

                </div>

                <div
                  className={
                    styles.field
                  }
                >

                  <label>
                    Street Address *
                  </label>

                  <input
                    value={
                      billing.address1
                    }
                    onChange={(e) =>
                      updateBilling(
                        'address1',
                        e.target.value
                      )
                    }
                  />

                </div>

                <div
                  className={
                    styles.field
                  }
                >

                  <label>
                    Apartment, Suite, Unit
                  </label>

                  <input
                    value={
                      billing.address2
                    }
                    onChange={(e) =>
                      updateBilling(
                        'address2',
                        e.target.value
                      )
                    }
                  />

                </div>

                <div
                  className={
                    styles.formRow
                  }
                >

                  <div
                    className={
                      styles.field
                    }
                  >

                    <label>
                      City *
                    </label>

                    <input
                      value={
                        billing.city
                      }
                      onChange={(e) =>
                        updateBilling(
                          'city',
                          e.target.value
                        )
                      }
                    />

                  </div>

                  <div
                    className={
                      styles.field
                    }
                  >

                    <label>
                      State *
                    </label>

                    <input
                      value={
                        billing.state
                      }
                      onChange={(e) =>
                        updateBilling(
                          'state',
                          e.target.value
                        )
                      }
                    />

                  </div>

                </div>

                <div
                  className={
                    styles.formRow
                  }
                >

                  <div
                    className={
                      styles.field
                    }
                  >

                    <label>
                      ZIP Code *
                    </label>

                    <input
                      value={
                        billing.postcode
                      }
                      onChange={(e) =>
                        updateBilling(
                          'postcode',
                          e.target.value
                        )
                      }
                    />

                  </div>

                  <div
                    className={
                      styles.field
                    }
                  >

                    <label>
                      Country *
                    </label>

                    <select
                      value={
                        billing.country
                      }
                      onChange={(e) =>
                        updateBilling(
                          'country',
                          e.target.value
                        )
                      }
                    >

                      <option value="US">
                        United States
                      </option>

                    </select>

                  </div>

                </div>

                <div
                  className={
                    styles.formRow
                  }
                >

                  <button
                    type="button"
                    className={
                      styles.secondaryButton
                    }
                    onClick={() =>
                      setEditing(false)
                    }
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className={
                      styles.saveButton
                    }
                    onClick={() =>
                      setEditing(false)
                    }
                  >
                    Save
                  </button>

                </div>

              </div>
            )}

          </section>

          {/* =====================================
              NAVIGATION
          ====================================== */}

          <div
            className={
              styles.navigation
            }
          >

            <button
              type="button"
              className={
                styles.backButton
              }
              onClick={onBack}
            >
              Back to Shipping
            </button>

            <button
              type="button"
              className={
                styles.continueButton
              }
              onClick={onContinue}
            >
              Continue to Payment
            </button>

          </div>

        </main>

        {/* =========================================
            RIGHT - ORDER SUMMARY
        ========================================== */}

        <aside
          className={
            styles.right
          }
        >

          <section
            className={
              styles.summary
            }
          >

            <h2>
              Order Summary
            </h2>

            {products.map(
              (product) => (

                <div
                  key={product.id}
                  className={
                    styles.product
                  }
                >

                  <div
                    className={
                      styles.productImage
                    }
                  >

                    {product.image ? (

                      <img
                        src={
                          product.image
                        }
                        alt={
                          product.name
                        }
                      />

                    ) : (

                      <div
                        className={
                          styles.placeholder
                        }
                      />

                    )}

                    <span
                      className={
                        styles.quantity
                      }
                    >
                      {product.quantity}
                    </span>

                  </div>

                  <div
                    className={
                      styles.productInfo
                    }
                  >

                    <strong>
                      {product.name}
                    </strong>

                  </div>

                  <strong>
                    $
                    {product.total.toFixed(
                      2
                    )}
                  </strong>

                </div>

              )
            )}

            <div
              className={
                styles.row
              }
            >

              <span>
                Subtotal
              </span>

              <span>
                $
                {subtotal.toFixed(
                  2
                )}
              </span>

            </div>

            <div
              className={
                styles.row
              }
            >

              <span>
                Shipping
              </span>

              <span>
                {shippingPrice === 0
                  ? 'Free'
                  : `$${shippingPrice.toFixed(
                      2
                    )}`}
              </span>

            </div>

            <div
              className={
                styles.total
              }
            >

              <span>
                Total
              </span>

              <strong>
                $
                {total.toFixed(2)}
              </strong>

            </div>

          </section>

        </aside>

      </div>

    </div>
  );
}