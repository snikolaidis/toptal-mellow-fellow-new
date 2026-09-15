// Loads the Google Maps JavaScript API once and resolves when it is ready.
//
// This needs a BROWSER-exposed key (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) with the
// Maps JavaScript API enabled and locked to our HTTP referrers in Google Cloud.
// It is deliberately NOT the server-side GOOGLE_MAPS_API_KEY used for checkout
// address autocomplete: that key is Places-only and must never reach the client.
//
// Typed loosely (google as any) so the page compiles without pulling in
// @types/google.maps. Adding that package later would let us tighten these.

declare global {
  interface Window {
    google?: any;
  }
}

const SCRIPT_ID = 'google-maps-js';

let loadPromise: Promise<any> | null = null;

export function isGoogleMapsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
}

export function loadGoogleMaps(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser'));
  }
  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }
  if (loadPromise) return loadPromise;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set'));
  }

  loadPromise = new Promise((resolve, reject) => {
    const settle = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error('Google Maps loaded but window.google.maps is missing'));
    };

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', settle);
      existing.addEventListener('error', () => reject(new Error('Google Maps script failed to load')));
      // A prior load may already be complete by the time we attach.
      if (window.google?.maps) settle();
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    // NOTE: deliberately NOT using &loading=async here. That bootstrap populates
    // google.maps lazily via importLibrary(), so window.google.maps is not ready
    // at the script 'load' event this loader resolves on. Switching to it would
    // require reworking this to importLibrary('maps'/'marker'); the only cost of
    // the classic loader is a console performance warning.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
    script.addEventListener('load', settle);
    script.addEventListener('error', () => {
      // Clear the cache so a later attempt can retry rather than hang forever.
      loadPromise = null;
      reject(new Error('Google Maps script failed to load'));
    });
    document.head.appendChild(script);
  });

  return loadPromise;
}
