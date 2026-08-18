// app/checkout-login/page.tsx
// pages/checkout-login.tsx

import Link from 'next/link';
import styles from '../styles/CheckoutLogin.module.css';
import Image from 'next/image';

export default function CheckoutLoginPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Sign In</h1>

        <p className={styles.subtitle}>
          Swift checkout, easy returns, and loyalty perks
        </p>

        <button className={styles.loginBtn}>
        <span>SIGN IN WITH</span>
        <Link
          href="/login?redirect=/checkout"
        >
       <Image
          src="/images/logo-mellowfellow.png"
          alt="Mellow Fellow"
          width={90}
          height={20}
        />
       </Link>     
      </button>
      <button className={styles.loginBtn}>
      <span>SIGN IN WITH</span>
        <Image
          src="/images/google-logo.png"
          alt="Google"
          width={18}
          height={18}
        />
      </button>

        <div className={styles.signup}>
          Don't have an account? <a href="#">Sign Up</a>
        </div>

        <div className={styles.divider}>
          <span>Or</span>
        </div>

        <h2 className={styles.guestTitle}>Continue as Guest</h2>

        <input
          type="email"
          placeholder="Email*"
          className={styles.input}
        />

        <label className={styles.checkbox}>
          <input type="checkbox" />
          <span>Send me the scoop and exclusive offers!</span>
        </label>

        <Link href="/checkout" className={styles.continueBtn}>
          CONTINUE AS GUEST
        </Link>
      </div>
    </div>
  );
}