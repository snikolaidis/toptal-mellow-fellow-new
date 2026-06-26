import { useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { getBrowserClient } from '@/lib/apollo-client';
import { SEND_PASSWORD_RESET_EMAIL } from '@/graphql/queries/auth';
import styles from '@/styles/pages/auth.module.css';

type Status = 'idle' | 'submitting' | 'sent';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError('Please enter your email');
      return;
    }

    setStatus('submitting');
    try {
      await getBrowserClient().mutate({
        mutation: SEND_PASSWORD_RESET_EMAIL,
        variables: { username: email },
      });
    } catch {
      setStatus('sent');
      return;
    }
    setStatus('sent');
  };

  return (
    <Layout title="Reset password">
      <div className={styles.container}>
        <div className={styles.card}>
          <h1 className={`${styles.title} lowercase`}>reset your password</h1>

          {status === 'sent' ? (
            <>
              <p className={styles.subtitle}>
                If an account exists for {email}, we sent a link to reset your password. Check your
                inbox and your spam folder.
              </p>
              <div className={styles.footer}>
                <p className={styles.footerText}>
                  <Link href="/login" className={styles.footerLink}>
                    Back to sign in
                  </Link>
                </p>
              </div>
            </>
          ) : (
            <>
              <p className={styles.subtitle}>Enter your email and we will send you a reset link.</p>

              <form onSubmit={handleSubmit} className={styles.form}>
                {error && (
                  <div className={styles.error} role="alert">
                    {error}
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label htmlFor="email" className={styles.label}>
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={status === 'submitting'}
                    autoComplete="email"
                    required
                    className={styles.input}
                    placeholder="your@email.com"
                  />
                </div>

                <button type="submit" disabled={status === 'submitting'} className={styles.submitBtn}>
                  {status === 'submitting' ? 'Sending...' : 'Send reset link'}
                </button>
              </form>

              <div className={styles.footer}>
                <p className={styles.footerText}>
                  <Link href="/login" className={styles.footerLink}>
                    Back to sign in
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
