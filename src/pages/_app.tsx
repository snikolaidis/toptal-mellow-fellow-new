import '../../faust.config';
import '@/lib/domPatch';
import '@/styles/globals.scss';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/autoplay';
import { FaustProvider, useAuth, getApolloAuthClient } from '@faustwp/core';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { useEffect, useRef } from 'react';
import { getBodyClass } from '@/lib/bodyClass';
import { CartProvider } from '@/context/CartContext';
import { YotpoLoyaltyProvider } from '@/context/YotpoLoyaltyContext';
import AgeVerification from '@/components/AgeVerification/AgeVerification';
import LiveAgentChat from '@/components/LiveAgentChat';
import { WordPressBlocksProvider, fromThemeJson } from "@faustwp/blocks";
import blocks from "@/wp-blocks";

function AuthWarmer() {
  const { isReady, isAuthenticated } = useAuth();
  useEffect(() => {
    if (isReady && isAuthenticated) {
      getApolloAuthClient();
    }
  }, [isReady, isAuthenticated]);
  return null;
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  // Keep the `<body>` class (set server-side in _document) in sync across
  // client-side navigation. Diff via classList so transient classes added by
  // other code (e.g. scroll-locks) are never wiped.
  const prevBodyClass = useRef<string[]>([]);
  useEffect(() => {
    const next = getBodyClass(router.asPath).split(' ').filter(Boolean);
    document.body.classList.remove(...prevBodyClass.current);
    document.body.classList.add(...next);
    prevBodyClass.current = next;
  }, [router.asPath]);

  useEffect(() => {
    const block = (e: MouseEvent) => {
      if (e.target instanceof HTMLImageElement) e.preventDefault();
    };
    document.addEventListener('contextmenu', block);
    return () => document.removeEventListener('contextmenu', block);
  }, []);

  return (
    <FaustProvider pageProps={pageProps}>
      <WordPressBlocksProvider
				config={{
					blocks,
					theme: fromThemeJson({}),
				}}
			>
        <CartProvider>
          <YotpoLoyaltyProvider>
            <AuthWarmer />
            <AgeVerification />
            <LiveAgentChat />
            <Component {...pageProps} />
          </YotpoLoyaltyProvider>
        </CartProvider>
      </WordPressBlocksProvider>
    </FaustProvider>
  );
}
