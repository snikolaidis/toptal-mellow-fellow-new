import { gql } from '@apollo/client';

/**
 * Backend-managed collection links (ACF block `acf/collection-links`). Replaces
 * the hardcoded CollectionLinks: the editor adds an ordered list of collections,
 * each optionally overriding the displayed label. Each link uses the selected
 * collection's thumbnail image, name (or override) and URL.
 */

interface CollectionNode {
  name?: string | null;
  uri?: string | null;
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
    links?: CollectionLinkRow[] | null;
  } | null;
}

function resolveCollection(row: CollectionLinkRow): CollectionNode | null {
  return row.collection?.nodes?.[0] ?? row.collection?.node ?? null;
}

export default function CollectionLinks(props: CollectionLinksProps) {
  const rows = props.collectionLinks?.links ?? [];
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="collection-links">
      <div className="collection-links__track">
        <div className="collection-links__box">
          {rows.map((row, i) => {
            const collection = resolveCollection(row);
            if (!collection?.uri) return null;

            const title = row.titleOverride || collection.name || '';
            const thumb = collection.collectionFields?.thumbnailImage?.node;

            return (
              <div className="collection-links__link" key={i}>
                <a href={collection.uri}>
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
          })}
        </div>
      </div>
    </div>
  );
}

CollectionLinks.displayName = 'AcfCollectionLinks';

CollectionLinks.fragments = {
  key: `AcfCollectionLinksFragment`,
  entry: gql`
    fragment AcfCollectionLinksFragment on AcfCollectionLinks {
      collectionLinks {
        links {
          titleOverride
          collection {
            nodes {
              __typename
              ... on Collection {
                name
                uri
                collectionFields {
                  thumbnailImage {
                    node {
                      sourceUrl
                      altText
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `,
};
