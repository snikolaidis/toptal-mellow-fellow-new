import { fragments } from './CollectionLinks.fragments';

/**
 * Backend-managed collection links (ACF block `acf/collection-links`). Replaces
 * the hardcoded CollectionLinks: the editor adds an ordered list of collections,
 * each optionally overriding the displayed label. Each link uses the selected
 * collection's thumbnail image, name (or override) and URL.
 */

interface CollectionNode {
  name?: string | null;
  uri?: string | null;
  slug?: string | null;
  collectionFields?: {
    thumbnailImage?: {
      node?: { sourceUrl?: string | null; altText?: string | null } | null;
    } | null;
  } | null;
}

interface CollectionLinkRow {
  titleOverride?: string | null;
  // ACF taxonomy field exposes as a connection; read defensively in case the
  // single-select resolves as `{ node }` rather than `{ nodes: [...] }`.
  collection?: {
    nodes?: CollectionNode[] | null;
    node?: CollectionNode | null;
  } | null;
}

interface CollectionLinksProps {
  collectionLinks?: {
    // sectionHeading/layout exist in the schema only once the updated
    // mu-plugin field group is deployed; render defensively until then.
    sectionHeading?: string | null;
    layout?: string | null;
    links?: CollectionLinkRow[] | null;
  } | null;
}

function resolveCollection(row: CollectionLinkRow): CollectionNode | null {
  return row.collection?.nodes?.[0] ?? row.collection?.node ?? null;
}

// The Collection taxonomy's rewrite base isn't guaranteed to be /collections/;
// normalize so cards always land on the rich /collections/[slug] page.
function collectionHref(collection: CollectionNode): string | null {
  if (collection.uri?.startsWith('/collections/')) return collection.uri;
  if (collection.slug) return `/collections/${collection.slug}`;
  return collection.uri ?? null;
}

export default function CollectionLinks(props: CollectionLinksProps) {
  const rows = props.collectionLinks?.links ?? [];
  if (rows.length === 0) {
    return null;
  }

  const heading = props.collectionLinks?.sectionHeading || null;
  const layout = props.collectionLinks?.layout === 'grid' ? 'grid' : 'track';

  const links = rows.map((row, i) => {
    const collection = resolveCollection(row);
    if (!collection) return null;
    const href = collectionHref(collection);
    if (!href) return null;

    const title = row.titleOverride || collection.name || '';
    const thumb = collection.collectionFields?.thumbnailImage?.node;

    return (
      <div className="collection-links__link" key={i}>
        <a href={href}>
          <div className="collection-links__link-image">
            {thumb?.sourceUrl && (
              <img
                src={thumb.sourceUrl}
                alt={thumb.altText || ''}
                width="200"
                height="200"
              />
            )}
          </div>
          <span className="collection-links__link-title">{title}</span>
        </a>
      </div>
    );
  });

  return (
    <div className={`collection-links collection-links--${layout}`}>
      {heading && <h2 className="collection-links__heading">{heading}</h2>}
      {layout === 'grid' ? (
        <div className="collection-links__grid">{links}</div>
      ) : (
        <div className="collection-links__track">
          <div className="collection-links__box">{links}</div>
        </div>
      )}
    </div>
  );
}

CollectionLinks.displayName = 'AcfCollectionLinks';

CollectionLinks.fragments = fragments;
