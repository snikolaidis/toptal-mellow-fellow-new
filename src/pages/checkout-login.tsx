import Link from 'next/link';
import Image from 'next/image';
import styles from '../styles/CheckoutLogin.module.css';

export default function CheckoutLoginPage() {
  const handleGoogleLogin = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!clientId) {
      console.error('Google Client ID is missing');
      alert('Google login is not configured.');
      return;
    }

    const redirectUri = `${window.location.origin}/api/auth/google`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    });

    window.location.href =
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  };

  const handleMellowFellowLogin = () => {
    window.location.href =
      '/login?redirect=/checkout';
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Sign In</h1>

        <p className={styles.subtitle}>
          Swift checkout, easy returns, and loyalty perks
        </p>

        {/* Mellow Fellow Login */}
        <button
          type="button"
          className={styles.loginBtn}
          onClick={handleMellowFellowLogin}
        >
          <span>SIGN IN WITH</span>

          <Image
            src="/images/logo-mellowfellow.png"
            alt="Mellow Fellow"
            width={90}
            height={20}
          />
        </button>

        {/* Google Login */}
        <button
          type="button"
          className={styles.loginBtn}
          onClick={handleGoogleLogin}
        >
          <span>SIGN IN WITH</span>

          <Image
            src="/images/google-logo.png"
            alt="Google"
            width={18}
            height={18}
          />
        </button>

        <div className={styles.signup}>
          Don't have an account?{' '}
          <Link href="/register">
            Sign Up
          </Link>
        </div>

        <div className={styles.divider}>
          <span>Or</span>
        </div>

        <h2 className={styles.guestTitle}>
          Continue as Guest
        </h2>

        <input
          type="email"
          placeholder="Email*"
          className={styles.input}
        />

        <label className={styles.checkbox}>
          <input type="checkbox" />

          <span>
            Send me the scoop and exclusive offers!
          </span>
        </label>

        <Link
          href="/checkout"
          className={styles.continueBtn}
        >
          CONTINUE AS GUEST
        </Link>
      </div>
    </div>
  );
}