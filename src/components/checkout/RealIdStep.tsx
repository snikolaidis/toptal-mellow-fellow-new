import { useState } from 'react';
import RealIdVerification from '../RealIdVerification';
import styles from './RealIdStep.module.css';

type RememberMeOption =
  | 'do_not_remember'
  | 'remember_30'
  | 'remember_60'
  | 'remember_90';

interface RealIdStepProps {
  customer: {
    id?: number | null;
    email?: string;
    firstName?: string;
    lastName?: string;
  };
  initialCheckId?: string | null;
  initialRememberOption?: RememberMeOption;
  initialRememberExpiresAt?: number | null;

  onBack: () => void;

  onContinue: (
    checkId: string,
    rememberOption: RememberMeOption
  ) => void;

  onForgetMe?: () => void;
}

export default function RealIdStep({
  customer,
  initialCheckId,
  initialRememberOption,
  initialRememberExpiresAt,
  onBack,
  onContinue,
  onForgetMe,
}: RealIdStepProps) {
  const [started, setStarted] = useState(() => !!initialCheckId);
  const [verified, setVerified] = useState(() => !!initialCheckId);
  const [verifiedCheckId, setVerifiedCheckId] = useState<string | null>(
    () => initialCheckId || null
  );

  // Whether this instance started out already covered by an existing
  // Remember Me record (as opposed to having just verified in this
  // session) - controls whether we show the remember-me day picker or
  // the "we already remember you" message further down.
  const [isRemembered, setIsRemembered] = useState(() => !!initialCheckId);

  // Remember Me selection
  const [rememberOption, setRememberOption] = useState<RememberMeOption>(
    () => initialRememberOption || 'do_not_remember'
  );

  const [rememberDaysLeft] = useState<number | null>(() => {
    if (!initialRememberExpiresAt) return null;
    return Math.ceil(
      (initialRememberExpiresAt - Date.now()) / (1000 * 60 * 60 * 24)
    );
  });

  const handleForgetMe = () => {
    onForgetMe?.();
    setIsRemembered(false);
    setVerified(false);
    setVerifiedCheckId(null);
    setRememberOption('do_not_remember');
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>

        {!started ? (
          <>
            <section className={styles.heroCard}>

              <div className={styles.ageCircle}>
                21+
              </div>

              <h1>
                Quick Age Verification Required
              </h1>

              <p className={styles.description}>
                Hemp-derived THC products are legally
                restricted to adults 21+. We use Real ID
                to verify your age quickly and securely.
                It only takes about 60 seconds.
              </p>

              <div className={styles.features}>

                <div className={styles.feature}>
                  <div className={styles.featureIcon}>
                    <img
                      src="/images/protected.png"
                      alt="Your data is protected"
                    />
                  </div>

                  <strong>
                    Your data is protected
                  </strong>

                  <span>
                    Bank-grade encryption,
                    never stored
                  </span>
                </div>

                <div className={styles.feature}>
                  <div className={styles.featureIcon}>
                    <img
                      src="/images/id-card.png"
                      alt="Government ID required"
                    />
                  </div>

                  <strong>
                    Government ID required
                  </strong>

                  <span>
                    Driver's license or passport
                  </span>
                </div>

                <div className={styles.feature}>
                  <div className={styles.featureIcon}>
                    <img
                      src="/images/secure.png"
                      alt="Verified for 90 days"
                    />
                  </div>

                  <strong>
                    Verified for 90 days
                  </strong>

                  <span>
                    No re-verification on
                    future orders
                  </span>
                </div>

              </div>

              <div className={styles.howItWorks}>

                <h3>
                  How it works
                </h3>

                <div className={styles.step}>
                  <span>1</span>

                  <div>
                    <strong>
                      Tap Continue with Real ID
                    </strong>

                    <p>
                      You'll be taken to Real ID's
                      secure portal.
                    </p>
                  </div>
                </div>

                <div className={styles.step}>
                  <span>2</span>

                  <div>
                    <strong>
                      Snap your ID
                    </strong>

                    <p>
                      Take a quick photo of the
                      front and back of your
                      government-issued ID.
                    </p>
                  </div>
                </div>

                <div className={styles.step}>
                  <span>3</span>

                  <div>
                    <strong>
                      Take a selfie
                    </strong>

                    <p>
                      Real ID matches your face
                      to confirm it's really you.
                    </p>
                  </div>
                </div>

                <div className={styles.step}>
                  <span>4</span>

                  <div>
                    <strong>
                      You're verified!
                    </strong>

                    <p>
                      Return to checkout and
                      complete your order.
                    </p>
                  </div>
                </div>

              </div>

              <button
                type="button"
                className={styles.continueButton}
                onClick={() => setStarted(true)}
              >
                Continue with Real ID
              </button>

              <p className={styles.terms}>
                By continuing you agree to Real ID's
                Terms of Service and Privacy Policy.
              </p>

            </section>

            <section className={styles.faq}>
              <h3>Frequently Asked Questions</h3>

              <details className={styles.faqItem}>
                <summary>Why do I need to verify my age?</summary>
                <div className={styles.faqAnswer}>
                  <p>State and federal regulations require us to verify the age of customers purchasing restricted products to ensure compliance with legal age limits (21+).</p>
                </div>
              </details>

              <details className={styles.faqItem}>
                <summary>Is my personal information safe?</summary>
                <div className={styles.faqAnswer}>
                  <p>Yes, your information is encrypted and securely processed by Real ID. We do not store your government ID photos or sensitive document details.</p>
                </div>
              </details>

              <details className={styles.faqItem}>
                <summary>How long does verification take?</summary>
                <div className={styles.faqAnswer}>
                  <p>Verification usually takes less than 60 seconds. Once verified, you can complete your checkout immediately.</p>
                </div>
              </details>

              <details className={styles.faqItem}>
                <summary>What ID types are accepted?</summary>
                <div className={styles.faqAnswer}>
                  <p>We accept driver's licenses, state IDs, passports, and other official government-issued photo IDs.</p>
                </div>
              </details>

              <details className={styles.faqItem}>
                <summary>Will this affect my ability to check out?</summary>
                <div className={styles.faqAnswer}>
                  <p>No, once your age is verified, you will proceed directly to the payment step without any delay.</p>
                </div>
              </details>

              <p className={styles.support}>
                Still have questions? <strong><a href="#">Contact Support</a></strong>
              </p>
            </section>

            <button
              type="button"
              className={styles.backButton}
              onClick={onBack}
            >
              ← Back to Billing
            </button>
          </>
        ) : (
          <section className={styles.verificationCard}>

            <div className={styles.verificationHeader}>
              <div className={styles.ageCircle}>
                21+
              </div>

              <h2>
                Verify Your Age
              </h2>

              <p>
                Complete the secure Real ID verification
                below.
              </p>
            </div>

            {!verified && (
              <RealIdVerification
                customer={customer}
                onVerifiedChange={(isVerified, checkId) => {
                  if (isVerified && checkId) {
                    setVerified(true);
                    setVerifiedCheckId(checkId);

                    // Every new verification starts with
                    // "Do not remember me" selected.
                    setRememberOption('do_not_remember');
                    setIsRemembered(false);
                  }
                }}
              />
            )}

            {/* ================================
                VERIFIED MESSAGE
                ================================ */}
            {verified && (
              <div className={styles.verifiedBox}>
                <span>✓</span>

                <div>
                  <strong>
                    You're verified!
                  </strong>

                  <p>
                    Your age verification is complete.
                  </p>
                </div>
              </div>
            )}

            {/* ================================
                REMEMBER ME (ALREADY REMEMBERED)
                ================================ */}
            {verified && verifiedCheckId && isRemembered && (
              <div className={styles.rememberMeBox}>

                <p className={styles.rememberMeTitle}>
                  {rememberDaysLeft !== null
                    ? `We'll remember your identity verification for ${rememberDaysLeft} more day${rememberDaysLeft === 1 ? '' : 's'}.`
                    : "We're remembering your identity verification on this device."}
                </p>

                <button
                  type="button"
                  className={styles.forgetMeButton}
                  onClick={handleForgetMe}
                >
                  Forget me
                </button>
              </div>
            )}

            {/* ================================
                REMEMBER ME (NEW VERIFICATION)
                ================================ */}
            {verified && verifiedCheckId && !isRemembered && (
              <div className={styles.rememberMeBox}>

                <p className={styles.rememberMeTitle}>
                  You're verified! Skip this step next time
                  by letting us remember your Real ID check
                  on this device:
                </p>

                <div className={styles.rememberMeOptions}>

                  <label>
                    <input
                      type="radio"
                      name="remember_me_radio"
                      value="do_not_remember"
                      checked={
                        rememberOption === 'do_not_remember'
                      }
                      onChange={() =>
                        setRememberOption('do_not_remember')
                      }
                    />

                    <strong>
                      Do not remember me
                    </strong>
                  </label>

                  <label>
                    <input
                      type="radio"
                      name="remember_me_radio"
                      value="remember_30"
                      checked={
                        rememberOption === 'remember_30'
                      }
                      onChange={() =>
                        setRememberOption('remember_30')
                      }
                    />

                    <span>
                      Remember me for <strong>30 days</strong>
                    </span>
                  </label>

                  <label>
                    <input
                      type="radio"
                      name="remember_me_radio"
                      value="remember_60"
                      checked={
                        rememberOption === 'remember_60'
                      }
                      onChange={() =>
                        setRememberOption('remember_60')
                      }
                    />

                    <span>
                      Remember me for <strong>60 days</strong>
                    </span>
                  </label>

                  <label>
                    <input
                      type="radio"
                      name="remember_me_radio"
                      value="remember_90"
                      checked={
                        rememberOption === 'remember_90'
                      }
                      onChange={() =>
                        setRememberOption('remember_90')
                      }
                    />

                    <span>
                      Remember me for <strong>90 days</strong>
                    </span>
                  </label>

                </div>
              </div>
            )}

            {/* ================================
                CONTINUE TO PAYMENT
                ================================ */}
            {verified && verifiedCheckId && (
              <button
                type="button"
                className={styles.continueButton}
                onClick={() =>
                  onContinue(
                    verifiedCheckId,
                    rememberOption
                  )
                }
              >
                Continue to Payment
              </button>
            )}

            <button
              type="button"
              className={styles.backButton}
              onClick={onBack}
            >
              ← Back to Billing
            </button>

          </section>
        )}

      </div>
    </div>
  );
}