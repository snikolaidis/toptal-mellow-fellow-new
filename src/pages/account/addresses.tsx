import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { getApolloAuthClient } from '@faustwp/core';
import { useQuery, useMutation } from '@apollo/client';
import AccountGuard from '@/components/account/AccountGuard';
import { GET_CUSTOMER, UPDATE_CUSTOMER } from '@/graphql/queries/auth';

interface AddressState {
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  phone: string;
  email: string;
}

const EMPTY: AddressState = {
  firstName: '',
  lastName: '',
  company: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  postcode: '',
  country: '',
  phone: '',
  email: '',
};

function fromApi(a: Partial<AddressState> | null | undefined): AddressState {
  return { ...EMPTY, ...(a || {}) };
}

function toInput(a: AddressState, withContact: boolean) {
  const base = {
    firstName: a.firstName,
    lastName: a.lastName,
    company: a.company,
    address1: a.address1,
    address2: a.address2,
    city: a.city,
    state: a.state,
    postcode: a.postcode,
    country: a.country,
  };
  return withContact ? { ...base, phone: a.phone, email: a.email } : base;
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="account-form__field">
      <span className="account-form__label">
        {label}
        {required && ' *'}
      </span>
      <input
        className="account-form__input"
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function AddressFieldset({
  title,
  data,
  set,
  withContact,
}: {
  title: string;
  data: AddressState;
  set: (next: AddressState) => void;
  withContact: boolean;
}) {
  const update = (key: keyof AddressState) => (v: string) => set({ ...data, [key]: v });
  return (
    <fieldset className="account-form__group">
      <legend className="account__section-title">{title}</legend>
      <div className="account-form__grid">
        <Field label="First name" value={data.firstName} onChange={update('firstName')} />
        <Field label="Last name" value={data.lastName} onChange={update('lastName')} />
        <Field label="Company" value={data.company} onChange={update('company')} />
        {withContact && (
          <Field label="Phone" value={data.phone} onChange={update('phone')} type="tel" />
        )}
        <Field label="Address" value={data.address1} onChange={update('address1')} />
        <Field label="Apartment, suite, etc." value={data.address2} onChange={update('address2')} />
        <Field label="City" value={data.city} onChange={update('city')} />
        <Field label="State / Province" value={data.state} onChange={update('state')} />
        <Field label="ZIP / Postal code" value={data.postcode} onChange={update('postcode')} />
        <Field label="Country" value={data.country} onChange={update('country')} />
        {withContact && (
          <Field label="Email" value={data.email} onChange={update('email')} type="email" />
        )}
      </div>
    </fieldset>
  );
}

function AddressesContent() {
  const client = getApolloAuthClient();
  const { data, loading } = useQuery(GET_CUSTOMER, { client });
  const [updateCustomer, { loading: saving }] = useMutation(UPDATE_CUSTOMER, { client });

  const [billing, setBilling] = useState<AddressState>(EMPTY);
  const [shipping, setShipping] = useState<AddressState>(EMPTY);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (data?.customer) {
      setBilling(fromApi(data.customer.billing));
      setShipping(fromApi(data.customer.shipping));
    }
  }, [data]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('idle');
    try {
      await updateCustomer({
        variables: { input: { billing: toInput(billing, true), shipping: toInput(shipping, false) } },
      });
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  if (loading) {
    return (
      <div className="account">
        <p className="account__empty">Loading addresses...</p>
      </div>
    );
  }

  return (
    <div className="account">
      <div className="account__header">
        <div>
          <h1 className="account__title">Addresses</h1>
          <Link href="/account" className="account__link">
            Back to account
          </Link>
        </div>
      </div>

      <form className="account-form" onSubmit={handleSubmit}>
        <AddressFieldset title="Billing Address" data={billing} set={setBilling} withContact />
        <AddressFieldset title="Shipping Address" data={shipping} set={setShipping} withContact={false} />

        <div className="account-form__actions">
          <button type="submit" className="account__button" disabled={saving}>
            {saving ? 'Saving...' : 'Save addresses'}
          </button>
          {status === 'saved' && <span className="account-form__note">Addresses saved.</span>}
          {status === 'error' && (
            <span className="account-form__note account-form__note--error">
              Could not save. Please try again.
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

export default function AddressesPage() {
  return (
    <AccountGuard title="Addresses">
      <AddressesContent />
    </AccountGuard>
  );
}
