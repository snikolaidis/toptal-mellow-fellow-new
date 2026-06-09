import { useState } from 'react';

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

interface ShopSidebarProps {
  filterGroups: FilterGroup[];
  activeFilters: Record<string, string[]>;
  onFilterChange: (key: string, slugs: string[]) => void;
}

export default function ShopSidebar({
  filterGroups,
  activeFilters,
  onFilterChange,
}: ShopSidebarProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    // Start with first filter expanded
    const initial: Record<string, boolean> = {};
    if (filterGroups.length > 0) initial[filterGroups[0].key] = true;
    return initial;
  });

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

  const hasActiveFilters = Object.values(activeFilters).some((v) => v.length > 0);

  return (
    <aside className="shop-sidebar">
      {hasActiveFilters && (
        <button
          className="shop-sidebar__clear"
          onClick={() => {
            for (const group of filterGroups) {
              onFilterChange(group.key, []);
            }
          }}
        >
          Clear all filters
        </button>
      )}

      {filterGroups.map((group) => {
        const isExpanded = expanded[group.key] || false;
        const activeCount = (activeFilters[group.key] || []).length;
        const visibleTerms = group.terms.filter((t) => t.count > 0);

        if (visibleTerms.length === 0) return null;

        return (
          <div key={group.key} className="shop-sidebar__group">
            <button
              className="shop-sidebar__group-header"
              onClick={() => toggleGroup(group.key)}
              aria-expanded={isExpanded}
            >
              <span className="shop-sidebar__group-label">
                {group.label}
                {activeCount > 0 && (
                  <span className="shop-sidebar__active-count">{activeCount}</span>
                )}
              </span>
              <svg
                className={`shop-sidebar__chevron ${isExpanded ? 'shop-sidebar__chevron--open' : ''}`}
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {isExpanded && (
              <div className="shop-sidebar__terms">
                {visibleTerms.map((term) => {
                  const isActive = (activeFilters[group.key] || []).includes(term.slug);
                  return (
                    <label key={term.slug} className="shop-sidebar__term">
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={() => toggleTerm(group.key, term.slug)}
                      />
                      <span className="shop-sidebar__term-name">{term.name}</span>
                      <span className="shop-sidebar__term-count">{term.count}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
