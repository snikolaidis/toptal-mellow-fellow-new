import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useLogin } from '@faustwp/core';
import { useAuth } from '@/context/AuthContext';
import Layout from '@/components/Layout';
import styles from '@/styles/pages/auth.module.css';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isReady, authenticate } = useAuth();
  const { login, loading, data, error } = useLogin();

  const [usernameEmail, setUsernameEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const redirectUrl = (router.query.redirect as string) || '/account';
  const registeredSuccess = router.query.registered === 'true';
  const resetSuccess = router.query.reset === 'true';

  useEffect(() => {
    if (isReady && isAuthenticated) {
      router.push(redirectUrl);
    }
  }, [isReady, isAuthenticated, redirectUrl, router]);

  useEffect(() => {
    if (data?.generateAuthorizationCode?.code) {
      setIsRedirecting(true);

      const issueJwt = () =>
        fetch('/api/auth/jwt', { method: 'POST', credentials: 'same-origin' });

      issueJwt()
        .then((r) => {
          if (!r.ok) return issueJwt();
          return r;
        })
        .then((r) => r?.json())
        .then((json) => {
          if (json?.success && json.userId) {
            authenticate(json.userId, json.expiresIn);
            router.push(redirectUrl);
          } else {
            setIsRedirecting(false);
          }
        })
        .catch(() => {
          issueJwt()
            .then((r) => r.json())
            .then((json) => {
              if (json?.success && json.userId) {
                authenticate(json.userId, json.expiresIn);
                router.push(redirectUrl);
              } else {
                setIsRedirecting(false);
              }
            })
            .catch(() => setIsRedirecting(false));
        });
    }
  }, [data, redirectUrl, authenticate, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!usernameEmail || !password) {
      setFormError('Please enter your email/username and password');
      return;
    }

    login(usernameEmail, password);
  };

  if (!isReady || isAuthenticated || isRedirecting) {
    return (
      <Layout title="Login">
        <div className={styles.container}>
          <div className={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="spinner" style={{ width: '2rem', height: '2rem' }} />
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
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="spinner" style={{ width: '1.25rem', height: '1.25rem', borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                  Signing in...
                </span>
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
