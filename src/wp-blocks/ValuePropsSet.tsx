import type { CSSProperties } from 'react';
import { gql, useQuery } from '@apollo/client';
import { getClient, getBrowserClient } from '@/lib/apollo-client';

/**
 * Backend-managed value props row (ACF block `acf/value-props-set`).
 * Migrated from the Shopify `value-props-set` section: a centered flex row of
 * small icons with a title underneath, each with its own mobile/desktop pixel
 * width. The block itself carries no fields — content is global, from the
 * "Site Settings" ACF options page (mellow-fellow-site-settings.php,
 * `siteSettings.valuePropsSet`), so it is kept as its own query like
 * LandingPageIconRow: if siteSettings is ever unavailable, that shouldn't
 * take the rest of the page down with it.
 */
const GET_VALUE_PROPS = gql`
  query GetValuePropsSet {
    siteSettings {
      valuePropsSet {
        valueProps {
          title
          widthMobile
          widthDesktop
          image {
            node {
              altText
              sourceUrl
              mediaDetails {
                width
                height
              }
            }
          }
        }
      }
    }
  }
`;

interface ValueProp {
  title?: string | null;
  widthMobile?: number | null;
  widthDesktop?: number | null;
  image?: {
    node?: {
      altText?: string | null;
      sourceUrl?: string | null;
      mediaDetails?: { width?: number | null; height?: number | null } | null;
    } | null;
  } | null;
}

export default function ValuePropsSet() {
  const client = typeof window !== 'undefined' ? getBrowserClient() : getClient();
  const { data } = useQuery(GET_VALUE_PROPS, { client });

  const items: ValueProp[] = data?.siteSettings?.valuePropsSet?.valueProps ?? [];

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="value-props-set">
      <div className="container value-props-set__box">
        {items.map((item, index) => {
          const media = item.image?.node;

          return (
            <div key={index} className="value-prop">
              {media?.sourceUrl && (
                <div className="value-prop__img-box">
                  <img
                    src={media.sourceUrl}
                    width={media.mediaDetails?.width ?? undefined}
                    height={media.mediaDetails?.height ?? undefined}
                    alt={item.title ? '' : media.altText || 'Value prop icon'}
                    style={
                      {
                        '--width-mobile': `${item.widthMobile ?? 20}px`,
                        '--width-desktop': `${item.widthDesktop ?? 25}px`,
                      } as CSSProperties
                    }
                  />
                </div>
              )}

              {item.title && <h4 className="value-prop__title">{item.title}</h4>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

ValuePropsSet.displayName = 'AcfValuePropsSet';

// The block has no ACF fields of its own (content is global, fetched above),
// so the fragment only asserts the typename — enough for templates to spread
// it uniformly once the `acf/value-props-set` block exists in the WP schema.
ValuePropsSet.fragments = {
  key: `AcfValuePropsSetFragment`,
  entry: gql`
    fragment AcfValuePropsSetFragment on AcfValuePropsSet {
      __typename
    }
  `,
};
