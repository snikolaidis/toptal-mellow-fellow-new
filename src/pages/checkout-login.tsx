import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import styles from '../styles/CheckoutLogin.module.css';

type CheckoutAuthMethod = 'google' | 'mellow' | 'guest';

const CHECKOUT_AUTH_KEY = 'checkoutAuthMethod';

export default function CheckoutLoginPage() {
  const router = useRouter();
  const { isAuthenticated: faustAuthenticated, isReady: faustReady } =
    useAuth();

  const [googleAuthenticated, setGoogleAuthenticated] =
    useState<boolean | null>(null);
  const [googleAuthReady, setGoogleAuthReady] = useState(false);

  /*
   * If the user is already authenticated, they must NOT see
   * the Google / Mellow Fellow / Guest selection again.
   */
  useEffect(() => {
    let mounted = true;

    async function checkExistingGoogleSession() {
      try {
        const response = await fetch('/api/auth/session', {
          method: 'GET',
          credentials: 'include',
        });

        const data = await response.json();

        if (!mounted) {
          return;
        }

        setGoogleAuthenticated(
          response.ok && data?.isAuthenticated === true
        );
      } catch (error) {
        console.error('Checkout login Google session check failed:', error);

        if (mounted) {
          setGoogleAuthenticated(false);
        }
      } finally {
        if (mounted) {
          setGoogleAuthReady(true);
        }
      }
    }

    checkExistingGoogleSession();

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * Client requirement:
   *
   * Already logged in -> skip login selection -> checkout.
   */
  useEffect(() => {
    if (!faustReady || !googleAuthReady) {
      return;
    }

    if (faustAuthenticated === true) {
      sessionStorage.setItem(CHECKOUT_AUTH_KEY, 'mellow');
      router.replace('/checkout');
      return;
    }

    if (googleAuthenticated === true) {
      sessionStorage.setItem(CHECKOUT_AUTH_KEY, 'google');
      router.replace('/checkout');
    }
  }, [
    faustReady,
    faustAuthenticated,
    googleAuthReady,
    googleAuthenticated,
    router,
  ]);

  const handleGoogleLogin = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!clientId) {
      console.error('Google Client ID is missing');
      alert('Google login is not configured.');
      return;
    }

    /*
     * Remember only the CHECKOUT choice.
     * This is NOT the Google authentication session.
     */
    sessionStorage.setItem(CHECKOUT_AUTH_KEY, 'google');

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

  // const handleMellowFellowLogin = () => {
  //   /*
  //    * Remember that checkout was started with Mellow Fellow.
  //    * The actual authentication is still handled by the existing
  //    * Mellow Fellow/Faust login flow.
  //    */
  //   sessionStorage.setItem(CHECKOUT_AUTH_KEY, 'mellow');

  //   window.location.href = '/login?redirect=/checkoutnew';
  // };

  const clearGoogleSession = async () => {
  try {
    await fetch(
      '/api/auth/google-session-clear',
      {
        method: 'POST',
        credentials: 'include',
      }
    );
  } catch (error) {
    console.error(
      'Unable to clear Google session:',
      error
    );
  }
};

const handleMellowFellowLogin = async () => {
  await clearGoogleSession();

router.push('/login?redirect=/checkout');
   
};

  const handleGuestCheckout = () => {
    /*
     * Guest checkout must never reuse authenticated customer data.
     */
    sessionStorage.setItem(CHECKOUT_AUTH_KEY, 'guest');

router.push('/checkout');
  };

  /*
   * While checking existing authentication, don't briefly show
   * the login choices to an already logged-in user.
   */
  if (!faustReady || !googleAuthReady) {
    return null;
  }

  if (faustAuthenticated === true || googleAuthenticated === true) {
    return null;
  }

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

        <button
          type="button"
          className={styles.continueBtn}
          onClick={handleGuestCheckout}
        >
          CONTINUE AS GUEST
        </button>
      </div>
    </div>
  );
}
