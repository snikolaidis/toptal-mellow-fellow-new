import { fragments } from './CategoryTabs.fragments';
import { useCallback, useEffect, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCollectionFilter } from '@/context/CollectionFilterContext';
import { taxonomyForTypename } from '@/lib/taxonomy';
import { decodeEntities } from '@/lib/decodeEntities';

interface MediaItem {
  id?: string;
  altText?: string | null;
  sourceUrl?: string | null;
}

interface CollectionNode {
  __typename?: string | null;
  databaseId?: number | null;
  name?: string | null;
  slug?: string | null;
}

interface Tab {
  icon?: { node?: MediaItem | null } | null;
  label?: string | null;
  collection?: { nodes?: CollectionNode[] | null; node?: CollectionNode | null } | null;
  productCategory?: { nodes?: CollectionNode[] | null; node?: CollectionNode | null } | null;
  link?: { url?: string | null; title?: string | null; target?: string | null } | null;
  isActive?: boolean | null;
}

interface MoodTerm {
  name?: string | null;
  slug?: string | null;
  count?: number | null;
}

interface CategoryTabsProps {
  moodTerms?: MoodTerm[] | null;
  categoryTabs?: {
    heading?: string | null;
    subheading?: string | null;
    filterGroup?: string | null;
    tabs?: Tab[] | null;
  } | null;
}

function moodToTab(term: MoodTerm): Tab | null {
  if (!term.slug || !term.name) return null;
  return {
    label: decodeEntities(term.name),
    // No icon: the only image a mood term carries is its full bleed hero, which
    // reads as a cropped photo at 24px. Emma's mood tabs are text only.
    icon: null,
    collection: {
      nodes: [{ __typename: 'Mood', name: term.name, slug: term.slug }],
    },
  };
}

// Product category wins over collection: the collection terms behind these tabs
// were mis-populated (`flower` and `drinks` hold the same 70 products, most of
// them neither), so a tab points at a product category wherever one is set.
function tabTerm(tab: Tab) {
  const node =
    tab.productCategory?.nodes?.[0] ??
    tab.productCategory?.node ??
    tab.collection?.nodes?.[0] ??
    tab.collection?.node ??
    null;
  if (!node?.slug) return null;
  return { slug: node.slug, taxonomy: taxonomyForTypename(node.__typename) };
}

function TabInner({ tab }: { tab: Tab }) {
  const icon = tab.icon?.node;
  return (
    <>
      {icon?.sourceUrl && (
        <Image
          className="category-tabs__icon"
          src={icon.sourceUrl}
          alt={icon.altText || ''}
          width={24}
          height={24}
        />
      )}
      <span className="category-tabs__label">{tab.label}</span>
    </>
  );
}

export default function CategoryTabs(props: CategoryTabsProps) {
  const data = props.categoryTabs;
  const group = data?.filterGroup || '';
  const { selected, select } = useCollectionFilter(group);

  // The mood tabs come from the taxonomy so all six show up and stay in step
  // with the mood pages. The hand maintained repeater is the fallback for the
  // category tabs, and for environments where the taxonomy is absent.
  const moodTabs = useMemo(
    () =>
      (props.moodTerms ?? [])
        // A mood with no products would render a tab that empties the carousel
        // underneath it. Assigning products to the mood brings its tab back on
        // its own.
        .filter((term) => (term.count ?? 0) > 0)
        .map(moodToTab)
        .filter((t): t is Tab => t !== null),
    [props.moodTerms]
  );
  const tabs = group === 'moods' && moodTabs.length > 0 ? moodTabs : data?.tabs ?? [];
  const tabTerms = useMemo(() => tabs.map((t) => tabTerm(t)), [tabs]);
  const defaultTerm = tabTerms[tabs.findIndex((t) => t.isActive)] ?? tabTerms.find(Boolean) ?? null;
  const defaultSlug = defaultTerm?.slug || '';
  const defaultTaxonomy = defaultTerm?.taxonomy || '';

  useEffect(() => {
    if (group && defaultSlug && !selected) {
      select({ slug: defaultSlug, taxonomy: defaultTaxonomy });
    }
  }, [group, defaultSlug, defaultTaxonomy, selected, select]);

  if (!data) {
    return null;
  }

  const { heading, subheading } = data;
  const activeSlug = selected?.slug || defaultSlug;

  return (
    <section className="category-tabs">
      {heading && <h2 className="category-tabs__heading">{heading}</h2>}
      {subheading && <p className="category-tabs__subheading">{subheading}</p>}

      {tabs.length > 0 && (
        <div className="category-tabs__row">
          {tabs.map((tab, i) => {
            const term = tabTerms[i];
            const filters = Boolean(group && term);
            const isActive = filters ? term?.slug === activeSlug : Boolean(tab.isActive);
            const className = `category-tabs__tab${
              isActive ? ' category-tabs__tab--active' : ''
            }`;

            if (filters && term) {
              return (
                <button
                  key={i}
                  type="button"
                  className={className}
                  data-term={term.slug}
                  aria-pressed={isActive}
                  onClick={() => select(term)}
                >
                  <TabInner tab={tab} />
                </button>
              );
            }

            return tab.link?.url ? (
              <Link
                key={i}
                href={tab.link.url}
                target={tab.link.target || undefined}
                rel={tab.link.target === '_blank' ? 'noopener noreferrer' : undefined}
                className={className}
              >
                <TabInner tab={tab} />
              </Link>
            ) : (
              <span key={i} className={className}>
                <TabInner tab={tab} />
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}

CategoryTabs.displayName = 'AcfCategoryTabs';

CategoryTabs.fragments = fragments;
