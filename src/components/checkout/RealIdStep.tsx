import { useState } from 'react';
import RealIdVerification from '../RealIdVerification';
import styles from './RealIdStep.module.css';

interface RealIdStepProps {
  customer: {
    id?: number | null;
    email?: string;
    firstName?: string;
    lastName?: string;
  };

  onBack: () => void;

  onContinue: () => void;
}

export default function RealIdStep({
  customer,
  onBack,
  onContinue,
}: RealIdStepProps) {
  const [started, setStarted] = useState(false);
  const [verified, setVerified] = useState(false);

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

              <h3>
                Frequently Asked Questions
              </h3>

              <div className={styles.faqRow}>
                <span>
                  Why do I need to verify my age?
                </span>
                <span>+</span>
              </div>

              <div className={styles.faqRow}>
                <span>
                  Is my personal information safe?
                </span>
                <span>+</span>
              </div>

              <div className={styles.faqRow}>
                <span>
                  How long does verification take?
                </span>
                <span>+</span>
              </div>

              <div className={styles.faqRow}>
                <span>
                  What ID types are accepted?
                </span>
                <span>+</span>
              </div>

              <div className={styles.faqRow}>
                <span>
                  Will this affect my ability to check out?
                </span>
                <span>+</span>
              </div>

              <p className={styles.support}>
                Still have questions?
                <strong> Contact Support</strong>
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

            <RealIdVerification
              customer={customer}
              onVerifiedChange={(isVerified) => {
                if (isVerified) {
                  setVerified(true);
                }
              }}
            />

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

            {verified && (
              <button
                type="button"
                className={styles.continueButton}
                onClick={onContinue}
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