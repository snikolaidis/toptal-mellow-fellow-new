import { gql } from '@apollo/client';
import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCollectionFilter } from '@/context/CollectionFilterContext';

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
  link?: { url?: string | null; title?: string | null; target?: string | null } | null;
  isActive?: boolean | null;
}

interface CategoryTabsProps {
  categoryTabs?: {
    heading?: string | null;
    subheading?: string | null;
    filterGroup?: string | null;
    tabs?: Tab[] | null;
  } | null;
}

function tabTerm(tab: Tab) {
  const node = tab.collection?.nodes?.[0] ?? tab.collection?.node ?? null;
  if (!node?.slug) return null;
  return { slug: node.slug, taxonomy: (node.__typename || 'Collection').toLowerCase() };
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
  const tabs = data?.tabs ?? [];
  const defaultTerm = tabTerm(tabs.find((t) => t.isActive) || tabs.find((t) => tabTerm(t)) || {});
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
            const term = tabTerm(tab);
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

CategoryTabs.fragments = {
  key: `AcfCategoryTabsFragment`,
  entry: gql`
    fragment AcfCategoryTabsFragment on AcfCategoryTabs {
      categoryTabs {
        heading
        subheading
        filterGroup
        tabs {
          label
          isActive
          collection {
            nodes {
              __typename
              ... on Collection {
                databaseId
                name
                slug
              }
            }
          }
          link {
            url
            title
            target
          }
          icon {
            node {
              id
              altText
              sourceUrl
            }
          }
        }
      }
    }
  `,
};
