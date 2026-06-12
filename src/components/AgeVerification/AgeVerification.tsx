import { useState, useEffect } from 'react';

const STORAGE_KEY = 'mf_age_verified';

export default function AgeVerification() {
  const [visible, setVisible] = useState(false);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    let verified = false;
    try {
      verified = localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      verified = false;
    }
    if (!verified) {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [visible]);

  const handleConfirm = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // ignore storage errors
    }
    setVisible(false);
  };

  const handleDecline = () => {
    setDeclined(true);
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="age-gate" role="dialog" aria-modal="true" aria-label="Age verification">
      <div className="age-gate__content">
        {!declined ? (
          <>
            <h2 className="age-gate__heading">Confirm your age</h2>
            <p className="age-gate__subtext">Are you 21 years old or older?</p>
            <div className="age-gate__buttons">
              <button
                type="button"
                className="age-gate__btn age-gate__btn--outline"
                onClick={handleDecline}
              >
                No, I&apos;m not
              </button>
              <button
                type="button"
                className="age-gate__btn age-gate__btn--filled"
                onClick={handleConfirm}
              >
                Yep, let&apos;s go!
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="age-gate__heading">Come back when you&apos;re older!</h2>
            <p className="age-gate__subtext">
              Sorry, the content of this store can&apos;t be seen by a younger audience. Come back
              when you&apos;re older!
            </p>
            <div className="age-gate__buttons">
              <button
                type="button"
                className="age-gate__btn age-gate__btn--outline"
                onClick={() => setDeclined(false)}
              >
                Oops, I entered incorrectly
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
