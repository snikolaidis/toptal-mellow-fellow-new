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
        realId.createFlow({
          target: '#real-id-check',
          mode: 'full',
          theme: {
            verified: {
              button: {
                url: `${window.location.origin}/checkout`,
                content: 'Continue',
              },
            },
          },
        });
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
        const currentEmail = (customer?.email ?? '').trim().toLowerCase();
        let id = window.localStorage.getItem('real-id-check-id');

        // The SDK shares this single, un-scoped key across anyone using this browser.
        // Reusing it blindly would resume (and show as "verified") a check that belongs
        // to a different email than the one currently in the checkout form. Confirm the
        // cached check's own email actually matches before trusting it - otherwise treat
        // it as absent and create a fresh check for the current customer instead.
        if (id && currentEmail) {
          try {
            const res = await fetch(`${proxyRoot}real-id/v1/checks/${id}`);
            const d = await res.json();
            const cachedEmail = (d?.check?.email ?? d?.email ?? '').trim().toLowerCase();
            if (cachedEmail !== currentEmail) id = null;
          } catch {
            id = null;
          }
        } else if (id && !currentEmail) {
          id = null;
        }

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
    const currentEmail = (customer?.email ?? '').trim().toLowerCase();

    const domShowsVerified = () => {
      const node = document.getElementById('real-id-check');
      if (!node) return false;
      const text = (node.textContent || '').toLowerCase();
      return (
        text.includes("you've been verified") ||
        text.includes('you have been verified') ||
        text.includes('already completed your id check') ||
        text.includes('return to store')
      );
    };

    // Stratos, 19 Jul 2026
    // The Read ID library keeps its active check id in the 'real-id-check'
    // localStorage entry; this can result in a serious compliance error where
    // someone else can use this key to make any purchase; althoug in real life
    // it's pretty hard to happen, still, we need to make sure we're fully covered.
    // The problem is not in the library itself but how the data are being used;
    // If I try to make a purcahse and complete the identification, I can go back and
    // change the email and there's no identification process. This could be a serious
    // gap; up to the point that I can easily bypass the whole identification process,
    // just by creating the 'real-id-check' key.

    const fetchCheck = async (): Promise<{ verified: boolean; email: string } | null> => {
      try {
        const r = await fetch(`${proxyRoot}real-id/v1/checks/${checkId}?_=${Date.now()}`, {
          cache: 'no-store',
        });
        const d = await r.json();
        const step = d?.check?.step ?? d?.step;
        const status = d?.check?.status ?? d?.status;
        const email = (d?.check?.email ?? d?.email ?? '').trim().toLowerCase();
        return { verified: VERIFIED_STEPS.includes(step) || VERIFIED_STEPS.includes(status), email };
      } catch {
        return null;
      }
    };

    const markVerifiedIfOwned = (verified: boolean, result: { verified: boolean; email: string } | null) => {
      if (!active || !verified || !result || !currentEmail || result.email !== currentEmail) return;
      onVerifiedRef.current?.(true, checkId);
      active = false;
    };

    // Stratos, 19 Jul 2026
    // const tick = async () => {
    //   if (!active) return;
    //   const domVerified = domShowsVerified();
    //   const result = await fetchCheck();
    //   markVerifiedIfOwned(domVerified || !!result?.verified, result);
    // };

    // The tick validating the identification is coming from the getverdict library;
    // there's no need to run it ourselves at the same time, creating a nonstop loop
    // tick();
    // const interval = window.setInterval(() => {
    //   if (active) tick();
    // }, 2000);

    // let observer: MutationObserver | null = null;
    // const el = document.getElementById('real-id-check');
    // if (el && typeof MutationObserver !== 'undefined') {
    //   observer = new MutationObserver(() => {
    //     if (active) tick();
    //   });
    //   observer.observe(el, { childList: true, subtree: true, characterData: true });
    // }

    const onPassed = () => {
      console.log('real-id-check-passed', {active});
      if (!active) return;
      fetchCheck().then((result) => markVerifiedIfOwned(!!result?.verified, result));
    };
    const onLoaded = () => {
      console.log('real-id-check-loaded');
      fetchCheck().then((result) => markVerifiedIfOwned(!!result?.verified, result));
    };
    // const onLoaded = () => {};
    window.addEventListener('real-id-check-passed', onPassed);
    window.addEventListener('real-id-check-loaded', onLoaded);

    return () => {
      active = false;
      // window.clearInterval(interval);
      // if (observer) observer.disconnect();
      window.removeEventListener('real-id-check-passed', onPassed);
      window.removeEventListener('real-id-check-loaded', onLoaded);
       // Remove old RealID UI
        document.querySelectorAll('.real-id-flow').forEach((el) => el.remove());

        // Clear container
        const container = document.getElementById('real-id-check');
        if (container) {
          container.innerHTML = '';
        }
    };
  }, [checkId, customer?.email]);

  useEffect(() => {
    if (!ENABLED || typeof window === 'undefined') return;
    const verifiedRe = /already completed your id check|you.?ve been verified/i;
    const hideVerifiedCta = () => {
      const flow = document.querySelector('.real-id-flow');
      if (!flow || !verifiedRe.test(flow.textContent || '')) return;
      flow.querySelectorAll('a.ri-no-underline').forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
    };
    hideVerifiedCta();
    const interval = window.setInterval(hideVerifiedCta, 400);
    return () => window.clearInterval(interval);
  }, []);

  if (!ENABLED) return null;
  return <div id="real-id-check" className="real-id-check" />;
}
