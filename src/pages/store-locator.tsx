import { GetStaticProps } from 'next';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import type LType from 'leaflet';

const WP_BASE = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const STORES_ENDPOINT = `${WP_BASE}/wp-json/mellow-fellow/v1/stores`;

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

function formatAddress(store: Store): string {
  return [store.address, store.city, store.state, store.country]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(', ');
}

interface StoreLocatorProps {
  stores: Store[];
}

export default function StoreLocatorPage({ stores }: StoreLocatorProps) {
  const [leaflet, setLeaflet] = useState<typeof LType | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const markersRef = useRef<Record<number, LType.Marker>>({});

  // Dynamic import — leaflet accesses window/document so it can't run at SSR time
  useEffect(() => {
    import('leaflet').then((mod) => {
      const L = mod.default;
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: '/images/marker-icon.png',
        iconRetinaUrl: '/images/marker-icon-2x.png',
        shadowUrl: '/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });
      setLeaflet(L);
    });
  }, []);

  // Initialize map once leaflet is loaded
  useEffect(() => {
    if (!leaflet || !stores.length || !mapElRef.current || mapRef.current) return;

    const map = leaflet.map(mapElRef.current, { scrollWheelZoom: false });
    mapRef.current = map;

    leaflet
      .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      })
      .addTo(map);

    const bounds: [number, number][] = [];
    stores.forEach((store) => {
      const marker = leaflet.marker([store.lat, store.lng]).addTo(map);
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
  }, [leaflet, stores]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    stores.forEach((s) => (s.categories || []).forEach((c) => c && set.add(c)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [stores]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stores.filter((s) => {
      const matchesCategory = !category || (s.categories || []).includes(category);
      if (!matchesCategory) return false;
      if (!q) return true;
      return [s.name, s.city, s.state, s.address, s.country, ...(s.categories || [])]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [stores, search, category]);

  // Keep markers in sync with the filtered list
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

    const coords = filtered.map((s) => [s.lat, s.lng] as [number, number]);
    if (coords.length === 1) {
      map.setView(coords[0], 12, { animate: true });
    } else if (coords.length > 1) {
      map.fitBounds(coords, { padding: [40, 40], animate: true });
    }
  }, [filtered]);

  // Tear down map on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current = {};
    };
  }, []);

  const focusStore = useCallback((store: Store) => {
    setSelectedId(store.id);
    const map = mapRef.current;
    const marker = markersRef.current[store.id];
    if (map && marker) {
      map.setView([store.lat, store.lng], 14, { animate: true });
      marker.openPopup();
    }
  }, []);

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
          {categories.length > 0 && (
            <select
              className="store-locator__filter"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="store-locator__body">
          <aside className="store-locator__list" aria-label="Store list">
            {stores.length === 0 && (
              <p className="store-locator__empty">No stores available.</p>
            )}
            {stores.length > 0 && filtered.length === 0 && (
              <p className="store-locator__empty">No stores match your search.</p>
            )}
            {filtered.map((store) => (
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

export const getStaticProps: GetStaticProps = async () => {
  try {
    const [storesRes, menuClient] = await Promise.all([
      fetch(STORES_ENDPOINT).then((r) => r.json()),
      prefetchMenus(),
    ]);
    const props: Record<string, any> = {
      stores: Array.isArray(storesRes?.stores) ? storesRes.stores : [],
    };
    mergeMenuState(props, menuClient);
    return { props, revalidate: 1800 };
  } catch {
    return {
      props: { stores: [] },
      revalidate: 60,
    };
  }
};
