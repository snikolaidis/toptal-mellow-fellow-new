import { useState, useEffect, useCallback } from 'react';
import { CheckoutFormData, AddressData } from '@/types/checkout';
import { COUNTRIES, getStatesForCountry } from '@/constants/geography';
import { validateCheckoutForm, isValid, ValidationErrors } from '@/lib/validation';
import { useCart } from '@/context/CartContext';

interface CheckoutFormProps {
  onSubmit: (data: CheckoutFormData) => void;
  initialData: CheckoutFormData | null;
}

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

export default function CheckoutForm({ onSubmit, initialData }: CheckoutFormProps) {
  const { cart, updateShippingMethod } = useCart();
  const [billing, setBilling] = useState<AddressData>(
    initialData?.billing || emptyAddress
  );
  const [shipping, setShipping] = useState<AddressData>(
    initialData?.shipping || emptyAddress
  );
  const [sameAsBilling, setSameAsBilling] = useState(
    initialData?.sameAsBilling ?? true
  );
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [selectedShippingMethod, setSelectedShippingMethod] = useState<string | null>(null);
  const [isUpdatingShipping, setIsUpdatingShipping] = useState(false);

  // Get available shipping methods from cart
  const shippingMethods = cart?.availableShippingMethods?.[0]?.rates || [];
  const chosenMethod = cart?.chosenShippingMethods?.[0] || null;

  // Check if shipping address is complete enough to calculate rates
  const shippingAddress = sameAsBilling ? billing : shipping;
  const hasCompleteShippingAddress =
    shippingAddress.country &&
    shippingAddress.state &&
    shippingAddress.postcode &&
    shippingAddress.postcode.length >= 5;

  // Sync local state with chosen method from cart
  useEffect(() => {
    if (chosenMethod && !selectedShippingMethod) {
      setSelectedShippingMethod(chosenMethod);
    }
  }, [chosenMethod, selectedShippingMethod]);

  // Auto-select first shipping method if available and none selected
  useEffect(() => {
    if (shippingMethods.length > 0 && !selectedShippingMethod && !chosenMethod) {
      handleSelectShippingMethod(shippingMethods[0].id);
    }
  }, [shippingMethods, selectedShippingMethod, chosenMethod]);

  const handleSelectShippingMethod = useCallback(async (methodId: string) => {
    setSelectedShippingMethod(methodId);
    setIsUpdatingShipping(true);

    try {
      await updateShippingMethod(methodId);
    } catch {
      // Error handled by context
    } finally {
      setIsUpdatingShipping(false);
    }
  }, [updateShippingMethod]);

  const validateForm = (): boolean => {
    const formData: CheckoutFormData = {
      billing,
      shipping: sameAsBilling ? billing : shipping,
      sameAsBilling,
    };
    const newErrors = validateCheckoutForm(formData);

    // Also validate shipping method if methods are available
    if (shippingMethods.length > 0 && !selectedShippingMethod) {
      newErrors['shippingMethod'] = 'Please select a shipping method';
    }

    setErrors(newErrors);
    return isValid(newErrors);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    onSubmit({
      billing,
      shipping: sameAsBilling ? billing : shipping,
      sameAsBilling,
    });
  };

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

  const renderAddressFields = (
    prefix: 'billing' | 'shipping',
    data: AddressData,
    update: (field: keyof AddressData, value: string) => void,
    showEmail = false
  ) => (
    <div className="address-fields">
      <div className="form-row">
        <div className="form-group">
          <label htmlFor={`${prefix}-firstName`}>First Name *</label>
          <input
            type="text"
            id={`${prefix}-firstName`}
            value={data.firstName}
            onChange={(e) => update('firstName', e.target.value)}
            autoComplete="given-name"
            className={errors[`${prefix}.firstName`] ? 'error' : ''}
          />
          {errors[`${prefix}.firstName`] && (
            <span className="error-text">{errors[`${prefix}.firstName`]}</span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor={`${prefix}-lastName`}>Last Name *</label>
          <input
            type="text"
            id={`${prefix}-lastName`}
            value={data.lastName}
            onChange={(e) => update('lastName', e.target.value)}
            autoComplete="family-name"
            className={errors[`${prefix}.lastName`] ? 'error' : ''}
          />
          {errors[`${prefix}.lastName`] && (
            <span className="error-text">{errors[`${prefix}.lastName`]}</span>
          )}
        </div>
      </div>

      {showEmail && (
        <div className="form-row">
          <div className="form-group">
            <label htmlFor={`${prefix}-email`}>Email *</label>
            <input
              type="email"
              id={`${prefix}-email`}
              value={data.email}
              onChange={(e) => update('email', e.target.value)}
              autoComplete="email"
              className={errors[`${prefix}.email`] ? 'error' : ''}
            />
            {errors[`${prefix}.email`] && (
              <span className="error-text">{errors[`${prefix}.email`]}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor={`${prefix}-phone`}>Phone</label>
            <input
              type="tel"
              id={`${prefix}-phone`}
              value={data.phone || ''}
              onChange={(e) => update('phone', e.target.value)}
              autoComplete="tel"
            />
          </div>
        </div>
      )}

      <div className="form-group">
        <label htmlFor={`${prefix}-address1`}>Address *</label>
        <input
          type="text"
          id={`${prefix}-address1`}
          value={data.address1}
          onChange={(e) => update('address1', e.target.value)}
          autoComplete="address-line1"
          className={errors[`${prefix}.address1`] ? 'error' : ''}
        />
        {errors[`${prefix}.address1`] && (
          <span className="error-text">{errors[`${prefix}.address1`]}</span>
        )}
      </div>

      <div className="form-group">
        <label htmlFor={`${prefix}-address2`}>Apartment, suite, etc.</label>
        <input
          type="text"
          id={`${prefix}-address2`}
          value={data.address2 || ''}
          onChange={(e) => update('address2', e.target.value)}
          autoComplete="address-line2"
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor={`${prefix}-city`}>City *</label>
          <input
            type="text"
            id={`${prefix}-city`}
            value={data.city}
            onChange={(e) => update('city', e.target.value)}
            autoComplete="address-level2"
            className={errors[`${prefix}.city`] ? 'error' : ''}
          />
          {errors[`${prefix}.city`] && (
            <span className="error-text">{errors[`${prefix}.city`]}</span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor={`${prefix}-state`}>State *</label>
          <select
            id={`${prefix}-state`}
            value={data.state}
            onChange={(e) => update('state', e.target.value)}
            autoComplete="address-level1"
            className={errors[`${prefix}.state`] ? 'error' : ''}
          >
            <option value="">Select State</option>
            {getStatesForCountry(data.country).map((state) => (
              <option key={state.code} value={state.code}>
                {state.name}
              </option>
            ))}
          </select>
          {errors[`${prefix}.state`] && (
            <span className="error-text">{errors[`${prefix}.state`]}</span>
          )}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor={`${prefix}-postcode`}>ZIP Code *</label>
          <input
            type="text"
            id={`${prefix}-postcode`}
            value={data.postcode}
            onChange={(e) => update('postcode', e.target.value)}
            autoComplete="postal-code"
            className={errors[`${prefix}.postcode`] ? 'error' : ''}
          />
          {errors[`${prefix}.postcode`] && (
            <span className="error-text">{errors[`${prefix}.postcode`]}</span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor={`${prefix}-country`}>Country *</label>
          <select
            id={`${prefix}-country`}
            value={data.country}
            onChange={(e) => update('country', e.target.value)}
            autoComplete="country"
            className={errors[`${prefix}.country`] ? 'error' : ''}
          >
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
          {errors[`${prefix}.country`] && (
            <span className="error-text">{errors[`${prefix}.country`]}</span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="checkout-form">
      <section className="form-section" aria-labelledby="contact-heading">
        <h2 id="contact-heading">Contact information</h2>
        <div className="form-group">
          <label htmlFor="billing-email">Email *</label>
          <input
            type="email"
            id="billing-email"
            value={billing.email}
            onChange={(e) => updateBilling('email', e.target.value)}
            autoComplete="email"
            className={errors['billing.email'] ? 'error' : ''}
          />
          {errors['billing.email'] && (
            <span className="error-text">{errors['billing.email']}</span>
          )}
        </div>
      </section>

      <section className="form-section" aria-labelledby="shipping-heading">
        <h2 id="shipping-heading">Shipping address</h2>
        {renderAddressFields('billing', billing, updateBilling, false)}

        <div className="checkbox-group">
          <input
            type="checkbox"
            id="sameAsBilling"
            checked={sameAsBilling}
            onChange={(e) => setSameAsBilling(e.target.checked)}
          />
          <label htmlFor="sameAsBilling">Billing address same as shipping</label>
        </div>
      </section>

      {!sameAsBilling && (
        <section className="form-section" aria-labelledby="billing-heading">
          <h2 id="billing-heading">Billing address</h2>
          {renderAddressFields('shipping', shipping, updateShipping)}
        </section>
      )}

      {/* Shipping method selection */}
      {hasCompleteShippingAddress && shippingMethods.length > 0 && (
        <section className="form-section" aria-labelledby="shipping-method-heading">
          <h2 id="shipping-method-heading">Shipping method</h2>

          <div className="shipping-methods">
            {shippingMethods.map((method) => (
              <label
                key={method.id}
                className={`shipping-option ${selectedShippingMethod === method.id ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="shippingMethod"
                  value={method.id}
                  checked={selectedShippingMethod === method.id}
                  onChange={() => handleSelectShippingMethod(method.id)}
                  disabled={isUpdatingShipping}
                />
                <span className="shipping-option-content">
                  <span className="shipping-method-label">{method.label}</span>
                  <span className="shipping-method-cost">{method.cost}</span>
                </span>
              </label>
            ))}
          </div>

          {errors['shippingMethod'] && (
            <span className="error-text">{errors['shippingMethod']}</span>
          )}

          {isUpdatingShipping && (
            <p className="shipping-updating">Updating shipping...</p>
          )}
        </section>
      )}

      {hasCompleteShippingAddress && shippingMethods.length === 0 && (
        <section className="form-section">
          <p className="no-shipping-methods">
            No shipping methods available for this address. Please verify your shipping address.
          </p>
        </section>
      )}

      <button type="submit" className="btn btn-primary continue-btn">
        Continue to Payment
      </button>
    </form>
  );
}
