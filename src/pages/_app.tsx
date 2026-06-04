import '@/styles/globals.scss';
import { FaustProvider } from '@faustwp/core';
import type { AppProps } from 'next/app';
import { CartProvider } from '@/context/CartContext';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <FaustProvider pageProps={pageProps}>
      <CartProvider>
        <Component {...pageProps} />
      </CartProvider>
    </FaustProvider>
  );
}
