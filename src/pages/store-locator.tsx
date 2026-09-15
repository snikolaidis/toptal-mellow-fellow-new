import { GetStaticProps } from 'next';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { loadGoogleMaps, isGoogleMapsConfigured } from '@/lib/googleMaps';

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
  hours: string;
  categories: string[];
}

interface Origin {
  lat: number;
  lng: number;
  label: string;
}

function formatAddress(store: Store): string {
  return [store.address, store.city, store.state, store.country]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(', ');
}

// Opens the store in Google Maps by name + address so the user lands on the
// business, not a bare coordinate.
function mapsUrl(store: Store): string {
  const q = encodeURIComponent(`${store.name}, ${formatAddress(store)}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

// Marker info-window body. Wrapped in .sl-iw so the popup chrome can be styled
// down from Google's roomy default.
function infoWindowContent(store: Store): string {
  return (
    `<div class="sl-iw"><strong>${store.name}</strong><br/>${formatAddress(store)}` +
    (store.phone ? `<br/>${store.phone}` : '') +
    `</div>`
  );
}

// Great-circle distance in miles. Used to sort stores by proximity to a
// searched location; approximate is fine for ordering a store list.
function distanceMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Distance mode (a location was searched): show only the nearest N stores.
const NEAREST_MARKER_COUNT = 25;
// Browse / text-filter mode: never paint or list more than this at once. Pinning
// and rendering all ~4k stores is what made the page janky; the map viewport (or
// a search) narrows the set the user actually needs.
const MAX_VISIBLE = 100;

export default function StoreLocatorPage() {
  // Stores load client-side from the edge-cached /api/stores route rather than
  // being inlined into the page (which shipped ~1.1MB of JSON to every visitor).
  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesError, setStoresError] = useState(false);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // The resolved location of a submitted search. When set, the page switches
  // from text-filter mode to distance mode: stores are sorted by proximity and
  // the map recenters on this point.
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoNote, setGeoNote] = useState<string | null>(null);
  const [mapError, setMapError] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  // Flips true once the async Maps load finishes and the map exists. Marker
  // effects key off this so they run after the map is ready, not just when
  // `stores` first arrives (which is before the map loads).
  const [mapReady, setMapReady] = useState(false);
  // Bumped on every map 'idle' (pan/zoom settle) so the visible set recomputes
  // against the new viewport.
  const [viewportTick, setViewportTick] = useState(0);

  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapsRef = useRef<any>(null); // google.maps namespace
  const mapRef = useRef<any>(null); // google.maps.Map
  const markersRef = useRef<Record<number, any>>({}); // lazily created, cached by id
  const shownIdsRef = useRef<Set<number>>(new Set()); // ids currently on the map
  const originMarkerRef = useRef<any>(null);
  const infoRef = useRef<any>(null);

  // Fetch the store dataset once from the edge-cached API route.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/stores')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.success && Array.isArray(data.stores)) {
          setStores(data.stores);
        } else {
          setStoresError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setStoresError(true);
      })
      .finally(() => {
        if (!cancelled) setStoresLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the Google Maps JS API and create the map once.
  useEffect(() => {
    if (!isGoogleMapsConfigured()) {
      setMapError(true);
      return;
    }
    let cancelled = false;
    let idleListener: any = null;

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !mapElRef.current || mapRef.current) return;
        mapsRef.current = maps;
        const map = new maps.Map(mapElRef.current, {
          center: { lat: 39.5, lng: -98.35 }, // continental US centroid
          zoom: 4,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        mapRef.current = map;
        infoRef.current = new maps.InfoWindow({ maxWidth: 260 });
        // Recompute the visible set whenever the viewport settles.
        idleListener = map.addListener('idle', () => {
          if (!cancelled) setViewportTick((t) => t + 1);
        });
        setMapReady(true);
      })
      .catch((err) => {
        console.error('[StoreLocator] Google Maps failed to load:', err);
        if (!cancelled) setMapError(true);
      });

    // Tear the map down on unmount (client-side nav away): drop the idle
    // listener and detach every marker so nothing fires on, or is retained by,
    // the gone component.
    return () => {
      cancelled = true;
      if (idleListener) idleListener.remove();
      Object.values(markersRef.current).forEach((m) => m?.setMap(null));
      markersRef.current = {};
      shownIdsRef.current = new Set();
      if (originMarkerRef.current) {
        originMarkerRef.current.setMap(null);
        originMarkerRef.current = null;
      }
      mapRef.current = null;
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    stores.forEach((s) => (s.categories || []).forEach((c) => c && set.add(c)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [stores]);

  // The displayed list. In distance mode (a location was searched) every
  // category-matching store is shown, nearest first. Otherwise the text query
  // filters by name/city/state as before.
  const filtered = useMemo(() => {
    const byCategory = stores.filter(
      (s) => !category || (s.categories || []).includes(category)
    );

    if (origin) {
      return [...byCategory].sort(
        (a, b) =>
          distanceMiles(origin.lat, origin.lng, a.lat, a.lng) -
          distanceMiles(origin.lat, origin.lng, b.lat, b.lng)
      );
    }

    const q = search.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter((s) =>
      [s.name, s.city, s.state, s.address, s.country, ...(s.categories || [])]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [stores, search, category, origin]);

  const hasQuery = search.trim().length > 0;

  // The set the map pins and the list renders — kept identical so what you see
  // listed is what is pinned. Three modes:
  //  - distance (a location was searched): the nearest N, already sorted.
  //  - text search: the name/city matches (may be anywhere on the map).
  //  - browse: only stores inside the current viewport, so panning/zooming is
  //    what reveals stores instead of painting all ~4k at once.
  const visibleStores = useMemo(() => {
    if (origin) return filtered.slice(0, NEAREST_MARKER_COUNT);
    if (hasQuery) return filtered.slice(0, MAX_VISIBLE);

    const maps = mapsRef.current;
    const map = mapRef.current;
    const bounds = mapReady && map?.getBounds ? map.getBounds() : null;
    if (!maps || !bounds) return filtered.slice(0, MAX_VISIBLE);

    const within: Store[] = [];
    for (const s of filtered) {
      if (bounds.contains({ lat: s.lat, lng: s.lng })) {
        within.push(s);
        if (within.length >= MAX_VISIBLE) break;
      }
    }
    return within;
    // viewportTick is the trigger: it changes on every map idle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, origin, hasQuery, mapReady, viewportTick]);

  // Create a store's marker on demand and cache it. Markers are never created
  // for stores that are not currently visible, which is what keeps thousands of
  // rows from all being instantiated up front.
  const getMarker = useCallback((store: Store) => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    let marker = markersRef.current[store.id];
    if (!marker && maps) {
      marker = new maps.Marker({
        position: { lat: store.lat, lng: store.lng },
        title: store.name,
      });
      marker.addListener('click', () => {
        setSelectedId(store.id);
        if (infoRef.current) {
          infoRef.current.setContent(infoWindowContent(store));
          infoRef.current.open({ anchor: marker, map });
        }
      });
      markersRef.current[store.id] = marker;
    }
    return marker;
  }, []);

  // Sync pins to the visible set: show/create the ones in view, hide the rest.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const showIds = new Set(visibleStores.map((s) => s.id));
    shownIdsRef.current.forEach((id) => {
      if (!showIds.has(id)) markersRef.current[id]?.setMap(null);
    });
    visibleStores.forEach((s) => getMarker(s)?.setMap(map));
    shownIdsRef.current = showIds;
  }, [visibleStores, mapReady, getMarker]);

  // Reframe the map only when a location search resolves (origin set). Live
  // text typing and browse-mode panning are left alone, so the map does not jump
  // on every keystroke — the user pans freely and clicks a result to fly to it.
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map || !mapReady || !origin) return;

    const bounds = new maps.LatLngBounds();
    bounds.extend({ lat: origin.lat, lng: origin.lng });
    filtered.slice(0, 8).forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
    if (!bounds.isEmpty()) map.fitBounds(bounds, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, mapReady]);

  // Show the searched location itself as a distinct pin so it is clear what the
  // list is sorted around.
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map) return;

    if (originMarkerRef.current) {
      originMarkerRef.current.setMap(null);
      originMarkerRef.current = null;
    }
    if (origin) {
      originMarkerRef.current = new maps.Marker({
        position: { lat: origin.lat, lng: origin.lng },
        map,
        title: origin.label,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#207685',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
    }
  }, [origin, mapReady]);

  const runGeoSearch = useCallback(async () => {
    const q = search.trim();
    if (q.length < 2) {
      setOrigin(null);
      setGeoNote(null);
      return;
    }
    setGeoLoading(true);
    setGeoNote(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`).then((r) => r.json());
      if (res.success && res.result) {
        setOrigin(res.result);
        setGeoNote(`Showing stores near ${res.result.label}`);
      } else {
        // No place matched — fall back to the live text filter.
        setOrigin(null);
        setGeoNote('No location found. Showing name matches.');
      }
    } catch {
      setOrigin(null);
      setGeoNote('Location search is unavailable right now.');
    } finally {
      setGeoLoading(false);
    }
  }, [search]);

  const clearSearch = useCallback(() => {
    setSearch('');
    setOrigin(null);
    setGeoNote(null);
  }, []);

  const copyAddress = useCallback(async (store: Store) => {
    try {
      await navigator.clipboard.writeText(formatAddress(store));
      setCopiedId(store.id);
      setTimeout(() => setCopiedId((c) => (c === store.id ? null : c)), 1500);
    } catch {
      // Clipboard blocked (permissions/insecure context); leave the UI as-is.
    }
  }, []);

  const focusStore = useCallback(
    (store: Store) => {
      setSelectedId(store.id);
      const map = mapRef.current;
      // Ensure the marker exists and is on the map even if the store sits
      // outside the current viewport set. Track it so the next viewport sync
      // can hide it again rather than leaving an orphaned pin.
      const marker = getMarker(store);
      if (map && marker) {
        marker.setMap(map);
        shownIdsRef.current.add(store.id);
      }
      if (map) {
        map.panTo({ lat: store.lat, lng: store.lng });
        map.setZoom(14);
      }
      if (marker && infoRef.current) {
        infoRef.current.setContent(infoWindowContent(store));
        infoRef.current.open({ anchor: marker, map });
      }
    },
    [getMarker]
  );

  return (
    <Layout title="Store Locator">
      <div className="store-locator">
        <div className="store-locator__header">
          <h1 className="store-locator__title">Find a Store</h1>
          <form
            className="store-locator__search-form"
            onSubmit={(e) => {
              e.preventDefault();
              runGeoSearch();
            }}
          >
            <input
              type="search"
              className="store-locator__search"
              placeholder="Search by city, state, ZIP, or store name"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                // Editing the query drops distance mode until the next submit.
                if (origin) setOrigin(null);
                if (geoNote) setGeoNote(null);
              }}
              aria-label="Search stores"
            />
            <button type="submit" className="store-locator__search-btn" disabled={geoLoading}>
              {geoLoading ? 'Searching...' : 'Search'}
            </button>
            {(origin || search) && (
              <button type="button" className="store-locator__search-clear" onClick={clearSearch}>
                Clear
              </button>
            )}
          </form>
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
          {geoNote && <p className="store-locator__geo-note">{geoNote}</p>}
        </div>

        <div className="store-locator__body">
          <aside className="store-locator__list" aria-label="Store list">
            {storesLoading && (
              <p className="store-locator__empty">Loading stores...</p>
            )}
            {!storesLoading && storesError && (
              <p className="store-locator__empty">Could not load stores. Please try again.</p>
            )}
            {!storesLoading && !storesError && stores.length > 0 && filtered.length === 0 && (
              <p className="store-locator__empty">No stores match your search.</p>
            )}
            {!storesLoading && !storesError && !origin && !hasQuery && filtered.length > visibleStores.length && (
              <p className="store-locator__list-note">
                Showing {visibleStores.length} of {filtered.length} stores in view. Zoom in or search
                to narrow.
              </p>
            )}
            {visibleStores.map((store) => (
              <div
                key={store.id}
                className={
                  'store-locator__item' +
                  (selectedId === store.id ? ' store-locator__item--active' : '')
                }
              >
                <button
                  type="button"
                  className="store-locator__item-main"
                  onClick={() => focusStore(store)}
                >
                  <span className="store-locator__item-name">{store.name}</span>
                  <span className="store-locator__item-address">{formatAddress(store)}</span>
                  {origin && (
                    <span className="store-locator__item-meta">
                      {distanceMiles(origin.lat, origin.lng, store.lat, store.lng).toFixed(1)} mi away
                    </span>
                  )}
                  {store.phone && <span className="store-locator__item-meta">{store.phone}</span>}
                  {store.hours && <span className="store-locator__item-meta">{store.hours}</span>}
                </button>
                <div className="store-locator__item-actions">
                  <button
                    type="button"
                    className="store-locator__item-action"
                    onClick={() => copyAddress(store)}
                  >
                    {copiedId === store.id ? 'Copied' : 'Copy address'}
                  </button>
                  <a
                    className="store-locator__item-action"
                    href={mapsUrl(store)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in Google Maps
                  </a>
                </div>
              </div>
            ))}
          </aside>

          {mapError ? (
            <div className="store-locator__map store-locator__map--error" role="note">
              <p>Map is unavailable. Use the list to find a store.</p>
            </div>
          ) : (
            <div className="store-locator__map" ref={mapElRef} />
          )}
        </div>
      </div>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps = async () => {
  // Stores are NOT inlined here — the page fetches them client-side from the
  // edge-cached /api/stores route so the HTML stays small. getStaticProps only
  // prefetches the nav menus the shared Layout needs.
  try {
    const menuClient = await prefetchMenus();
    const props: Record<string, any> = {};
    mergeMenuState(props, menuClient);
    return { props, revalidate: 1800 };
  } catch {
    return {
      props: {},
      revalidate: 60,
    };
  }
};
