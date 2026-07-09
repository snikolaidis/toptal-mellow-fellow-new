import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { getApolloAuthClient } from '@faustwp/core';
import { useQuery, useMutation } from '@apollo/client';
import AccountGuard from '@/components/account/AccountGuard';
import { GET_CUSTOMER_BILLING, UPDATE_CUSTOMER } from '@/graphql/queries/auth';

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="account-form__field">
      <span className="account-form__label">{label}</span>
      <input
        className="account-form__input"
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function EditContent() {
  const client = getApolloAuthClient();
  const { data, loading } = useQuery(GET_CUSTOMER_BILLING, { client });
  const [updateCustomer, { loading: saving }] = useMutation(UPDATE_CUSTOMER, { client });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error' | 'mismatch'>('idle');

  useEffect(() => {
    if (data?.customer) {
      setFirstName(data.customer.firstName || '');
      setLastName(data.customer.lastName || '');
      setEmail(data.customer.email || '');
    }
  }, [data]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('idle');
    if (password && password !== confirm) {
      setStatus('mismatch');
      return;
    }
    const input: Record<string, string> = { firstName, lastName, email };
    if (password) input.password = password;
    try {
      await updateCustomer({ variables: { input } });
      setPassword('');
      setConfirm('');
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  if (loading) {
    return (
      <div className="account">
        <p className="account__empty">Loading account...</p>
      </div>
    );
  }

  return (
    <div className="account">
      <div className="account__header">
        <div>
          <h1 className="account__title">Account Details</h1>
          <Link href="/account" className="account__link">
            Back to account
          </Link>
        </div>
      </div>

      <form className="account-form" onSubmit={handleSubmit}>
        <fieldset className="account-form__group">
          <div className="account-form__grid">
            <Field label="First name" value={firstName} onChange={setFirstName} autoComplete="given-name" />
            <Field label="Last name" value={lastName} onChange={setLastName} autoComplete="family-name" />
            <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="email" />
          </div>
        </fieldset>

        <fieldset className="account-form__group">
          <legend className="account__section-title">Change Password</legend>
          <div className="account-form__grid">
            <Field
              label="New password"
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete="new-password"
            />
            <Field
              label="Confirm new password"
              value={confirm}
              onChange={setConfirm}
              type="password"
              autoComplete="new-password"
            />
          </div>
          <p className="account-form__hint">Leave blank to keep your current password.</p>
        </fieldset>

        <div className="account-form__actions">
          <button type="submit" className="account__button" disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          {status === 'saved' && <span className="account-form__note">Changes saved.</span>}
          {status === 'mismatch' && (
            <span className="account-form__note account-form__note--error">Passwords do not match.</span>
          )}
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

export default function EditAccountPage() {
  return (
    <AccountGuard title="Account Details">
      <EditContent />
    </AccountGuard>
  );
}
