import '@/styles/globals.scss';
import { FaustProvider } from '@faustwp/core';
import type { AppProps } from 'next/app';
import { CartProvider } from '@/context/CartContext';
import { YotpoLoyaltyProvider } from '@/context/YotpoLoyaltyContext';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <FaustProvider pageProps={pageProps}>
      <CartProvider>
        <YotpoLoyaltyProvider>
          <Component {...pageProps} />
        </YotpoLoyaltyProvider>
      </CartProvider>
    </FaustProvider>
  );
}
