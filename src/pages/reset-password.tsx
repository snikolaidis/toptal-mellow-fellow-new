import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { getBrowserClient } from '@/lib/apollo-client';
import { RESET_USER_PASSWORD } from '@/graphql/queries/auth';
import styles from '@/styles/pages/auth.module.css';

type Status = 'idle' | 'submitting';

export default function ResetPasswordPage() {
  const router = useRouter();
  const key = (router.query.key as string) || '';
  const login = (router.query.login as string) || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (!key || !login) {
      setError('This reset link is invalid or has expired. Request a new one.');
      return;
    }

    setStatus('submitting');
    try {
      await getBrowserClient().mutate({
        mutation: RESET_USER_PASSWORD,
        variables: { key, login, password },
      });
      router.push('/login?reset=true');
    } catch {
      setError('This reset link is invalid or has expired. Request a new one.');
      setStatus('idle');
    }
  };

  return (
    <Layout title="Set a new password">
      <div className={styles.container}>
        <div className={styles.card}>
          <h1 className={`${styles.title} lowercase`}>set a new password</h1>
          <p className={styles.subtitle}>Enter and confirm your new password.</p>

          <form onSubmit={handleSubmit} className={styles.form}>
            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}

            <div className={styles.formGroup}>
              <label htmlFor="password" className={styles.label}>
                New password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={status === 'submitting'}
                autoComplete="new-password"
                required
                className={styles.input}
                placeholder="At least 8 characters"
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="confirm" className={styles.label}>
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={status === 'submitting'}
                autoComplete="new-password"
                required
                className={styles.input}
                placeholder="Re-enter password"
              />
            </div>

            <button type="submit" disabled={status === 'submitting'} className={styles.submitBtn}>
              {status === 'submitting' ? 'Saving...' : 'Save new password'}
            </button>
          </form>

          <div className={styles.footer}>
            <p className={styles.footerText}>
              <Link href="/login" className={styles.footerLink}>
                Back to sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
