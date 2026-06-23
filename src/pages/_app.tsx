import '@/lib/domPatch';
import '@/styles/globals.scss';
import { FaustProvider } from '@faustwp/core';
import type { AppProps } from 'next/app';
import { CartProvider } from '@/context/CartContext';
import { YotpoLoyaltyProvider } from '@/context/YotpoLoyaltyContext';
import AgeVerification from '@/components/AgeVerification/AgeVerification';
import { WordPressBlocksProvider, fromThemeJson } from "@faustwp/blocks";
import blocks from "@/wp-blocks";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <FaustProvider pageProps={pageProps}>
      <WordPressBlocksProvider
				config={{
					blocks,
				}}
			>
        <CartProvider>
          <YotpoLoyaltyProvider>
            <AgeVerification />
            <Component {...pageProps} />
          </YotpoLoyaltyProvider>
        </CartProvider>
      </WordPressBlocksProvider>
    </FaustProvider>
  );
}
