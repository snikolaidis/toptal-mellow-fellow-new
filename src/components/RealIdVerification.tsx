import { useEffect, useRef, useState } from 'react';

export interface RealIdCustomer {
  id?: number | null;
  email?: string;
  firstName?: string;
  lastName?: string;
}

const ENABLED = process.env.NEXT_PUBLIC_REALID_ENABLED === 'true';
const WP_BASE = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const FLOW_SDK = 'https://real-id-flow.getverdict.com/assets/index.js';
const SHOP_NAME = process.env.NEXT_PUBLIC_REALID_SHOP_NAME || WP_BASE;
const VERIFIED_STEPS = ['completed', 'in_review', 'manually_approved'];

interface RealIdVerificationProps {
  customer?: RealIdCustomer;
  onVerifiedChange?: (verified: boolean, checkId: string | null) => void;
}

export default function RealIdVerification({ customer, onVerifiedChange }: RealIdVerificationProps) {
  const [checkId, setCheckId] = useState<string | null>(null);
  const startedRef = useRef(false);
  const onVerifiedRef = useRef(onVerifiedChange);
  onVerifiedRef.current = onVerifiedChange;

  useEffect(() => {
    if (!ENABLED || typeof window === 'undefined' || !WP_BASE || startedRef.current) return;
    startedRef.current = true;

    const proxyRoot = `${window.location.origin}/api/realid/`;
    const w = window as unknown as Record<string, unknown>;
    w.realIdShopWpRestUrl = proxyRoot;
    w.realIdWpNonce = '';
    w.realIdCustomerId = customer?.id ?? null;
    w.realIdShopName = SHOP_NAME;
    w.realIdCurrentUser = customer
      ? {
          id: customer.id ?? null,
          email: customer.email ?? '',
          firstName: customer.firstName ?? '',
          lastName: customer.lastName ?? '',
        }
      : {};
    w.realIdApiSettings = { root: proxyRoot, nonce: '', shopName: SHOP_NAME };

    const initFlow = (attempt = 0) => {
      const realId = (window as unknown as { RealID?: { createFlow?: (o: object) => void } }).RealID;
      if (realId?.createFlow) {
        realId.createFlow({ target: '#real-id-check', mode: 'full' });
      } else if (attempt < 50) {
        window.setTimeout(() => initFlow(attempt + 1), 150);
      }
    };

    const loadFlow = () => {
      if (!document.getElementById('real-id-flow-sdk')) {
        const script = document.createElement('script');
        script.id = 'real-id-flow-sdk';
        script.type = 'module';
        script.src = FLOW_SDK;
        script.onload = () => initFlow();
        document.body.appendChild(script);
      } else {
        initFlow();
      }
    };

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
          id = data?.check_id || data?.check?.id || null;
          if (id) window.localStorage.setItem('real-id-check-id', id);
        }
        if (!id) {
          startedRef.current = false;
          return;
        }
        setCheckId(id);
        loadFlow();
      } catch {
        startedRef.current = false;
      }
    })();
  }, [customer]);

  useEffect(() => {
    if (!ENABLED || !checkId || typeof window === 'undefined') return;
    let active = true;
    const proxyRoot = `${window.location.origin}/api/realid/`;

    const tick = async () => {
      try {
        const r = await fetch(`${proxyRoot}real-id/v1/checks/${checkId}`);
        const d = await r.json();
        const step = d?.check?.step ?? d?.step;
        const verified = VERIFIED_STEPS.includes(step);
        onVerifiedRef.current?.(verified, checkId);
        if (verified) active = false;
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
  return <div id="real-id-check" className="real-id-check" />;
}
