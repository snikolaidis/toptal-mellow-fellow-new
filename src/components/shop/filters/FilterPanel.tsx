import { useId, useState } from 'react';
import {
  ActiveFilters,
  FilterGroup,
  SORT_OPTIONS,
  getGroupControl,
} from '@/lib/shopFilters';
import styles from './FilterControls.module.css';

export interface SortValue {
  value: string;
  label: string;
}

interface FilterPanelProps {
  filterGroups: FilterGroup[];
  activeFilters: ActiveFilters;
  onFilterChange: (key: string, slugs: string[]) => void;
  sortValue: SortValue;
  onSortChange: (option: SortValue) => void;
  showHeader?: boolean;
  // Keep the default true: FilterSheet renders this panel, and mobile sort
  // lives in the sheet. Flipping it would remove sort from mobile entirely.
  showSort?: boolean;
}

export function clearAllFilters(
  filterGroups: FilterGroup[],
  activeFilters: ActiveFilters,
  onFilterChange: (key: string, slugs: string[]) => void,
) {
  for (const group of filterGroups) {
    if ((activeFilters[group.key] || []).length > 0) onFilterChange(group.key, []);
  }
}

const SORT_KEY = 'sort';

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ControlBox() {
  return (
    <span className={styles.checkbox} aria-hidden="true">
      <svg className={styles.tick} width="10" height="8" viewBox="0 0 10 8" fill="none">
        <path
          d="M1 4.2L3.7 7L9 1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default function FilterPanel({
  filterGroups,
  activeFilters,
  onFilterChange,
  sortValue,
  onSortChange,
  showHeader = true,
  showSort = true,
}: FilterPanelProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // The panel renders in the sidebar and in the sheet, so the sort radios need
  // a name unique to the instance or the two groups fight over one selection.
  const sortName = useId();

  const isOpen = (key: string, hasSelection: boolean) => open[key] ?? hasSelection;

  const toggleGroup = (key: string, hasSelection: boolean) => {
    // isOpen, not prev[key], which is undefined for a group opened by its own
    // selection: negating that reads as `true` and the first click does nothing.
    const next = !isOpen(key, hasSelection);
    setOpen((prev) => ({ ...prev, [key]: next }));
  };

  const toggleTerm = (groupKey: string, slug: string) => {
    const current = activeFilters[groupKey] || [];
    onFilterChange(
      groupKey,
      current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
    );
  };

  const labelFor = (groupKey: string, slug: string) =>
    filterGroups.find((g) => g.key === groupKey)?.terms.find((t) => t.slug === slug)?.name || slug;

  const selected = Object.entries(activeFilters).flatMap(([key, slugs]) =>
    slugs.map((slug) => ({ key, slug })),
  );

  const sorted = sortValue.value !== 'default';
  const sortExpanded = isOpen(SORT_KEY, sorted);

  return (
    <div className={styles.panel}>
      {showHeader && (
        <div className={styles.header}>
          <h2 className={styles.heading}>Filters</h2>
          {selected.length > 0 && (
            <button
              type="button"
              className={styles.clearAll}
              onClick={() => clearAllFilters(filterGroups, activeFilters, onFilterChange)}
            >
              Clear All
            </button>
          )}
        </div>
      )}

      {selected.length > 0 && (
        <div className={styles.chips}>
          {selected.map(({ key, slug }) => (
            <button
              key={`${key}:${slug}`}
              type="button"
              className={styles.chip}
              onClick={() => toggleTerm(key, slug)}
              aria-label={`Remove ${labelFor(key, slug)} filter`}
            >
              <span className={styles.chipLabel}>{labelFor(key, slug)}</span>
              <svg
                className={styles.chipX}
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M1 1L9 9M9 1L1 9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ))}
        </div>
      )}

      {showSort && (
        <div className={styles.group}>
          <button
            type="button"
            className={styles.groupHeader}
            onClick={() => toggleGroup(SORT_KEY, sorted)}
            aria-expanded={sortExpanded}
          >
            <span className={styles.groupLabel}>Sort By</span>
            <Chevron open={sortExpanded} />
          </button>

          {sortExpanded && (
            <div className={styles.terms}>
              {SORT_OPTIONS.map((option) => (
                <label key={option.value} className={styles.term}>
                  <input
                    type="radio"
                    name={sortName}
                    className={styles.termInput}
                    checked={sortValue.value === option.value}
                    onChange={() => onSortChange(option)}
                  />
                  <ControlBox />
                  <span className={styles.termName}>{option.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {filterGroups.map((group) => {
        const activeSlugs = activeFilters[group.key] || [];
        // Zero count terms stay, greyed, so the facet keeps its shape. A
        // checked term is never disabled at zero, or it could not be unticked.
        const visibleTerms = group.terms;
        const selectableTerms = visibleTerms.filter((t) => t.count > 0);

        // A single term filters nothing, so the group is hidden unless it is
        // already the active one. Behaviour inherited from ShopSidebar.
        if (selectableTerms.length < 2 && activeSlugs.length === 0) return null;

        const expanded = isOpen(group.key, activeSlugs.length > 0);
        const control = getGroupControl(group.key);

        return (
          <div key={group.key} className={styles.group}>
            <button
              type="button"
              className={styles.groupHeader}
              onClick={() => toggleGroup(group.key, activeSlugs.length > 0)}
              aria-expanded={expanded}
            >
              <span className={styles.groupLabel}>
                {group.label}
                {activeSlugs.length > 0 && (
                  <span className={styles.badge}>{activeSlugs.length}</span>
                )}
              </span>
              <Chevron open={expanded} />
            </button>

            {expanded && control === 'pill' && (
              <div className={`${styles.terms} ${styles.pills}`}>
                {visibleTerms.map((term) => {
                  const active = activeSlugs.includes(term.slug);
                  const unavailable = term.count === 0 && !active;
                  return (
                    <button
                      key={term.slug}
                      type="button"
                      className={`${styles.pill} ${active ? styles.pillActive : ''} ${
                        unavailable ? styles.pillDisabled : ''
                      }`}
                      aria-pressed={active}
                      disabled={unavailable}
                      onClick={() => toggleTerm(group.key, term.slug)}
                    >
                      {term.name}
                    </button>
                  );
                })}
              </div>
            )}

            {expanded && control === 'checkbox' && (
              <div className={styles.terms}>
                {visibleTerms.map((term) => {
                  const active = activeSlugs.includes(term.slug);
                  const unavailable = term.count === 0 && !active;
                  return (
                    <label
                      key={term.slug}
                      className={`${styles.term} ${unavailable ? styles.termDisabled : ''}`}
                    >
                      <input
                        type="checkbox"
                        className={styles.termInput}
                        checked={active}
                        disabled={unavailable}
                        onChange={() => toggleTerm(group.key, term.slug)}
                      />
                      <ControlBox />
                      <span className={styles.termName}>{term.name}</span>
                      <span className={styles.termCount}>{term.count}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
