import { useState } from 'react';
import { ChevronUpIcon } from '@/components/icons';
import { ProductCategory } from '@/types/woocommerce';
import styles from './MobileFilters.module.css';

interface CategoryCount {
  [slug: string]: number;
}

interface MobileFiltersProps {
  categories: ProductCategory[];
  selectedCategory: string;
  onCategoryChange: (slug: string) => void;
  productCount: number;
  categoryCounts?: CategoryCount;
  filteredCount: number;
}

export default function MobileFilters({
  categories,
  selectedCategory,
  onCategoryChange,
  productCount,
  categoryCounts,
  filteredCount,
}: MobileFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Sort categories alphabetically, filter out empty ones
  const sortedCategories = [...categories]
    .filter((cat) => {
      if (categoryCounts) {
        return (categoryCounts[cat.slug] || 0) > 0;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.slug === 'uncategorized') return 1;
      if (b.slug === 'uncategorized') return -1;
      return a.name.localeCompare(b.name);
    });

  const selectedCategoryName =
    selectedCategory === 'all'
      ? 'All Products'
      : categories.find((c) => c.slug === selectedCategory)?.name || 'Products';

  const handleCategorySelect = (slug: string) => {
    onCategoryChange(slug);
    setIsExpanded(false);
  };

  return (
    <div className={`${styles.mobileFilters} ${isExpanded ? styles.expanded : ''}`}>
      {/* Collapsed: Filter bar */}
      <button
        className={styles.filterBar}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls="mobile-filters-panel"
      >
        <div className={styles.filterInfo}>
          <svg className={styles.filterIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className={styles.filterLabel}>Filter</span>
          <span className={styles.selectedCategory}>{selectedCategoryName}</span>
        </div>
        <div className={styles.toggle}>
          <span className={styles.productCount}>{filteredCount} products</span>
          <ChevronUpIcon />
        </div>
      </button>

      {/* Expanded: Category list */}
      {isExpanded && (
        <div id="mobile-filters-panel" className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3>Categories</h3>
          </div>
          <ul className={styles.categoryList}>
            <li>
              <button
                onClick={() => handleCategorySelect('all')}
                className={`${styles.categoryItem} ${selectedCategory === 'all' ? styles.active : ''}`}
              >
                <span className={styles.categoryName}>All Products</span>
                <span className={styles.categoryCount}>{productCount}</span>
              </button>
            </li>
            {sortedCategories.map((category) => {
              const count = categoryCounts
                ? categoryCounts[category.slug] || 0
                : category.count;

              return (
                <li key={category.id}>
                  <button
                    onClick={() => handleCategorySelect(category.slug)}
                    className={`${styles.categoryItem} ${selectedCategory === category.slug ? styles.active : ''}`}
                  >
                    <span className={styles.categoryName}>{category.name}</span>
                    {count !== undefined && count > 0 && (
                      <span className={styles.categoryCount}>{count}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
