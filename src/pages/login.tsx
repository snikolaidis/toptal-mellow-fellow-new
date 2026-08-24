import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useLogin } from '@faustwp/core';
import { useAuth } from '@/context/AuthContext';
import Layout from '@/components/Layout';
import styles from '@/styles/pages/auth.module.css';

const LoadingSpinner = () => (
  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
);

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isReady } = useAuth();
  const { login, loading, data, error } = useLogin();

  const [usernameEmail, setUsernameEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const redirectUrl = (router.query.redirect as string) || '/account';
  const registeredSuccess = router.query.registered === 'true';
  const resetSuccess = router.query.reset === 'true';

  useEffect(() => {
    if (isReady && isAuthenticated) {
      window.location.assign(redirectUrl);
    }
  }, [isReady, isAuthenticated, redirectUrl]);

  useEffect(() => {
    if (data?.generateAuthorizationCode?.code) {
      // Issue a stateless JWT cookie so subsequent pages verify auth locally
      // instead of round-tripping to WordPress. The hard navigation after
      // ensures every context (AuthContext, CartContext) picks up the new state.
      // Retry once if the first attempt fails (WordPress may be warming up).
      const issueJwt = () =>
        fetch('/api/auth/jwt', { method: 'POST', credentials: 'same-origin' });

      issueJwt()
        .then((r) => {
          if (!r.ok) return issueJwt().catch(() => {});
        })
        .catch(() => issueJwt().catch(() => {}))
        .finally(() => window.location.assign(redirectUrl));
    }
  }, [data, redirectUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!usernameEmail || !password) {
      setFormError('Please enter your email/username and password');
      return;
    }

    // Don't clear WC session on login - WooCommerce will restore the user's cart
    // This preserves cart items for returning users
    login(usernameEmail, password);
  };

  if (!isReady) {
    return (
      <Layout title="Login">
        <div className={styles.container}>
          <div className={styles.card}>
            <div className="flex items-center justify-center">
              <div className="spinner h-8 w-8"></div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (isAuthenticated) {
    return (
      <Layout title="Login">
        <div className={styles.container}>
          <div className={styles.card}>
            <div className="flex items-center justify-center">
              <div className="spinner h-8 w-8"></div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const authError = data?.generateAuthorizationCode?.error || error?.message;

  return (
    <Layout title="Login">
      <div className={styles.container}>
        <div className={styles.card}>
          <h1 className={`${styles.title} lowercase`}>welcome back.</h1>
          <p className={styles.subtitle}>Sign in to your account</p>

          {registeredSuccess && (
            <div className="success-alert mb-6" role="alert">
              Account created successfully. Please sign in.
            </div>
          )}

          {resetSuccess && (
            <div className="success-alert mb-6" role="alert">
              Your password has been reset. Please sign in.
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            {(formError || authError) && (
              <div className={styles.error} role="alert">
                {formError || authError}
              </div>
            )}

            <div className={styles.formGroup}>
              <label htmlFor="usernameEmail" className={styles.label}>
                Email
              </label>
              <input
                id="usernameEmail"
                type="text"
                value={usernameEmail}
                onChange={(e) => setUsernameEmail(e.target.value)}
                disabled={loading}
                autoComplete="username"
                required
                className={styles.input}
                placeholder="your@email.com"
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password" className={styles.label}>
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
                required
                className={styles.input}
                placeholder="Enter password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={styles.submitBtn}
            >
              {loading ? (
                <>
                  <LoadingSpinner />
                  <span className="ml-2">Signing in...</span>
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className={styles.footer}>
            <p className={styles.footerText}>
              <Link href="/forgot-password" className={styles.footerLink}>
                Forgot your password?
              </Link>
            </p>
            <p className={styles.footerText}>
              Don&apos;t have an account?{' '}
              <Link href="/register" className={styles.footerLink}>
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
