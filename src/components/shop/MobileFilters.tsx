import { useState } from 'react';
import styles from './MobileFilters.module.css';

interface TaxonomyTerm {
  name: string;
  slug: string;
  count: number;
}

interface FilterGroup {
  key: string;
  label: string;
  terms: TaxonomyTerm[];
}

interface MobileFiltersProps {
  filterGroups: FilterGroup[];
  activeFilters: Record<string, string[]>;
  onFilterChange: (key: string, slugs: string[]) => void;
  productCount: number;
}

export default function MobileFilters({
  filterGroups,
  activeFilters,
  onFilterChange,
  productCount,
}: MobileFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const totalActive = Object.values(activeFilters).reduce((sum, v) => sum + v.length, 0);

  const toggleGroup = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleTerm = (groupKey: string, slug: string) => {
    const current = activeFilters[groupKey] || [];
    const next = current.includes(slug)
      ? current.filter((s) => s !== slug)
      : [...current, slug];
    onFilterChange(groupKey, next);
  };

  return (
    <div className={styles.mobileFilters}>
      <button
        className={styles.filterBar}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <div className={styles.filterInfo}>
          <svg className={styles.filterIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span>Filter</span>
          {totalActive > 0 && (
            <span className={styles.badge}>{totalActive}</span>
          )}
        </div>
        <svg
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className={styles.panel}>
            <div className={styles.panelContent}>
              {filterGroups.map((group) => {
                const isExpanded = expanded[group.key] || false;
                const visibleTerms = group.terms.filter((t) => t.count > 0);
                if (visibleTerms.length === 0) return null;

                return (
                  <div key={group.key} className={styles.group}>
                    <button
                      className={styles.groupHeader}
                      onClick={() => toggleGroup(group.key)}
                    >
                      <span>{group.label}</span>
                      <svg
                        className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}
                        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {isExpanded && (
                      <div className={styles.terms}>
                        {visibleTerms.map((term) => (
                          <label key={term.slug} className={styles.term}>
                            <input
                              type="checkbox"
                              checked={(activeFilters[group.key] || []).includes(term.slug)}
                              onChange={() => toggleTerm(group.key, term.slug)}
                            />
                            <span>{term.name}</span>
                            <span className={styles.termCount}>{term.count}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={styles.panelFooter}>
              {totalActive > 0 && (
                <button
                  className={styles.clearBtn}
                  onClick={() => filterGroups.forEach((g) => onFilterChange(g.key, []))}
                >
                  Clear all
                </button>
              )}
              <button className={styles.applyBtn} onClick={() => setIsOpen(false)}>
                Show {productCount} results
              </button>
            </div>
        </div>
      )}
    </div>
  );
}
