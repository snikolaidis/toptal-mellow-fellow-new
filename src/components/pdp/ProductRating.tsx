interface Props {
  average: number;
  total: number;
  href?: string; // Anchor of the reviews section further down the page.
}

/**
 * Star average + review count, shown under the product title.
 *
 * The star row uses the same fractional-fill trick as the reviews section
 * (`ProductReviews`): five outline stars with a clipped filled copy layered on
 * top, so a 4.4 average renders as four and a bit rather than rounding to
 * four. If a third caller ever needs it, this is the point to extract it into
 * one shared component.
 */
export default function ProductRating({ average, total, href = '#reviews' }: Props) {
  // No ratings yet — showing "0.0" and an empty star row reads worse than
  // showing nothing at all on a new product.
  if (!total || total <= 0) {
    return null;
  }

  const pct = Math.max(0, Math.min(average / 5, 1)) * 100;

  return (
    <div className="product-rating">
      <span
        className="product-rating__stars"
        role="img"
        aria-label={`${average.toFixed(1)} out of 5 stars`}
      >
        <span className="product-rating__stars-track" aria-hidden="true">
          ★★★★★
        </span>
        <span
          className="product-rating__stars-fill"
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        >
          ★★★★★
        </span>
      </span>

      <span className="product-rating__average">{average.toFixed(1)}</span>

      <a className="product-rating__count" href={href}>
        {total} review{total === 1 ? '' : 's'}
      </a>
    </div>
  );
}
