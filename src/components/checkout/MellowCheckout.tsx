import styles from './MellowCheckout.module.css';
import { useEffect } from 'react';

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
  isAuthenticated?: boolean;

  billing?: Address;
  shipping?: Address;

  products?: Product[];

  subtotal?: number;

  shippingMethods?: ShippingMethod[];

  selectedShipping?: string;
  selectedShippingMethod?: ShippingMethod;

  onBillingChange?: (value: Address) => void;
  onShippingChange?: (value: Address) => void;
  onShippingChangeMethod?: (value: string) => void;
}

const emptyAddress: Address = {
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

const emptyShippingMethod: ShippingMethod = {
  id: '',
  name: '',
  price: 0,
};

// This component only has one caller right now - the standalone
// checkout-design.tsx preview page - which renders it with no props at all.
// These defaults exist for that preview, not for a real integration; a real
// caller is expected to pass every field explicitly.
export default function MellowCheckout({
  isAuthenticated = false,

  billing = emptyAddress,
  shipping = emptyAddress,

  products = [],

  subtotal = 0,

  shippingMethods = [],

  selectedShipping = '',
  selectedShippingMethod = emptyShippingMethod,

  onBillingChange = () => {},
  onShippingChange = () => {},
  onShippingChangeMethod = () => {},
}: MellowCheckoutProps) {

  /**
   * Load logged-in WooCommerce customer
   * and autofill checkout.
   */
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const loadCustomer = async () => {
      try {
        console.log('Loading checkout customer...');

        const response = await fetch('/api/checkout/customer');

        const data = await response.json();

        console.log('Checkout customer response:', data);

        if (!response.ok || !data.success || !data.customer) {
          console.error(
            'Unable to load checkout customer:',
            data
          );
          return;
        }

        const customer = data.customer;

        console.log('Customer:', customer);

        /**
         * Billing data
         */
        const customerBilling: Address = {
          firstName:
            customer.billing?.firstName ||
            customer.contact?.firstName ||
            '',

          lastName:
            customer.billing?.lastName ||
            customer.contact?.lastName ||
            '',

          email:
            customer.billing?.email ||
            customer.contact?.email ||
            customer.email ||
            '',

          phone:
            customer.billing?.phone ||
            customer.contact?.phone ||
            '',

          address1:
            customer.billing?.address1 ||
            '',

          address2:
            customer.billing?.address2 ||
            '',

          city:
            customer.billing?.city ||
            '',

          state:
            customer.billing?.state ||
            '',

          postcode:
            customer.billing?.postcode ||
            '',

          country:
            customer.billing?.country ||
            'US',
        };

        /**
         * Shipping data
         */
        const customerShipping: Address = {
          firstName:
            customer.shipping?.firstName ||
            customer.billing?.firstName ||
            customer.contact?.firstName ||
            '',

          lastName:
            customer.shipping?.lastName ||
            customer.billing?.lastName ||
            customer.contact?.lastName ||
            '',

          email:
            customer.billing?.email ||
            customer.contact?.email ||
            customer.email ||
            '',

          phone:
            customer.shipping?.phone ||
            customer.billing?.phone ||
            customer.contact?.phone ||
            '',

          address1:
            customer.shipping?.address1 ||
            '',

          address2:
            customer.shipping?.address2 ||
            '',

          city:
            customer.shipping?.city ||
            '',

          state:
            customer.shipping?.state ||
            '',

          postcode:
            customer.shipping?.postcode ||
            '',

          country:
            customer.shipping?.country ||
            'US',
        };

        console.log(
          'Autofill billing:',
          customerBilling
        );

        console.log(
          'Autofill shipping:',
          customerShipping
        );

        /**
         * Send customer data to parent.
         */
        onBillingChange(customerBilling);

        onShippingChange(customerShipping);

      } catch (error) {
        console.error(
          'Failed to load checkout customer:',
          error
        );
      }
    };

    loadCustomer();

  }, [
    isAuthenticated,
    onBillingChange,
    onShippingChange,
  ]);

  /**
   * Update billing field.
   */
  const updateBilling = (
    field: keyof Address,
    value: string
  ) => {
    onBillingChange({
      ...billing,
      [field]: value,
    });
  };

  /**
   * Update shipping field.
   */
  const updateShipping = (
    field: keyof Address,
    value: string
  ) => {
    onShippingChange({
      ...shipping,
      [field]: value,
    });
  };

  const total =
    subtotal + selectedShippingMethod.price;

  return (
    <div className={styles.wrapper}>
      <div className={styles.checkoutContainer}>

        {/* LEFT */}
        <main className={styles.left}>

          {/* Progress */}
          <div className={styles.progress}>

            <span className={styles.active}>
              Checkout
            </span>

            <span>›</span>

            <span>
              Shipping
            </span>

            <span>›</span>

            <span>
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

          {/* Contact Information */}
          <section className={styles.card}>

            <div className={styles.cardHeader}>

              <h3>
                Contact Information
              </h3>

              {isAuthenticated && (
                <button
                  type="button"
                  className={styles.editButton}
                >
                  ✎
                </button>
              )}

            </div>

            {isAuthenticated ? (

              <div className={styles.info}>

                <strong>
                  {billing.firstName}{' '}
                  {billing.lastName}
                </strong>

                {billing.email && (
                  <p>
                    {billing.email}
                  </p>
                )}

                {billing.phone && (
                  <p>
                    {billing.phone}
                  </p>
                )}

              </div>

            ) : (

              <div className={styles.guestForm}>

                <div className={styles.formRow}>

                  <div className={styles.field}>

                    <label>
                      First Name *
                    </label>

                    <input
                      value={billing.firstName}
                      onChange={(e) =>
                        updateBilling(
                          'firstName',
                          e.target.value
                        )
                      }
                    />

                  </div>

                  <div className={styles.field}>

                    <label>
                      Last Name *
                    </label>

                    <input
                      value={billing.lastName}
                      onChange={(e) =>
                        updateBilling(
                          'lastName',
                          e.target.value
                        )
                      }
                    />

                  </div>

                </div>

                <div className={styles.field}>

                  <label>
                    Email Address *
                  </label>

                  <input
                    type="email"
                    value={billing.email}
                    onChange={(e) =>
                      updateBilling(
                        'email',
                        e.target.value
                      )
                    }
                  />

                </div>

                <div className={styles.field}>

                  <label>
                    Phone Number *
                  </label>

                  <input
                    type="tel"
                    value={billing.phone}
                    onChange={(e) =>
                      updateBilling(
                        'phone',
                        e.target.value
                      )
                    }
                  />

                </div>

              </div>

            )}

          </section>

          {/* Shipping Address */}
          <section className={styles.card}>

            <div className={styles.cardHeader}>

              <h3>
                Shipping Address
              </h3>

              {isAuthenticated && (
                <button
                  type="button"
                  className={styles.editButton}
                >
                  ✎
                </button>
              )}

            </div>

            {isAuthenticated ? (

              <div className={styles.info}>

                <strong>
                  {shipping.firstName}{' '}
                  {shipping.lastName}
                </strong>

                {shipping.address1 && (
                  <p>
                    {shipping.address1}
                  </p>
                )}

                {shipping.address2 && (
                  <p>
                    {shipping.address2}
                  </p>
                )}

                {(shipping.city ||
                  shipping.state ||
                  shipping.postcode) && (

                  <p>
                    {shipping.city}
                    {shipping.city &&
                      shipping.state
                      ? ', '
                      : ''}

                    {shipping.state}{' '}

                    {shipping.postcode}
                  </p>

                )}

                {shipping.country && (
                  <p>
                    {shipping.country}
                  </p>
                )}

              </div>

            ) : (

              <div className={styles.guestForm}>

                <div className={styles.field}>

                  <label>
                    Street Address *
                  </label>

                  <input
                    value={shipping.address1}
                    onChange={(e) =>
                      updateShipping(
                        'address1',
                        e.target.value
                      )
                    }
                  />

                </div>

                <div className={styles.field}>

                  <label>
                    Apartment, Suite, Unit
                  </label>

                  <input
                    value={shipping.address2}
                    onChange={(e) =>
                      updateShipping(
                        'address2',
                        e.target.value
                      )
                    }
                  />

                </div>

                <div className={styles.formRow}>

                  <div className={styles.field}>

                    <label>
                      City *
                    </label>

                    <input
                      value={shipping.city}
                      onChange={(e) =>
                        updateShipping(
                          'city',
                          e.target.value
                        )
                      }
                    />

                  </div>

                  <div className={styles.field}>

                    <label>
                      State *
                    </label>

                    <input
                      value={shipping.state}
                      onChange={(e) =>
                        updateShipping(
                          'state',
                          e.target.value
                        )
                      }
                    />

                  </div>

                </div>

                <div className={styles.formRow}>

                  <div className={styles.field}>

                    <label>
                      ZIP Code *
                    </label>

                    <input
                      value={shipping.postcode}
                      onChange={(e) =>
                        updateShipping(
                          'postcode',
                          e.target.value
                        )
                      }
                    />

                  </div>

                  <div className={styles.field}>

                    <label>
                      Country *
                    </label>

                    <select
                      value={shipping.country}
                      onChange={(e) =>
                        updateShipping(
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

              </div>

            )}

          </section>

          {/* Shipping Method */}
          <section className={styles.card}>

            <h3>
              Shipping Method
            </h3>

            <div className={styles.shippingMethods}>

              {shippingMethods.map(
                (method) => (

                  <label
                    key={method.id}
                    className={
                      selectedShipping ===
                      method.id
                        ? `${styles.shippingMethod} ${styles.shippingMethodActive}`
                        : styles.shippingMethod
                    }
                  >

                    <input
                      type="radio"
                      name="shipping-method"
                      value={method.id}
                      checked={
                        selectedShipping ===
                        method.id
                      }
                      onChange={() =>
                        onShippingChangeMethod(
                          method.id
                        )
                      }
                    />

                    <div
                      className={
                        styles.shippingDetails
                      }
                    >

                      <strong>
                        {method.name}
                      </strong>

                      {method.description && (
                        <small>
                          {method.description}
                        </small>
                      )}

                    </div>

                    <strong>
                      $
                      {method.price.toFixed(
                        2
                      )}
                    </strong>

                  </label>

                )
              )}

            </div>

          </section>

          <button
            type="button"
            className={styles.continueBtn}
          >
            Continue to Billing
          </button>

        </main>

        {/* RIGHT */}
        <aside className={styles.right}>

          <section className={styles.summary}>

            <h3>
              Order Summary
            </h3>

            {products.map((product) => (

              <div
                key={product.id}
                className={styles.product}
              >

                <div
                  className={styles.productImage}
                >

                  {product.image ? (

                    <img
                      src={product.image}
                      alt={product.name}
                    />

                  ) : (

                    <div
                      className={
                        styles.imagePlaceholder
                      }
                    />

                  )}

                </div>

                <div
                  className={styles.productInfo}
                >

                  <strong>
                    {product.name}
                  </strong>

                  <p>
                    Qty: {product.quantity}
                  </p>

                </div>

                <strong>
                  $
                  {product.total.toFixed(
                    2
                  )}
                </strong>

              </div>

            ))}

            <div className={styles.row}>

              <span>
                Subtotal
              </span>

              <span>
                $
                {subtotal.toFixed(2)}
              </span>

            </div>

            <div className={styles.row}>

              <span>
                Shipping
              </span>

              <span>
                $
                {selectedShippingMethod.price.toFixed(
                  2
                )}
              </span>

            </div>

            <div className={styles.total}>

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