import { useState, useEffect, useCallback } from 'react';
import { AddressData } from '@/types/checkout';
import { COUNTRIES, getStatesForCountry } from '@/constants/geography';
import { ValidationErrors } from '@/lib/validation';
import { useCart } from '@/context/CartContext';

interface ShippingFormProps {
  billing: AddressData;
  shipping: AddressData;
  sameAsBilling: boolean;
  errors: ValidationErrors;
  onUpdateShipping: (field: keyof AddressData, value: string) => void;
  onSameAsBillingChange: (value: boolean) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export default function ShippingForm({
  billing,
  shipping,
  sameAsBilling,
  errors,
  onUpdateShipping,
  onSameAsBillingChange,
  onSubmit,
  onBack,
}: ShippingFormProps) {
  const { cart, updateShippingMethod } = useCart();
  const [selectedShippingMethod, setSelectedShippingMethod] = useState<string | null>(null);
  const [isUpdatingShipping, setIsUpdatingShipping] = useState(false);
  const [methodError, setMethodError] = useState<string | null>(null);

  // Get available shipping methods from cart
  const shippingMethods = cart?.availableShippingMethods?.[0]?.rates || [];
  const chosenMethod = cart?.chosenShippingMethods?.[0] || null;

  // Determine the actual shipping address to use
  const shippingAddress = sameAsBilling ? billing : shipping;

  // Check if shipping address is complete enough to calculate rates
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
    setMethodError(null);

    try {
      await updateShippingMethod(methodId);
    } catch {
      setMethodError('Failed to update shipping method');
    } finally {
      setIsUpdatingShipping(false);
    }
  }, [updateShippingMethod]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate shipping method is selected
    if (shippingMethods.length > 0 && !selectedShippingMethod) {
      setMethodError('Please select a shipping method');
      return;
    }

    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="checkout-form">
      <section className="form-section" aria-labelledby="shipping-heading">
        <h2 id="shipping-heading">shipping address</h2>

        <div className="checkbox-group" style={{ marginBottom: '1.5rem' }}>
          <input
            type="checkbox"
            id="sameAsBilling"
            checked={sameAsBilling}
            onChange={(e) => onSameAsBillingChange(e.target.checked)}
          />
          <label htmlFor="sameAsBilling">Same as billing address</label>
        </div>

        {sameAsBilling ? (
          <div className="saved-address" style={{
            padding: '1rem',
            backgroundColor: '#F5F5F0',
            border: '1px solid #D5D0C9',
            marginBottom: '1.5rem'
          }}>
            <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
              {billing.firstName} {billing.lastName}
            </p>
            <p style={{ color: '#8A8683', fontSize: '0.875rem' }}>
              {billing.address1}
              {billing.address2 && <>, {billing.address2}</>}
              <br />
              {billing.city}, {billing.state} {billing.postcode}
              <br />
              {billing.country}
            </p>
          </div>
        ) : (
          <>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="shipping-firstName">First Name *</label>
                <input
                  type="text"
                  id="shipping-firstName"
                  value={shipping.firstName}
                  onChange={(e) => onUpdateShipping('firstName', e.target.value)}
                  autoComplete="shipping given-name"
                  className={errors['shipping.firstName'] ? 'error' : ''}
                />
                {errors['shipping.firstName'] && (
                  <span className="error-text">{errors['shipping.firstName']}</span>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="shipping-lastName">Last Name *</label>
                <input
                  type="text"
                  id="shipping-lastName"
                  value={shipping.lastName}
                  onChange={(e) => onUpdateShipping('lastName', e.target.value)}
                  autoComplete="shipping family-name"
                  className={errors['shipping.lastName'] ? 'error' : ''}
                />
                {errors['shipping.lastName'] && (
                  <span className="error-text">{errors['shipping.lastName']}</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="shipping-address1">Address *</label>
              <input
                type="text"
                id="shipping-address1"
                value={shipping.address1}
                onChange={(e) => onUpdateShipping('address1', e.target.value)}
                autoComplete="shipping address-line1"
                className={errors['shipping.address1'] ? 'error' : ''}
              />
              {errors['shipping.address1'] && (
                <span className="error-text">{errors['shipping.address1']}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="shipping-address2">Apartment, suite, etc.</label>
              <input
                type="text"
                id="shipping-address2"
                value={shipping.address2 || ''}
                onChange={(e) => onUpdateShipping('address2', e.target.value)}
                autoComplete="shipping address-line2"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="shipping-city">City *</label>
                <input
                  type="text"
                  id="shipping-city"
                  value={shipping.city}
                  onChange={(e) => onUpdateShipping('city', e.target.value)}
                  autoComplete="shipping address-level2"
                  className={errors['shipping.city'] ? 'error' : ''}
                />
                {errors['shipping.city'] && (
                  <span className="error-text">{errors['shipping.city']}</span>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="shipping-state">State *</label>
                <select
                  id="shipping-state"
                  value={shipping.state}
                  onChange={(e) => onUpdateShipping('state', e.target.value)}
                  autoComplete="shipping address-level1"
                  className={errors['shipping.state'] ? 'error' : ''}
                >
                  <option value="">Select State</option>
                  {getStatesForCountry(shipping.country).map((state) => (
                    <option key={state.code} value={state.code}>
                      {state.name}
                    </option>
                  ))}
                </select>
                {errors['shipping.state'] && (
                  <span className="error-text">{errors['shipping.state']}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="shipping-postcode">ZIP Code *</label>
                <input
                  type="text"
                  id="shipping-postcode"
                  value={shipping.postcode}
                  onChange={(e) => onUpdateShipping('postcode', e.target.value)}
                  autoComplete="shipping postal-code"
                  className={errors['shipping.postcode'] ? 'error' : ''}
                />
                {errors['shipping.postcode'] && (
                  <span className="error-text">{errors['shipping.postcode']}</span>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="shipping-country">Country *</label>
                <select
                  id="shipping-country"
                  value={shipping.country}
                  onChange={(e) => onUpdateShipping('country', e.target.value)}
                  autoComplete="shipping country"
                  className={errors['shipping.country'] ? 'error' : ''}
                >
                  {COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
                {errors['shipping.country'] && (
                  <span className="error-text">{errors['shipping.country']}</span>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Shipping method selection */}
      {hasCompleteShippingAddress && shippingMethods.length > 0 && (
        <section className="form-section" aria-labelledby="shipping-method-heading">
          <h2 id="shipping-method-heading">shipping method</h2>

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

          {(methodError || errors['shippingMethod']) && (
            <span className="error-text">{methodError || errors['shippingMethod']}</span>
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

      <div className="form-actions" style={{ marginTop: '1.5rem', borderTop: 'none', paddingTop: 0 }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={onBack}
          style={{ flex: 1 }}
        >
          Back
        </button>
        <button type="submit" className="btn-primary" style={{ flex: 1 }}>
          Continue to Payment
        </button>
      </div>
    </form>
  );
}
