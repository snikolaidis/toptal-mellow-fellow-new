import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';

const VISIT_KEY = 'mf_page_visits';
const THRESHOLD = Number(process.env.NEXT_PUBLIC_LIVEAGENT_VISIT_THRESHOLD || '3');
const LIVEAGENT_URL = process.env.NEXT_PUBLIC_LIVEAGENT_URL || 'https://alphabrands.ladesk.com';
const BUTTON_ID = process.env.NEXT_PUBLIC_LIVEAGENT_BUTTON_ID || 'n3lhfezy';

declare global {
  interface Window {
    LiveAgent?: { createButton: (id: string, el: Element) => void };
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

function loadLiveAgent() {
  if (document.getElementById('la_x2s6df8d')) {
    return;
  }
  const script = document.createElement('script');
  script.id = 'la_x2s6df8d';
  script.defer = true;
  script.src = `${LIVEAGENT_URL}/scripts/track.js`;
  script.onload = () => {
    if (window.LiveAgent) {
      window.LiveAgent.createButton(BUTTON_ID, script);
    }
  };
  document.body.appendChild(script);
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
        loadLiveAgent();
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
