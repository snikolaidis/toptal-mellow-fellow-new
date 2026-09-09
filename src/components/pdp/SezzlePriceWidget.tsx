import { useEffect, useRef, useState } from 'react';

interface SezzleWidgetConfig {
  enabled: boolean;
  merchantId: string;
}

const DEFAULT_CONFIG: SezzleWidgetConfig = { enabled: false, merchantId: '' };

// Module-level cache — the config is the same for every PDP visit in this
// session, no reason to refetch per product mount.
let cachedConfig: SezzleWidgetConfig | null = null;
let configPromise: Promise<SezzleWidgetConfig> | null = null;

function getSezzleWidgetConfig(): Promise<SezzleWidgetConfig> {
  if (cachedConfig) return Promise.resolve(cachedConfig);
  if (!configPromise) {
    configPromise = fetch('/api/checkout/payment-methods')
      .then((r) => r.json())
      .then((data) => {
        const resolved: SezzleWidgetConfig = data?.sezzleWidget || DEFAULT_CONFIG;
        cachedConfig = resolved;
        return resolved;
      })
      .catch(() => DEFAULT_CONFIG);
  }
  return configPromise;
}

/**
 * Sezzle's on-site "as low as $X with Sezzle" price-messaging widget — the
 * same one the installed WooCommerce Sezzle plugin shows on PDPs via its own
 * "Show the sezzle widget under price label in product pages" setting
 * (woocommerce-gateway-sezzle.php's add_sezzle_product_banner()). That PHP
 * version targets classic WooCommerce theme markup (.summary/.price, an
 * <ins>/<del> sale price); this targets our own price element by id instead,
 * using the same widget script and merchant ID already configured in
 * WooCommerce > Settings > Payments > Sezzle (surfaced via
 * /api/checkout/payment-methods so toggling it there needs no deploy here).
 *
 * targetSelector must point at a stable element containing ONLY the actual
 * price to pay (not a block that also contains a crossed-out original price
 * as text, which the widget can't disambiguate) — single-product.tsx renders
 * a dedicated hidden span with the unscaled unit price just for this.
 */
export default function SezzlePriceWidget({ targetSelector }: { targetSelector: string }) {
  const [config, setConfig] = useState<SezzleWidgetConfig | null>(null);
  // Next.js dev mode runs effects twice (React StrictMode: mount -> effect ->
  // cleanup -> effect again) to surface exactly this kind of bug. A
  // third-party widget script isn't built to survive being torn down mid
  // async-init and immediately reinitialized — it was fetching its own
  // modal.html template (real, observed) but never completing the actual
  // render. This ref makes injection idempotent across that double-invoke:
  // once the script is in, later effect re-runs (StrictMode, or a prop
  // change) are no-ops rather than tearing it down and re-adding it.
  const injectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getSezzleWidgetConfig().then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!config?.enabled || !config.merchantId) return;
    if (injectedRef.current) return;
    if (typeof document === 'undefined') return;
    if (!document.querySelector(targetSelector)) return;

    injectedRef.current = true;

    // Must be set before the widget script loads — see
    // https://docs.sezzle.com/docs/guides/widgets/sdk. renderToPath: '..' —
    // not '.' — matches Sezzle's own documented example (which targets a
    // '.price' element, same as ours) for "render as the next sibling after
    // the target". '.' silently rendered nothing at all in testing.
    //
    // urlMatch is filled in here even though our merchant's stored server
    // config (which the script otherwise uses instead of this — see the
    // Sezzle-side ticket this is blocked on) always sets it per group; worth
    // testing whether an incomplete group here is what's getting the local
    // config discarded rather than merged/preferred.
    (window as any).document.sezzleConfig = {
      configGroups: [
        {
          targetXPath: targetSelector,
          renderToPath: '..',
          urlMatch: 'products',
          theme: 'auto',
          ignoredPriceElements: ['DEL', 'STRIKE'],
          ignoredFormattedPriceText: ['From:'],
          alignment: 'inherit',
          alignmentSwitchMinWidth: 0,
          alignmentSwitchType: 'inherit',
          containerStyle: { marginTop: '0px' },
          textStyle: { color: 'inherit', fontFamily: 'inherit', fontSize: '14px' },
          logoStyle: { transform: 'scale(1)' },
        },
      ],
      language: document.querySelector('html')?.getAttribute('lang') || 'en',
      minPrice: 0,
      maxPrice: 250000,
    };

    const script = document.createElement('script');
    script.src = `https://widget.sezzle.com/v1/javascript/price-widget?uuid=${encodeURIComponent(config.merchantId)}`;
    script.async = true;
    document.body.appendChild(script);
    // Intentionally no cleanup/removal — this script isn't designed to be
    // torn down and reinitialized, and leaving it in place is harmless.
  }, [config, targetSelector]);

  return null;
}
