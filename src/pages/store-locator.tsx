import { useEffect, useMemo, useRef, useState } from 'react';
import Layout from '@/components/Layout';

const WP_BASE = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const STORES_ENDPOINT = `${WP_BASE}/wp-json/mellow-fellow/v1/stores`;

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const MARKER_BASE = 'https://unpkg.com/leaflet@1.9.4/dist/images';

interface Store {
  id: number;
  name: string;
  lat: number;
  lng: number;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  hours: string;
  image: string | null;
  categories: string[];
}

// Load the Leaflet script/style once and resolve when window.L is ready.
function loadLeaflet(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { L?: unknown };
    if (w.L) {
      resolve(w.L);
      return;
    }

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

    let script = document.getElementById('leaflet-js') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = LEAFLET_JS;
      document.body.appendChild(script);
    }
    script.addEventListener('load', () => resolve((window as unknown as { L: unknown }).L));
    script.addEventListener('error', () => reject(new Error('Failed to load map library')));
    if ((window as unknown as { L?: unknown }).L) {
      resolve((window as unknown as { L: unknown }).L);
    }
  });
}

function formatAddress(store: Store): string {
  return [store.address, store.city, store.state, store.country]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(', ');
}

export default function StoreLocatorPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const mapElRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Record<number, any>>({});

  // Fetch stores.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(STORES_ENDPOINT);
        const data = await res.json();
        if (!cancelled) {
          setStores(Array.isArray(data?.stores) ? data.stores : []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('We could not load the store list. Please try again later.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize the map once stores are loaded.
  useEffect(() => {
    if (loading || error || !stores.length || !mapElRef.current || mapRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = (await loadLeaflet()) as any;
        if (cancelled || !mapElRef.current || mapRef.current) return;

        const icon = L.icon({
          iconUrl: `${MARKER_BASE}/marker-icon.png`,
          iconRetinaUrl: `${MARKER_BASE}/marker-icon-2x.png`,
          shadowUrl: `${MARKER_BASE}/marker-shadow.png`,
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41],
        });

        const map = L.map(mapElRef.current, { scrollWheelZoom: false });
        mapRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        const bounds: [number, number][] = [];
        stores.forEach((store) => {
          const marker = L.marker([store.lat, store.lng], { icon }).addTo(map);
          marker.bindPopup(
            `<strong>${store.name}</strong><br/>${formatAddress(store)}` +
              (store.phone ? `<br/>${store.phone}` : '')
          );
          marker.on('click', () => setSelectedId(store.id));
          markersRef.current[store.id] = marker;
          bounds.push([store.lat, store.lng]);
        });

        if (bounds.length === 1) {
          map.setView(bounds[0], 12);
        } else {
          map.fitBounds(bounds, { padding: [40, 40] });
        }
      } catch {
        if (!cancelled) setError('We could not load the map. Please try again later.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, error, stores]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((s) =>
      [s.name, s.city, s.state, s.address, s.country, ...(s.categories || [])]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [stores, search]);

  // Keep markers in sync with the filtered list.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const visibleIds = new Set(filtered.map((s) => s.id));
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      const numId = Number(id);
      if (visibleIds.has(numId)) {
        if (!map.hasLayer(marker)) marker.addTo(map);
      } else if (map.hasLayer(marker)) {
        map.removeLayer(marker);
      }
    });
  }, [filtered]);

  // Tear the map down on unmount so re-navigating does not reuse a dead container.
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current = {};
    };
  }, []);

  const focusStore = (store: Store) => {
    setSelectedId(store.id);
    const map = mapRef.current;
    const marker = markersRef.current[store.id];
    if (map && marker) {
      map.setView([store.lat, store.lng], 14, { animate: true });
      marker.openPopup();
    }
  };

  return (
    <Layout title="Store Locator">
      <div className="store-locator">
        <div className="store-locator__header">
          <h1 className="store-locator__title">Find a Store</h1>
          <input
            type="search"
            className="store-locator__search"
            placeholder="Search by city, state, or store name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search stores"
          />
        </div>

        <div className="store-locator__body">
          <aside className="store-locator__list" aria-label="Store list">
            {loading && <p className="store-locator__empty">Loading stores</p>}
            {error && <p className="store-locator__empty">{error}</p>}
            {!loading && !error && filtered.length === 0 && (
              <p className="store-locator__empty">No stores match your search.</p>
            )}
            {!loading &&
              !error &&
              filtered.map((store) => (
                <button
                  type="button"
                  key={store.id}
                  className={
                    'store-locator__item' +
                    (selectedId === store.id ? ' store-locator__item--active' : '')
                  }
                  onClick={() => focusStore(store)}
                >
                  <span className="store-locator__item-name">{store.name}</span>
                  <span className="store-locator__item-address">{formatAddress(store)}</span>
                  {store.phone && <span className="store-locator__item-meta">{store.phone}</span>}
                  {store.hours && <span className="store-locator__item-meta">{store.hours}</span>}
                </button>
              ))}
          </aside>

          <div className="store-locator__map" ref={mapElRef} />
        </div>
      </div>
    </Layout>
  );
}
