import { useState } from 'react';
import { getBrowserClient } from '@/lib/apollo-client';
import { SUBMIT_CONTACT_FORM } from '@/graphql/mutations/contact';

// Form ID is per-install -> env-driven (fallback to local form 1).
// Field IDs survive export/import, so they're safe to hardcode.
const FORM_ID = process.env.NEXT_PUBLIC_PRESS_CONTACT_FORM_ID || '1';
const FIELD = { name: 1, email: 3, message: 4 };
const FIELD_BY_ID: Record<number, 'name' | 'email' | 'message'> = {
  [FIELD.name]: 'name',
  [FIELD.email]: 'email',
  [FIELD.message]: 'message',
};

// Loose sanity check for instant feedback on obvious typos, intentionally NOT
// full email validation (not possible via regex). The required GF Email field
// re-validates server-side and is the source of truth, this just saves
// a round-trip on clearly-bad input.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = 'idle' | 'submitting' | 'success' | 'error';
type Values = { name: string; email: string; message: string };

interface SubmitGfFormResult {
  submitGfForm: {
    errors: { id: number; message: string }[] | null;
    confirmation: { message: string } | null;
    entry: { id: string } | null;
  };
}

export default function ContactForm() {
  const [values, setValues] = useState<Values>({ name: '', email: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>('idle');

  const update = (field: keyof Values, value: string) =>
    setValues((v) => ({ ...v, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // client-side validation - Email and Message required, Name optional
    const nextErrors: Record<string, string> = {};
    if (!values.email.trim()) nextErrors.email = 'Email is required';
    else if (!EMAIL_RE.test(values.email)) nextErrors.email = 'Email is invalid';
    if (!values.message.trim()) nextErrors.message = 'Message is required';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    // build field values - NOTE the email shape differs from the text fields.
    setErrors({});
    setStatus('submitting');
    const fieldValues = [
      { id: FIELD.name, value: values.name },
      // GF Email field takes 'emailValues', not a plain 'value'.
      { id: FIELD.email, emailValues: { value: values.email } },
      { id: FIELD.message, value: values.message }
    ];

    // submit, then route the response.
    try {
      const { data } = await getBrowserClient().mutate<SubmitGfFormResult>({
        mutation: SUBMIT_CONTACT_FORM,
        variables: { formId: FORM_ID, fieldValues },
      });

      const gfErrors = data?.submitGfForm.errors ?? [];
      if (gfErrors.length) {
        const mapped: Record<string, string> = {};
        gfErrors.forEach((err) => {
          mapped[FIELD_BY_ID[err.id] ?? 'form'] = err.message;
        });
        setErrors(mapped);
        setStatus('idle');
        return;
      }

      setStatus('success');
      setValues({ name: '', email: '', message: '' });
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return <p>Thanks, your message has been sent. We&rsquo;ll be in touch.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="contact-form" noValidate>
      {status === 'error' && (
        <p className="error-text">
          Something went wrong. Please try again.
        </p>
      )}

      <div className="form-group">
        <label htmlFor="contact-name">Name</label>
        <input
          type="text"
          id="contact-name"
          value={values.name}
          onChange={(e) => update('name', e.target.value)}
          autoComplete="name"
        />
      </div>

      <div className="form-group">
        <label htmlFor="contact-email">Email *</label>
        <input
          type="email"
          id="contact-email"
          value={values.email}
          onChange={(e) => update('email', e.target.value)}
          autoComplete="email"
          className={errors.email ? 'error' : ''}
        />
        {errors.email && <span className="error-text">{errors.email}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="contact-message">Message *</label>
        <textarea
          id="contact-message"
          value={values.message}
          onChange={(e) => update('message', e.target.value)}
          rows={5}
          className={errors.message ? 'error' : ''}
        />
        {errors.message && <span className="error-text">{errors.message}</span>}
      </div>

      {errors.form && <p className="error-text">{errors.form}</p>}

      <button type="submit" className="btn-primary" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Sending...' : 'Submit'}
      </button>
    </form>
  );
}