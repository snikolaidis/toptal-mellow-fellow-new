import { useMemo, useState } from 'react';
import type { KlaviyoReview, KlaviyoReviewSummary } from '@/lib/klaviyo-reviews';

interface Props {
  summary?: KlaviyoReviewSummary | null;
  reviews: KlaviyoReview[];
}

const STAR_ROWS = [5, 4, 3, 2, 1] as const;

function Stars({ rating, className }: { rating: number; className?: string }) {
  const pct = Math.max(0, Math.min(rating / 5, 1)) * 100;
  return (
    <span
      className={className ? `product-reviews__stars ${className}` : 'product-reviews__stars'}
      role="img"
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      <span className="product-reviews__stars-track" aria-hidden="true">
        ★★★★★
      </span>
      <span
        className="product-reviews__stars-fill"
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      >
        ★★★★★
      </span>
    </span>
  );
}

function VerifiedIcon() {
  return (
    <svg
      className="product-reviews__verified-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="currentColor">
        <rect x="4" y="4" width="16" height="16" rx="1.6" />
        <rect x="4" y="4" width="16" height="16" rx="1.6" transform="rotate(45 12 12)" />
      </g>
      <path
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.4 12.25l3.25 3.25 6.2-7"
      />
    </svg>
  );
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365.25 * 24 * 60 * 60 * 1000],
  ['month', 30.44 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const diff = then - Date.now();
  const abs = Math.abs(diff);

  for (const [unit, ms] of RELATIVE_UNITS) {
    if (abs >= ms) {
      return relativeFormatter.format(Math.round(diff / ms), unit);
    }
  }
  return 'just now';
}

function RelativeDate({ iso, className }: { iso: string; className?: string }) {
  return (
    <time className={className} dateTime={iso} suppressHydrationWarning>
      {relativeTime(iso)}
    </time>
  );
}

function SearchIcon() {
  return (
    <svg
      className="product-reviews__search-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="product-reviews__select-chevron"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

type SortKey = 'relevant' | 'recent' | 'highest' | 'lowest';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'relevant', label: 'Most relevant' },
  { value: 'recent', label: 'Most recent' },
  { value: 'highest', label: 'Highest rated' },
  { value: 'lowest', label: 'Lowest rated' },
];

// Below this many reviews there is nothing meaningful to sort or filter, so the control bar is hidden entirely.
const CONTROLS_MIN = 8;
// Limit when the Search appears to a minimum number of reviews
const SEARCH_MIN = 20;

const byNewest = (a: KlaviyoReview, b: KlaviyoReview) =>
  new Date(b.created).getTime() - new Date(a.created).getTime();

const hasText = (r: KlaviyoReview) => (r.content.trim() ? 1 : 0);

export default function ProductReviews({ summary, reviews }: Props) {
  const [sort, setSort] = useState<SortKey>('relevant');
  const [rating, setRating] = useState<'all' | 1 | 2 | 3 | 4 | 5>('all');
  const [query, setQuery] = useState('');

  // Counts per star for the filter's option labels, so empty buckets can be disabled rather than offered and then returning nothing.
  const starCounts = useMemo(() => {
    const counts: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of reviews) {
      const s = Math.round(r.rating) as 1 | 2 | 3 | 4 | 5;
      if (s >= 1 && s <= 5) counts[s] += 1;
    }
    return counts;
  }, [reviews]);

  const visible = useMemo(() => {
    let out = reviews;

    if (rating !== 'all') {
      out = out.filter((r) => Math.round(r.rating) === rating);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (r) =>
          r.content.toLowerCase().includes(q) ||
          (r.author || '').toLowerCase().includes(q)
      );
    }

    const sorted = [...out];
    switch (sort) {
      case 'recent':
        sorted.sort(byNewest);
        break;
      case 'highest':
        sorted.sort((a, b) => b.rating - a.rating || byNewest(a, b));
        break;
      case 'lowest':
        sorted.sort((a, b) => a.rating - b.rating || byNewest(a, b));
        break;
      case 'relevant':
      default:
        // Most ratings have no text, so written reviews lead,otherwise a typical product shows empty star-only cards first.
        sorted.sort((a, b) => hasText(b) - hasText(a) || byNewest(a, b));
        break;
    }
    return sorted;
  }, [reviews, rating, query, sort]);

  if (!summary || summary.total === 0) {
    return null;
  }

  const { average, total, distribution } = summary;
  const showControls = reviews.length >= CONTROLS_MIN;
  const showSearch = reviews.length >= SEARCH_MIN;
  const isFiltered = rating !== 'all' || query.trim() !== '';

  const resetFilters = () => {
    setRating('all');
    setQuery('');
  };

  return (
    <section className="product-reviews-section" id="reviews">
      <h2 className="product-reviews__heading">
        Customer reviews
      </h2>

      <div className="columns is-8-desktop is-vcentered">
        <div className="column">
          <div className="product-reviews__summary">
            <div className="product-reviews__score">
              <span className="product-reviews__average">{average.toFixed(1)}</span>
              <span className="product-reviews__out-of">/ 5</span>
            </div>

            <div className="product-reviews__score-meta">
              <Stars rating={average} className="product-reviews__stars--lg" />
              <span className="product-reviews__count">
                {total} review{total === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>

        <div className="column">
           <ul className="product-reviews__histogram">
            {STAR_ROWS.map((star) => {
              const count = distribution[star] || 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <li key={star} className="product-reviews__histogram-row">
                  <span className="product-reviews__histogram-label">
                    {star}
                    <span aria-hidden="true">★</span>
                  </span>
                  <span className="product-reviews__histogram-track">
                    <span
                      className="product-reviews__histogram-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="product-reviews__histogram-pct">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="product-reviews">
        {reviews.length > 0 && (
          <>
            <div className="product-reviews__list-header">
              <h3 className="product-reviews__list-heading">
                Reviews <span className="product-reviews__list-count">{visible.length}</span>
              </h3>
            </div>

            {showControls && (
              <div className="product-reviews__controls">
                {showSearch && (
                  <div className="product-reviews__search">
                    <SearchIcon />
                    <input
                      type="search"
                      className="product-reviews__search-input"
                      placeholder="Search reviews"
                      aria-label="Search reviews"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                )}

                <div className="product-reviews__select">
                  <select
                    aria-label="Sort reviews"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <ChevronIcon />
                </div>

                <div className="product-reviews__select">
                  <select
                    aria-label="Filter by rating"
                    value={rating}
                    onChange={(e) =>
                      setRating(
                        e.target.value === 'all'
                          ? 'all'
                          : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5)
                      )
                    }
                  >
                    <option value="all">All ratings</option>
                    {STAR_ROWS.map((star) => (
                      <option key={star} value={star} disabled={starCounts[star] === 0}>
                        {star} star{star === 1 ? '' : 's'} ({starCounts[star]})
                      </option>
                    ))}
                  </select>
                  <ChevronIcon />
                </div>
              </div>
            )}

            {visible.length === 0 && (
              <p className="product-reviews__empty">
                No reviews match your filters.{' '}
                <button
                  type="button"
                  className="product-reviews__reset"
                  onClick={resetFilters}
                >
                  Clear filters
                </button>
              </p>
            )}

            <ul className="product-reviews__list">
            {visible.map((review) => (
              <li key={review.id} className="product-reviews__card">
                <div className="product-reviews__card-head">
                  <Stars rating={review.rating} />
                  <RelativeDate iso={review.created} className="product-reviews__date" />
                </div>

                <p className="product-reviews__byline">
                  {review.author && (
                    <span className="product-reviews__author">{review.author}</span>
                  )}
                  {review.verified && (
                    <span className="product-reviews__verified">
                      <VerifiedIcon />
                      Verified buyer
                    </span>
                  )}
                </p>

                {/* Star-only ratings carry no text — the card is just the
                    stars, author and date. */}
                {review.content && (
                  <p className="product-reviews__content">{review.content}</p>
                )}

                {review.reply && (
                  <div className="product-reviews__reply">
                    <p className="product-reviews__reply-head">
                      {review.reply.author || 'Mellow Fellow'} replied
                      {review.reply.updated && (
                        <>
                          {' '}
                          <RelativeDate iso={review.reply.updated} />
                        </>
                      )}
                    </p>
                    <div className="product-reviews__reply-body">{review.reply.content}</div>
                  </div>
                )}
              </li>
            ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
