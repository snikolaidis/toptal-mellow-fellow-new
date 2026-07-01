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
  description: string;
  image: {
    sourceUrl: string;
    altText: string;
  } | null;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const [navigating, setNavigating] = useState(false);

  const goToSearchPage = () => {
    if (query.trim().length >= 2) {
      setNavigating(true);
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  // Close modal when navigation completes
  useEffect(() => {
    const done = () => { setNavigating(false); onClose(); };
    router.events.on('routeChangeComplete', done);
    router.events.on('routeChangeError', done);
    return () => {
      router.events.off('routeChangeComplete', done);
      router.events.off('routeChangeError', done);
    };
  }, [router, onClose]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setHasSearched(false);
    }
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

  // Debounced search
  const searchProducts = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();

      if (data.success) {
        setResults(data.products);
      } else {
        setResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
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

  // Strip HTML tags from description
  const stripHtml = (html: string) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  if (!isOpen) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Search products"
    >
      <div className={styles.modal} ref={modalRef}>
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close search"
        >
          <CloseIcon />
        </button>

        <form
          className={styles.inputWrapper}
          onSubmit={(e) => { e.preventDefault(); goToSearchPage(); }}
        >
          <div className={styles.inputIcon}>
            <SearchIcon />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products..."
            className={styles.input}
            autoComplete="off"
          />
        </form>

        <div className={styles.results}>
          {navigating && (
            <div className={styles.loading}>
              <div className="spinner h-6 w-6"></div>
              <span>Loading results...</span>
            </div>
          )}

          {!navigating && loading && (
            <div className={styles.loading}>
              <div className="spinner h-6 w-6"></div>
              <span>Searching...</span>
            </div>
          )}

          {!navigating && !loading && hasSearched && results.length === 0 && (
            <div className={styles.empty}>
              <p>No products found for &ldquo;{query}&rdquo;</p>
              <span>Try a different search term</span>
            </div>
          )}

          {!navigating && !loading && results.length > 0 && (
            <div className={styles.resultsList}>
              {results.map((product) => (
                <Link
                  key={product.id}
                  href={`/product/${product.slug}`}
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
                    <h4>{product.name}</h4>
                    {product.description && (
                      <p>{stripHtml(product.description).slice(0, 80)}...</p>
                    )}
                  </div>
                  <div className={styles.resultPrice}>
                    {product.price}
                  </div>
                </Link>
              ))}
              <Link
                href={`/search?q=${encodeURIComponent(query)}`}
                className={styles.viewAll}
                onClick={onClose}
              >
                View all results for &ldquo;{query}&rdquo;
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}

          {!navigating && !loading && !hasSearched && (
            <div className={styles.hint}>
              <p>Start typing to search products</p>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <span>Press Enter to see all results &middot; ESC to close</span>
        </div>
      </div>
    </div>
  );
}
