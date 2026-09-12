import '../../faust.config';
import '@/lib/domPatch';
import '@/styles/globals.scss';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/autoplay';
import 'leaflet/dist/leaflet.css';
import { FaustProvider, getApolloAuthClient } from '@faustwp/core';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState, useCallback } from 'react';
import { getBodyClass } from '@/lib/bodyClass';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { YotpoLoyaltyProvider } from '@/context/YotpoLoyaltyContext';
import AgeVerification from '@/components/AgeVerification/AgeVerification';
import LiveAgentChat from '@/components/LiveAgentChat';
import ShippingWaiverBar from '@/components/ShippingWaiverBar';
import { WordPressBlocksProvider, fromThemeJson } from "@faustwp/blocks";
import blocks from "@/wp-blocks";

function RouteProgressBar() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    setProgress(0);
    setVisible(true);
    let p = 0;
    timerRef.current = setInterval(() => {
      p += (90 - p) * 0.1;
      setProgress(p);
    }, 200);
  }, []);

  const done = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setProgress(100);
    setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 300);
  }, []);

  useEffect(() => {
    router.events.on('routeChangeStart', start);
    router.events.on('routeChangeComplete', done);
    router.events.on('routeChangeError', done);
    return () => {
      router.events.off('routeChangeStart', start);
      router.events.off('routeChangeComplete', done);
      router.events.off('routeChangeError', done);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [router, start, done]);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: '3px',
      zIndex: 99999, pointerEvents: 'none',
    }}>
      <div style={{
        height: '100%', width: `${progress}%`,
        backgroundColor: '#000', transition: progress < 100 ? 'width 200ms ease' : 'width 150ms ease, opacity 300ms ease',
        opacity: progress >= 100 ? 0 : 1,
      }} />
    </div>
  );
}

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
      <AuthProvider>
        <WordPressBlocksProvider
					config={{
						blocks,
						theme: fromThemeJson({}),
					}}
				>
          <CartProvider>
            <YotpoLoyaltyProvider>
              <RouteProgressBar />
              <AuthWarmer />
              <AgeVerification />
              <LiveAgentChat />
              <ShippingWaiverBar />
              <Component {...pageProps} />
            </YotpoLoyaltyProvider>
          </CartProvider>
        </WordPressBlocksProvider>
      </AuthProvider>
    </FaustProvider>
  );
}
