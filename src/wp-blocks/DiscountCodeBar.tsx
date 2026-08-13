import type { CSSProperties } from 'react';
import { fragments } from './DiscountCodeBar.fragments';
import { useEffect, useRef, useState } from 'react';

/**
 * Backend-managed discount code bar (ACF block `acf/discount-code-bar`).
 * Mirrors the Shopify `discount-code-bar` section (itself extracted from the
 * hardcoded Shirley's Temple promo bar): a full-width colored bar with promo
 * text, a "CODE: X" callout auto-built from the discount code (in the
 * optional highlight color), and a pill button that copies the code to the
 * clipboard with a temporary "COPIED!" state.
 */

interface DiscountCodeBarProps {
  discountCodeBar?: {
    text?: string | null;
    discountCode?: string | null;
    textColor?: string | null;
    highlightColor?: string | null;
    backgroundColor?: string | null;
    buttonBackgroundColor?: string | null;
    buttonTextColor?: string | null;
  } | null;
}

export default function DiscountCodeBar(props: DiscountCodeBarProps) {
  const data = props.discountCodeBar;
  const [copied, setCopied] = useState(false);
  const revertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (revertTimeoutRef.current) clearTimeout(revertTimeoutRef.current);
    };
  }, []);

  if (!data?.text && !data?.discountCode) {
    return null;
  }

  const handleCopy = () => {
    if (!data.discountCode) return;

    navigator.clipboard
      .writeText(data.discountCode)
      .then(() => {
        setCopied(true);
        if (revertTimeoutRef.current) clearTimeout(revertTimeoutRef.current);
        revertTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard access denied (non-secure context / permissions) — the
        // code is still visible on screen for manual copying.
      });
  };

  return (
    <section
      className="discount-code-bar"
      style={
        {
          '--bar-bg': data.backgroundColor || '#000000',
          '--bar-text': data.textColor || '#ffffff',
          '--bar-highlight': data.highlightColor || data.textColor || '#ffffff',
          '--btn-bg': data.buttonBackgroundColor || '#ffffff',
          '--btn-text': data.buttonTextColor || '#241A00',
        } as CSSProperties
      }
    >
      <div className="discount-code-bar__inner">
        {data.text && <span className="discount-code-bar__text">{data.text}</span>}

        {data.discountCode && (
          <>
            <span className="discount-code-bar__code">CODE:&nbsp;{data.discountCode}</span>

            <button
              type="button"
              className={`discount-code-bar__btn${copied ? ' copied' : ''}`}
              onClick={handleCopy}
              aria-label={`Copy discount code ${data.discountCode} to clipboard`}
            >
              {copied ? 'COPIED!' : 'COPY CODE'}
            </button>
            
            <span className="sr-only" role="status" aria-live="polite">
              {copied ? 'Discount code copied to clipboard' : ''}
            </span>
          </>
        )}
      </div>
    </section>
  );
}

DiscountCodeBar.displayName = 'AcfDiscountCodeBar';

DiscountCodeBar.fragments = fragments;
