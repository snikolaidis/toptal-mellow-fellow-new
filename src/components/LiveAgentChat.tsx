import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';

const VISIT_KEY = 'mf_page_visits';
const THRESHOLD = Number(process.env.NEXT_PUBLIC_LIVEAGENT_VISIT_THRESHOLD || '3');
const LIVEAGENT_URL = process.env.NEXT_PUBLIC_LIVEAGENT_URL || 'https://alphabrands.ladesk.com';
const BUTTON_ID = process.env.NEXT_PUBLIC_LIVEAGENT_BUTTON_ID || 'n3lhfezy';

declare global {
  interface Window {
    LiveAgent?: {
      createButton: (id: string, el: Element) => void;
      instance?: {
        getWidgetsByWidgetId: (
          id: string
        ) => Array<{ chat?: unknown; form?: unknown }> | undefined;
      };
    };
  }
}

function getVisits(): number {
  try {
    return Number(window.localStorage.getItem(VISIT_KEY) || '0');
  } catch {
    return 0;
  }
}

function setVisits(n: number) {
  try {
    window.localStorage.setItem(VISIT_KEY, String(n));
  } catch {
    return;
  }
}

export default function LiveAgentChat() {
  const router = useRouter();
  const loadedRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      if (loadedRef.current) {
        return;
      }
      const next = getVisits() + 1;
      setVisits(next);
      if (next >= THRESHOLD) {
        loadedRef.current = true;
        ensureLiveAgentButton(BUTTON_ID).catch(() => {});
      }
    };

    tick();
    router.events.on('routeChangeComplete', tick);
    return () => {
      router.events.off('routeChangeComplete', tick);
    };
  }, [router.events]);

  return null;
}

let readyPromise: Promise<NonNullable<Window['LiveAgent']>> | null = null;

export function ensureLiveAgent() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.LiveAgent) return Promise.resolve(window.LiveAgent);
  if (readyPromise) return readyPromise;

  readyPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('la_x2s6df8d') as HTMLScriptElement | null;
    const onReady = () =>
      window.LiveAgent ? resolve(window.LiveAgent) : reject(new Error('global missing'));

    if (existing) {
      existing.addEventListener('load', onReady, { once: true });
      existing.addEventListener('error', () => reject(new Error('load failed')), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.id = 'la_x2s6df8d';
    s.defer = true;
    s.src = `${LIVEAGENT_URL}/scripts/track.js`;
    s.addEventListener('load', onReady, { once: true });
    s.addEventListener('error', () => reject(new Error('load failed')), { once: true });
    document.body.appendChild(s);
  });
  return readyPromise;
}

const buttonPromises = new Map<string, Promise<HTMLElement | null>>();

export function ensureLiveAgentButton(buttonId: string) {
  const cached = buttonPromises.get(buttonId);
  if (cached) return cached;
  const promise = ensureLiveAgent().then((la) => {
    const existing = document.querySelector<HTMLElement>(`[id^="b_${buttonId}_"]`);
    if (existing) return existing;
    const holder = document.createElement('div');
    document.body.appendChild(holder);
    la.createButton(buttonId, holder);
    return document.querySelector<HTMLElement>(`[id^="b_${buttonId}_"]`);
  });
  buttonPromises.set(buttonId, promise);
  return promise;
}

export function isLiveAgentWidgetReady(buttonId: string) {
  if (typeof window === 'undefined') return false;
  const instance = window.LiveAgent?.instance;
  if (!instance) return false;
  try {
    const widgets = instance.getWidgetsByWidgetId(buttonId);
    return Boolean(widgets && widgets.some((w) => w.chat != null || w.form != null));
  } catch {
    return false;
  }
}
