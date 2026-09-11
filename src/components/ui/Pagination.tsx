import styles from './Pagination.module.css';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  label: string;
}

/** Lifted from the blog index unchanged, so the two cannot drift. Seven or
 *  fewer pages render whole; past that, first, last and a window. */
export function getPaginationRange(
  current: number,
  total: number
): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const range: (number | '...')[] = [1];

  if (current <= 4) {
    for (let i = 2; i <= 4; i++) range.push(i);
    range.push('...');
  } else if (current >= total - 3) {
    range.push('...');
    for (let i = total - 3; i <= total - 1; i++) range.push(i);
  } else {
    range.push('...', current - 1, current, current + 1, '...');
  }

  range.push(total);
  return range;
}

// Stroke lives in CSS, not here: the frame's left chevron is #A9A6A3 only
// because Previous is disabled on page one. Both are #354654 when enabled.
const CHEVRON_LEFT = 'M5.34998 0.849976L0.849976 5.34998L5.34998 9.84998';
const CHEVRON_RIGHT = 'M0.849976 0.849976L5.34998 5.34998L0.849976 9.84998';

function Chevron({ d }: { d: string }) {
  return (
    <svg
      className={styles.chevron}
      width="7"
      height="11"
      viewBox="0 0 7 11"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={d}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Pagination({
  page,
  totalPages,
  onPageChange,
  disabled = false,
  label,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const range = getPaginationRange(page, totalPages);
  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  return (
    <nav className={styles.pagination} aria-label={label}>
      <button
        type="button"
        className={`${styles.step} ${styles.prev}`}
        onClick={() => onPageChange(page - 1)}
        disabled={disabled || atStart}
        aria-label="Previous page"
      >
        <Chevron d={CHEVRON_LEFT} />
        <span className={styles.stepLabel}>Previous</span>
      </button>

      {range.map((entry, index) =>
        entry === '...' ? (
          <span
            key={`ellipsis-${index}`}
            className={styles.ellipsis}
            aria-hidden="true"
          >
            &hellip;
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            className={`${styles.pageNumber} ${
              entry === page ? styles.pageNumberCurrent : ''
            }`}
            onClick={() => onPageChange(entry)}
            disabled={disabled}
            aria-label={`Page ${entry}`}
            aria-current={entry === page ? 'page' : undefined}
          >
            {entry}
          </button>
        )
      )}

      <button
        type="button"
        className={`${styles.step} ${styles.next}`}
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || atEnd}
        aria-label="Next page"
      >
        <span className={styles.stepLabel}>Next</span>
        <Chevron d={CHEVRON_RIGHT} />
      </button>
    </nav>
  );
}
