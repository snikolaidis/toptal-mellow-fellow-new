import { useEffect, useRef, useState } from 'react';

export interface RealIdCustomer {
  id?: number | null;
  email?: string;
  firstName?: string;
  lastName?: string;
}

const ENABLED = process.env.NEXT_PUBLIC_REALID_ENABLED === 'true';
const WP_BASE = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const VERIFY_BASE = 'https://verify.getverdict.com';
const VERIFIED_STEPS = ['completed', 'in_review', 'manually_approved'];

interface RealIdVerificationProps {
  customer?: RealIdCustomer;
  onVerifiedChange?: (verified: boolean, checkId: string | null) => void;
}

export default function RealIdVerification({ customer, onVerifiedChange }: RealIdVerificationProps) {
  const [checkId, setCheckId] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const startedRef = useRef(false);
  const onVerifiedRef = useRef(onVerifiedChange);
  onVerifiedRef.current = onVerifiedChange;

  // Create (or reuse) an ID check so we have a checkId for the hosted verification page.
  useEffect(() => {
    if (!ENABLED || typeof window === 'undefined' || !WP_BASE || startedRef.current) return;
    startedRef.current = true;
    const proxyRoot = `${window.location.origin}/api/realid/`;

    (async () => {
      try {
        let id = window.localStorage.getItem('real-id-check-id');
        if (!id) {
          const res = await fetch(`${proxyRoot}real-id/v1/checks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: customer?.email ?? '',
              first_name: customer?.firstName ?? '',
              last_name: customer?.lastName ?? '',
              customer_id: customer?.id ?? null,
            }),
          });
          const data = await res.json();
          id = data?.check_id || data?.check?.id || data?.id || null;
          if (id) window.localStorage.setItem('real-id-check-id', id);
        }
        if (!id) {
          startedRef.current = false;
          return;
        }
        setCheckId(id);
      } catch {
        startedRef.current = false;
      }
    })();
  }, [customer]);

  // Poll the check status; unlock the Place Order button once the ID is verified.
  useEffect(() => {
    if (!ENABLED || !checkId || typeof window === 'undefined') return;
    let active = true;
    const proxyRoot = `${window.location.origin}/api/realid/`;

    const tick = async () => {
      try {
        const r = await fetch(`${proxyRoot}real-id/v1/checks/${checkId}`);
        const d = await r.json();
        const step = d?.check?.step ?? d?.step;
        const isVerified = VERIFIED_STEPS.includes(step);
        setVerified(isVerified);
        onVerifiedRef.current?.(isVerified, checkId);
        if (isVerified) active = false;
      } catch {
        /* keep polling */
      }
    };

    tick();
    const interval = window.setInterval(() => {
      if (active) tick();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [checkId]);

  if (!ENABLED) return null;

  if (verified) {
    return (
      <div className="real-id-verification real-id-verification--verified">
        <div className="real-id-verification__status real-id-verification__status--success" role="status">
          <span className="real-id-verification__status-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" focusable="false">
              <path
                fill="currentColor"
                d="M10 0a10 10 0 100 20 10 10 0 000-20zm4.7 7.7l-5.4 5.4a1 1 0 01-1.4 0L5.3 10.5a1 1 0 011.4-1.4l1.9 1.9 4.7-4.7a1 1 0 011.4 1.4z"
              />
            </svg>
          </span>
          <span>You have been verified. You can complete your order.</span>
        </div>
      </div>
    );
  }

  const verifyUrl = checkId ? `${VERIFY_BASE}/${checkId}?from=checkout-extension-ui` : null;

  return (
    <div className="real-id-verification">
      <div className="real-id-verification__status" role="alert">
        <span className="real-id-verification__status-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" focusable="false">
            <path
              fill="currentColor"
              d="M10 0a10 10 0 100 20 10 10 0 000-20zm1 15H9v-2h2v2zm0-4H9V5h2v6z"
            />
          </svg>
        </span>
        <span>Please verify your ID to continue</span>
      </div>

      <h3 className="real-id-verification__title">ID verification</h3>

      <div className="real-id-verification__card">
        <p>We need a quick ID verification to complete your order!</p>
        <p>Your name must match your ID exactly to ensure verification.</p>
        <p>Please minimize glare in your photo so that your ID can be verified.</p>
        <p>
          You have 3 chances to submit your ID verification before you may need to wait up to 48hrs
          for a manual ID verification.
        </p>

        {verifyUrl ? (
          <a
            id="real-id-open-check-btn"
            className="real-id-verification__button"
            href={verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Verify your ID
          </a>
        ) : (
          <button className="real-id-verification__button" type="button" disabled>
            Preparing verification
          </button>
        )}
      </div>
    </div>
  );
}
