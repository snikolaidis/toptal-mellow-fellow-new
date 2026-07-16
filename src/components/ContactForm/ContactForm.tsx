import { useState } from 'react';
import { getBrowserClient } from '@/lib/apollo-client';
import { SUBMIT_CONTACT_FORM } from '@/graphql/mutations/contact';
import styles from '@/styles/pages/contact-form.module.css';

export type ContactFieldType = 'text' | 'email' | 'textarea' | 'select';

export interface ContactFieldOption {
  label: string;
  value: string;
}

export interface ContactFieldConfig {
  id: number;
  key: string;
  type: ContactFieldType;
  label: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  options?: ContactFieldOption[];
  span?: 'half' | 'full';
}

const PRESS_FORM_ID = process.env.NEXT_PUBLIC_PRESS_CONTACT_FORM_ID || '1';

const PRESS_FIELDS: ContactFieldConfig[] = [
  { id: 1, key: 'name', type: 'text', label: 'Name', autoComplete: 'name' },
  { id: 3, key: 'email', type: 'email', label: 'Email', required: true, autoComplete: 'email' },
  { id: 4, key: 'message', type: 'textarea', label: 'Message', required: true },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = 'idle' | 'submitting' | 'success' | 'error';
type Values = Record<string, string>;

interface SubmitGfFormResult {
  submitGfForm: {
    errors: { id: number; message: string }[] | null;
    confirmation: { message: string } | null;
    entry: { id: string } | null;
  };
}

interface ContactFormProps {
  formId?: string;
  fields?: ContactFieldConfig[];
  successMessage?: string;
}

export default function ContactForm({
  formId = PRESS_FORM_ID,
  fields = PRESS_FIELDS,
  successMessage = 'Thanks, your message has been sent. We’ll be in touch.',
}: ContactFormProps) {
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(fields.map((field) => [field.key, '']))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>('idle');

  const update = (key: string, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nextErrors: Record<string, string> = {};
    fields.forEach((field) => {
      const value = (values[field.key] || '').trim();
      if (field.required && !value) {
        nextErrors[field.key] = `${field.label} is required`;
        return;
      }
      if (field.type === 'email' && value && !EMAIL_RE.test(value)) {
        nextErrors[field.key] = `${field.label} is invalid`;
      }
    });
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setStatus('submitting');

    const fieldValues = fields.map((field) => {
      const value = values[field.key] || '';
      if (field.type === 'email') {
        return { id: field.id, emailValues: { value } };
      }
      return { id: field.id, value };
    });

    try {
      const { data } = await getBrowserClient().mutate<SubmitGfFormResult>({
        mutation: SUBMIT_CONTACT_FORM,
        variables: { formId, fieldValues },
      });

      const gfErrors = data?.submitGfForm.errors ?? [];
      if (gfErrors.length) {
        const keyById = new Map(fields.map((field) => [field.id, field.key]));
        const mapped: Record<string, string> = {};
        gfErrors.forEach((err) => {
          mapped[keyById.get(err.id) ?? 'form'] = err.message;
        });
        setErrors(mapped);
        setStatus('idle');
        return;
      }

      setStatus('success');
      setValues(Object.fromEntries(fields.map((field) => [field.key, ''])));
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return <p>{successMessage}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className={styles.contactForm} noValidate>
      {status === 'error' && (
        <p className="error-text">
          Something went wrong. Please try again.
        </p>
      )}

      {fields.map((field) => {
        const inputId = `contact-${field.key}`;
        const errorClass = errors[field.key] ? 'error' : '';

        return (
          <div className="form-group" data-span={field.span} key={field.key}>
            <label htmlFor={inputId}>
              {field.required ? `${field.label} *` : field.label}
            </label>

            {field.type === 'textarea' && (
              <textarea
                id={inputId}
                value={values[field.key] || ''}
                onChange={(e) => update(field.key, e.target.value)}
                rows={5}
                className={errorClass}
              />
            )}

            {field.type === 'select' && (
              <select
                id={inputId}
                value={values[field.key] || ''}
                onChange={(e) => update(field.key, e.target.value)}
                className={errorClass}
              >
                <option value="">{field.placeholder || 'Please select'}</option>
                {(field.options || []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}

            {(field.type === 'text' || field.type === 'email') && (
              <input
                type={field.type === 'email' ? 'email' : 'text'}
                id={inputId}
                value={values[field.key] || ''}
                onChange={(e) => update(field.key, e.target.value)}
                autoComplete={field.autoComplete}
                className={errorClass}
              />
            )}

            {errors[field.key] && <span className="error-text">{errors[field.key]}</span>}
          </div>
        );
      })}

      {errors.form && <p className="error-text">{errors.form}</p>}

      <div className={styles.actions}>
        <button type="submit" className="btn-primary" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Sending...' : 'Submit'}
        </button>
      </div>
    </form>
  );
}
