import '@/styles/globals.scss';
import { FaustProvider } from '@faustwp/core';
import type { AppProps } from 'next/app';
import { CartProvider } from '@/context/CartContext';
import YotpoLoyaltyIdentity from '@/components/YotpoLoyaltyIdentity';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <FaustProvider pageProps={pageProps}>
      <CartProvider>
        <YotpoLoyaltyIdentity />
        <Component {...pageProps} />
      </CartProvider>
    </FaustProvider>
  );
}
