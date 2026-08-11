import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

export interface TermSelection {
  slug: string;
  taxonomy: string;
}

interface CollectionFilterValue {
  selections: Record<string, TermSelection>;
  select: (group: string, term: TermSelection) => void;
}

const CollectionFilterContext = createContext<CollectionFilterValue>({
  selections: {},
  select: () => {},
});

export function CollectionFilterProvider({ children }: { children: ReactNode }) {
  const [selections, setSelections] = useState<Record<string, TermSelection>>({});

  const select = useCallback((group: string, term: TermSelection) => {
    if (!group || !term?.slug) return;
    setSelections((prev) => {
      const current = prev[group];
      if (current && current.slug === term.slug && current.taxonomy === term.taxonomy) {
        return prev;
      }
      return { ...prev, [group]: term };
    });
  }, []);

  const value = useMemo(() => ({ selections, select }), [selections, select]);

  return (
    <CollectionFilterContext.Provider value={value}>{children}</CollectionFilterContext.Provider>
  );
}

export function useCollectionFilter(group?: string | null) {
  const { selections, select } = useContext(CollectionFilterContext);
  const key = group || '';
  const selectInGroup = useCallback((term: TermSelection) => select(key, term), [key, select]);

  return {
    selected: key ? selections[key] || null : null,
    select: selectInGroup,
  };
}
