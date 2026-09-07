import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { CloseIcon, SearchIcon } from '@/components/icons';
import styles from './SearchModal/SearchModal.module.css';

interface SearchResult {
  id: string;
  databaseId: number;
  name: string;
  slug: string;
  price: string;
  image: {
    sourceUrl: string;
    altText: string;
  } | null;
}

interface CollectionResult {
  name: string;
  slug: string;
  count: number;
}

interface BlogResult {
  id: number;
  title: string;
  slug: string;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const VENDOR = 'Mellow Fellow';
const SIZE_RE = /\b\d+(?:\.\d+)?\s?(?:ml|mg|g|oz|ct|pcs?|pack|count)\b/i;
const FOCUSABLE_CONTROLS = 'a[href], button, input, select, textarea';

function formatPrice(price: string): string {
  if (!price) return '';
  return /usd/i.test(price) ? price : `${price} USD`;
}

function buildSuggestions(productNames: string[], collectionNames: string[], query: string, max = 4): string[] {
  const qFirst = query.toLowerCase().trim().split(/\s+/)[0] || '';
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (base: string) => {
    if (base.length < 3 || !qFirst || !base.includes(qFirst)) return;
    if (base.split(' ').filter(Boolean).length > 4) return;
    if (!seen.has(base)) {
      seen.add(base);
      out.push(base);
    }
  };

  for (const raw of productNames) {
    if (out.length >= max) break;
    let base = raw.toLowerCase().split(/\s[-–—]\s/)[0];
    const size = base.match(SIZE_RE);
    if (size && size.index !== undefined) {
      base = base.slice(0, size.index);
    }
    base = base.replace(/[^a-z0-9\s&]/g, ' ').replace(/\s+/g, ' ').trim();
    base = base.split(' ').filter(Boolean).slice(0, 4).join(' ');
    push(base);
  }

  for (const raw of collectionNames) {
    if (out.length >= max) break;
    const words = raw.toLowerCase().replace(/[^a-z0-9\s&]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const idx = words.findIndex((w) => w.includes(qFirst));
    let base: string;
    if (words.length <= 3) {
      base = words.join(' ');
    } else if (idx !== -1) {
      const start = idx === words.length - 1 ? Math.max(0, idx - 1) : idx;
      base = words.slice(start, start + 2).join(' ');
    } else {
      base = words.slice(0, 3).join(' ');
    }
    push(base);
  }

  return out.slice(0, max);
}

export default function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [collections, setCollections] = useState<CollectionResult[]>([]);
  const [posts, setPosts] = useState<BlogResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const reclaimedRef = useRef(false);

  const suggestions = buildSuggestions(
    results.map((r) => r.name),
    collections.map((c) => c.name),
    query
  );

  const visibleResults = results;

  const goToSearchPage = () => {
    if (query.trim().length >= 2) {
      onClose();
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  // Focus input when modal opens, restore focus to the trigger when it closes
  useEffect(() => {
    if (isOpen) {
      triggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      reclaimedRef.current = false;
      inputRef.current?.focus();
      return;
    }

    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (trigger?.isConnected) {
      trigger.focus();
    }

    abortRef.current?.abort();
    abortRef.current = null;
    setQuery('');
    setResults([]);
    setCollections([]);
    setPosts([]);
    setHasSearched(false);
    setLoading(false);
  }, [isOpen]);

  // The All in One Accessibility widget (loaded in _document) rebuilds its reading
  // order shortly after the modal mounts, which pulls focus off the input onto a
  // container it makes focusable with tabindex="-1". Take focus back once, unless it
  // moved to a real control, so deliberate tabbing and clicking still work. Do not
  // replace this with a longer delay: the widget's timing is not ours to rely on.
  useEffect(() => {
    const input = inputRef.current;
    if (!isOpen || !input) return;

    const handleFocusOut = (event: FocusEvent) => {
      if (reclaimedRef.current) return;
      const next = event.relatedTarget;
      if (next instanceof HTMLElement && next.closest(FOCUSABLE_CONTROLS)) return;
      reclaimedRef.current = true;
      setTimeout(() => input.focus(), 0);
    };

    input.addEventListener('focusout', handleFocusOut);
    return () => input.removeEventListener('focusout', handleFocusOut);
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Client-side search cache — avoids re-fetching for repeat/similar queries
  const searchCache = useRef<Map<string, { results: SearchResult[]; collections: CollectionResult[]; posts: BlogResult[]; time: number }>>(new Map());
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const CACHE_MAX_ENTRIES = 50;
  const REQUEST_TIMEOUT_MS = 15000;

  // Debounced search
  const searchProducts = useCallback(async (searchQuery: string) => {
    abortRef.current?.abort();
    abortRef.current = null;

    if (searchQuery.length < 2) {
      setResults([]);
      setCollections([]);
      setPosts([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    const cacheKey = searchQuery.toLowerCase().trim();
    const cached = searchCache.current.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      searchCache.current.delete(cacheKey);
      searchCache.current.set(cacheKey, cached);
      setResults(cached.results);
      setCollections(cached.collections);
      setPosts(cached.posts);
      setHasSearched(true);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    setLoading(true);
    setHasSearched(true);

    try {
      const [productsRes, collectionsRes, blogsRes] = await Promise.all([
        fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`, {
          signal: controller.signal,
        }).then((r) => r.json()),
        fetch(`/api/search-collections?q=${encodeURIComponent(searchQuery)}`, {
          signal: controller.signal,
        }).then((r) => r.json()),
        fetch(`/api/search-blogs?q=${encodeURIComponent(searchQuery)}`, {
          signal: controller.signal,
        }).then((r) => r.json()),
      ]);

      const nextResults: SearchResult[] = productsRes.success ? productsRes.products : [];
      const nextCollections: CollectionResult[] = collectionsRes.success ? collectionsRes.collections : [];
      const nextPosts: BlogResult[] = blogsRes.success ? blogsRes.posts : [];

      setResults(nextResults);
      setCollections(nextCollections);
      setPosts(nextPosts);
      searchCache.current.delete(cacheKey);
      searchCache.current.set(cacheKey, {
        results: nextResults,
        collections: nextCollections,
        posts: nextPosts,
        time: Date.now(),
      });
      while (searchCache.current.size > CACHE_MAX_ENTRIES) {
        const oldest = searchCache.current.keys().next().value;
        if (oldest === undefined) break;
        searchCache.current.delete(oldest);
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError' && !timedOut) {
        return;
      }
      console.error('Search error:', error);
      setResults([]);
      setCollections([]);
      setPosts([]);
    } finally {
      clearTimeout(timeoutId);
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, []);

  // Debounce effect
  useEffect(() => {
    const timer = setTimeout(() => {
      searchProducts(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchProducts]);

  // Handle click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const hasAny =
    results.length > 0 || collections.length > 0 || posts.length > 0 || suggestions.length > 0;

  return (
    <div
      className={styles.backdrop}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Search products"
    >
      <div className={styles.modal} ref={modalRef}>
        <div className={styles.header}>
          <div className={styles.headerInner}>
            <form
              className={styles.searchBar}
              onSubmit={(e) => { e.preventDefault(); goToSearchPage(); }}
            >
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className={styles.input}
                autoComplete="off"
              />
              <button type="submit" className={styles.searchBtn}>
                <SearchIcon />
                <span>Search</span>
              </button>
            </form>
            <button
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close search"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className={styles.results}>
          <div className={styles.bodyInner}>
          {loading && (
            <div className={styles.loading}>
              <div className="spinner h-6 w-6"></div>
              <span>Searching...</span>
            </div>
          )}

          {!loading && hasSearched && !hasAny && (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No results found for &ldquo;{query}&rdquo;</p>
              <span className={styles.emptySubtitle}>Try a different search term</span>
            </div>
          )}

          {!loading && !hasSearched && (
            <div className={styles.hint}>
              <p>Start typing to search products</p>
            </div>
          )}

          {!loading && hasAny && (
            <div className={styles.panel}>
              {suggestions.length > 0 && (
                <div className={`${styles.section} ${styles.sectionSuggestions}`}>
                  <h3 className={styles.sectionTitle}>Suggestions</h3>
                  <ul className={styles.suggestList}>
                    {suggestions.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          className={styles.suggestItem}
                          onClick={() => setQuery(s)}
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {visibleResults.length > 0 && (
                <div className={`${styles.section} ${styles.sectionProducts}`}>
                  <h3 className={styles.sectionTitle}>Products</h3>
                  <div className={styles.resultsList}>
                    {visibleResults.slice(0, 6).map((product) => (
                      <Link
                        key={product.id}
                        href={`/products/${product.slug}`}
                        className={styles.resultItem}
                        onClick={onClose}
                      >
                        <div className={styles.resultImage}>
                          {product.image ? (
                            <Image
                              src={product.image.sourceUrl}
                              alt={product.image.altText || product.name}
                              width={64}
                              height={64}
                              style={{ objectFit: 'cover' }}
                            />
                          ) : (
                            <div className={styles.resultPlaceholder} />
                          )}
                        </div>
                        <div className={styles.resultInfo}>
                          <h4 className={styles.resultName}>{product.name}</h4>
                          <span className={styles.resultVendor}>{VENDOR}</span>
                          <span className={styles.resultPrice}>{formatPrice(product.price)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {collections.length > 0 && (
                <div className={`${styles.section} ${styles.sectionCollections}`}>
                  <h3 className={styles.sectionTitle}>Collections</h3>
                  <ul className={styles.collectionList}>
                    {collections.map((c) => (
                      <li key={c.slug}>
                        <Link
                          href={`/collections/${c.slug}`}
                          className={styles.collectionItem}
                          onClick={onClose}
                        >
                          {c.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {posts.length > 0 && (
                <div className={`${styles.section} ${styles.sectionArticles}`}>
                  <h3 className={styles.sectionTitle}>Articles</h3>
                  <ul className={styles.collectionList}>
                    {posts.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/blogs/${p.slug}`}
                          className={styles.collectionItem}
                          onClick={onClose}
                        >
                          {p.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!loading && hasAny && (
            <Link
              href={`/search?q=${encodeURIComponent(query)}`}
              className={styles.viewAll}
              onClick={onClose}
            >
              Show all results for &ldquo;{query}&rdquo;
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
