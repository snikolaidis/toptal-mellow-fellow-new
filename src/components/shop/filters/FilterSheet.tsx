import { useEffect, useState } from 'react';
import {
  ActiveFilters,
  EMPTY_PRICE_RANGE,
  FilterGroup,
  PriceRange,
  hasPriceRange,
} from '@/lib/shopFilters';
import FilterPanel, { SortValue, clearAllFilters } from './FilterPanel';
import styles from './FilterControls.module.css';

interface FilterSheetProps {
  filterGroups: FilterGroup[];
  activeFilters: ActiveFilters;
  onFilterChange: (key: string, slugs: string[]) => void;
  productCount: number;
  sortValue: SortValue;
  onSortChange: (option: SortValue) => void;
  priceRange?: PriceRange;
  onPriceChange?: (range: PriceRange) => void;
}

function FilterIcon() {
  return (
    <svg width="12" height="13" viewBox="0 0 12 13" fill="none" aria-hidden="true">
      <path d="M2.39152 10.3325C1.08302 10.3325 0 9.27246 0 7.94095C0 6.63246 1.06001 5.54944 2.39152 5.54944C3.70002 5.54944 4.78303 6.60945 4.78303 7.94095C4.78303 9.27147 3.72302 10.3325 2.39152 10.3325ZM2.39152 6.47474C1.5791 6.47474 0.902379 7.12853 0.902379 7.96387C0.902379 8.77629 1.55618 9.45301 2.39152 9.45301C3.20394 9.45301 3.88065 8.79921 3.88065 7.96387C3.88065 7.15145 3.22685 6.47474 2.39152 6.47474Z" fill="#191B1B" />
      <path d="M2.39255 6.47473C2.14406 6.47473 1.94141 6.27207 1.94141 6.02359V0.452182C1.94141 0.203692 2.14407 0.0010376 2.39255 0.0010376C2.64104 0.0010376 2.84369 0.203701 2.84369 0.452182V6.02359C2.84369 6.27208 2.64103 6.47473 2.39255 6.47473Z" fill="#191B1B" />
      <path d="M2.39255 12.2717C2.14406 12.2717 1.94141 12.069 1.94141 11.8206V9.88028C1.94141 9.63179 2.14407 9.42914 2.39255 9.42914C2.64104 9.42914 2.84369 9.6318 2.84369 9.88028V11.8206C2.84369 12.0691 2.64103 12.2717 2.39255 12.2717Z" fill="#191B1B" />
      <path d="M9.20402 6.70027C7.89552 6.70027 6.8125 5.64026 6.8125 4.30875C6.8125 3.00025 7.87251 1.91724 9.20402 1.91724C10.5125 1.91724 11.5955 2.97724 11.5955 4.30875C11.5726 5.61725 10.5117 6.70027 9.20402 6.70027ZM9.20402 2.84253C8.39159 2.84253 7.71488 3.49633 7.71488 4.33167C7.71488 5.14409 8.36868 5.82081 9.20402 5.82081C10.0164 5.82081 10.6932 5.16701 10.6932 4.33167C10.6702 3.49723 10.0156 2.84253 9.20402 2.84253Z" fill="#191B1B" />
      <path d="M9.20505 12.2717C8.95656 12.2717 8.75391 12.0691 8.75391 11.8206V6.24918C8.75391 6.00069 8.95657 5.79803 9.20505 5.79803C9.45354 5.79803 9.65619 6.0007 9.65619 6.24918V11.8206C9.65619 12.0691 9.45265 12.2717 9.20505 12.2717Z" fill="#191B1B" />
      <path d="M9.20505 2.84257C8.95656 2.84257 8.75391 2.63991 8.75391 2.39143V0.451144C8.75391 0.202654 8.95657 0 9.20505 0C9.45354 0 9.65619 0.202663 9.65619 0.451144V2.39143C9.65619 2.63992 9.45265 2.84257 9.20505 2.84257Z" fill="#191B1B" />
    </svg>
  );
}

export default function FilterSheet({
  filterGroups,
  activeFilters,
  onFilterChange,
  productCount,
  sortValue,
  onSortChange,
  priceRange = EMPTY_PRICE_RANGE,
  onPriceChange,
}: FilterSheetProps) {
  const [isOpen, setIsOpen] = useState(false);

  const priceActive = hasPriceRange(priceRange);
  const totalActive =
    Object.values(activeFilters).reduce((sum, v) => sum + v.length, 0) + (priceActive ? 1 : 0);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  return (
    <div className={styles.sheetRoot}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <FilterIcon />
        Filter
        {totalActive > 0 && <span className={styles.badge}>{totalActive}</span>}
      </button>

      {isOpen && (
        <div className={styles.sheet} role="dialog" aria-label="Filters">
          <div className={styles.sheetBar}>
            <button
              type="button"
              className={styles.sheetClose}
              onClick={() => setIsOpen(false)}
              aria-label="Close filters"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M3 3L13 13M13 3L3 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <h2 className={styles.sheetBarHeading}>Filters</h2>

            <span className={styles.sheetBarAction}>
              <button
                type="button"
                className={styles.clearAll}
                onClick={() => {
                  clearAllFilters(filterGroups, activeFilters, onFilterChange);
                  if (priceActive) onPriceChange?.(EMPTY_PRICE_RANGE);
                }}
                disabled={totalActive === 0}
              >
                Clear All
              </button>
            </span>
          </div>

          <div className={styles.sheetBody}>
            <FilterPanel
              filterGroups={filterGroups}
              activeFilters={activeFilters}
              onFilterChange={onFilterChange}
              sortValue={sortValue}
              onSortChange={onSortChange}
              showHeader={false}
              priceRange={priceRange}
              onPriceChange={onPriceChange}
            />
          </div>

          <div className={styles.sheetFooter}>
            <button type="button" className={styles.showBtn} onClick={() => setIsOpen(false)}>
              Show {productCount} {productCount === 1 ? 'Product' : 'Products'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
