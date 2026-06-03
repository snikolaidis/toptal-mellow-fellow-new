import '@/styles/globals.scss';
import { FaustProvider } from '@faustwp/core';
import type { AppProps } from 'next/app';
import Script from 'next/script';
import { CartProvider } from '@/context/CartContext';

const klaviyoPublicKey = process.env.NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY;

export default function App({ Component, pageProps }: AppProps) {
  return (
    <FaustProvider pageProps={pageProps}>
      <CartProvider>
        {klaviyoPublicKey && (
          <Script
            id="klaviyo-onsite"
            strategy="afterInteractive"
            src={`https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${klaviyoPublicKey}`}
          />
        )}
        <Component {...pageProps} />
      </CartProvider>
    </FaustProvider>
  );
}
