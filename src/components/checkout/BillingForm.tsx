import { AddressData } from '@/types/checkout';
import { COUNTRIES, getStatesForCountry, US_STATES } from '@/constants/geography';
import { ValidationErrors } from '@/lib/validation';
import AddressAutocomplete from './AddressAutocomplete';

interface BillingFormProps {
  billing: AddressData;
  errors: ValidationErrors;
  onUpdate: (field: keyof AddressData, value: string) => void;
  onSubmit: () => void;
}

export default function BillingForm({ billing, errors, onUpdate, onSubmit }: BillingFormProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="checkout-form">
      <section className="form-section" aria-labelledby="contact-heading">
        <h2 id="contact-heading">contact information</h2>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="billing-email">Email *</label>
            <input
              type="email"
              id="billing-email"
              value={billing.email}
              onChange={(e) => onUpdate('email', e.target.value)}
              autoComplete="email"
              className={errors['billing.email'] ? 'error' : ''}
            />
            {errors['billing.email'] && (
              <span className="error-text">{errors['billing.email']}</span>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="billing-phone">Phone</label>
            <input
              type="tel"
              id="billing-phone"
              value={billing.phone || ''}
              onChange={(e) => onUpdate('phone', e.target.value)}
              autoComplete="tel"
            />
          </div>
        </div>
      </section>

      <section className="form-section" aria-labelledby="billing-heading">
        <h2 id="billing-heading">billing address</h2>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="billing-firstName">First Name *</label>
            <input
              type="text"
              id="billing-firstName"
              value={billing.firstName}
              onChange={(e) => onUpdate('firstName', e.target.value)}
              autoComplete="given-name"
              className={errors['billing.firstName'] ? 'error' : ''}
            />
            {errors['billing.firstName'] && (
              <span className="error-text">{errors['billing.firstName']}</span>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="billing-lastName">Last Name *</label>
            <input
              type="text"
              id="billing-lastName"
              value={billing.lastName}
              onChange={(e) => onUpdate('lastName', e.target.value)}
              autoComplete="family-name"
              className={errors['billing.lastName'] ? 'error' : ''}
            />
            {errors['billing.lastName'] && (
              <span className="error-text">{errors['billing.lastName']}</span>
            )}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="billing-address1">Address *</label>
          <AddressAutocomplete
            id="billing-address1"
            value={billing.address1}
            onChange={(v) => onUpdate('address1', v)}
            onSelectAddress={(a) => {
              onUpdate('address1', a.line1);
              onUpdate('city', a.city);
              onUpdate('country', a.countryCode);
              const st = US_STATES.find((s) => s.name.toLowerCase() === a.state.toLowerCase());
              if (st) onUpdate('state', st.code);
              onUpdate('postcode', a.postcode);
            }}
            autoComplete="address-line1"
            className={errors['billing.address1'] ? 'error' : ''}
          />
          {errors['billing.address1'] && (
            <span className="error-text">{errors['billing.address1']}</span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="billing-address2">Apartment, suite, etc.</label>
          <input
            type="text"
            id="billing-address2"
            value={billing.address2 || ''}
            onChange={(e) => onUpdate('address2', e.target.value)}
            autoComplete="address-line2"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="billing-city">City *</label>
            <input
              type="text"
              id="billing-city"
              value={billing.city}
              onChange={(e) => onUpdate('city', e.target.value)}
              autoComplete="address-level2"
              className={errors['billing.city'] ? 'error' : ''}
            />
            {errors['billing.city'] && (
              <span className="error-text">{errors['billing.city']}</span>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="billing-state">State *</label>
            <select
              id="billing-state"
              value={billing.state}
              onChange={(e) => onUpdate('state', e.target.value)}
              autoComplete="address-level1"
              className={errors['billing.state'] ? 'error' : ''}
            >
              <option value="">Select State</option>
              {getStatesForCountry(billing.country).map((state) => (
                <option key={state.code} value={state.code}>
                  {state.name}
                </option>
              ))}
            </select>
            {errors['billing.state'] && (
              <span className="error-text">{errors['billing.state']}</span>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="billing-postcode">ZIP Code *</label>
            <input
              type="text"
              id="billing-postcode"
              value={billing.postcode}
              onChange={(e) => onUpdate('postcode', e.target.value)}
              autoComplete="postal-code"
              className={errors['billing.postcode'] ? 'error' : ''}
            />
            {errors['billing.postcode'] && (
              <span className="error-text">{errors['billing.postcode']}</span>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="billing-country">Country *</label>
            <select
              id="billing-country"
              value={billing.country}
              onChange={(e) => onUpdate('country', e.target.value)}
              autoComplete="country"
              className={errors['billing.country'] ? 'error' : ''}
            >
              {COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
            {errors['billing.country'] && (
              <span className="error-text">{errors['billing.country']}</span>
            )}
          </div>
        </div>
      </section>

      <button type="submit" className="btn-primary continue-btn">
        Continue to Shipping
      </button>
    </form>
  );
}
