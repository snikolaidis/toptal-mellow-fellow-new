import { gql, useQuery } from '@apollo/client';
import { getClient, getBrowserClient } from '@/lib/apollo-client';

// Global (not per-page) icons from the "Site Settings" ACF options page
// (mellow-fellow-site-settings.php mu-plugin). Kept as its own query, same
// reasoning as GET_SOCIAL_LINKS in Footer.tsx: if siteSettings is ever
// unavailable, that shouldn't take the rest of the landing page down with it.
const GET_LANDING_PAGE_ICON_ROW = gql`
  query GetLandingPageIconRow {
    siteSettings {
      # See GET_MEGA_MENU_FEATURED and GET_SOCIAL_LINKS: every query writing
      # RootQuery.siteSettings needs an id, or the later write replaces the
      # earlier one instead of merging.
      id
      landingPageIconRow {
        icons {
          label
          link {
            url
          }
          icon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
  }
`;

interface IconRowIcon {
  label?: string | null;
  link?: { url?: string | null } | null;
  icon?: { node?: { sourceUrl?: string | null; altText?: string | null } | null } | null;
}

export default function LandingPageIconRow() {
  const client = typeof window !== 'undefined' ? getBrowserClient() : getClient();
  const { data } = useQuery(GET_LANDING_PAGE_ICON_ROW, { client });

  const icons: IconRowIcon[] = data?.siteSettings?.landingPageIconRow?.icons ?? [];

  if (icons.length === 0) {
    return null;
  }

  return (
    <section className="landing-page-icon-row">
      <div className="container">
        <ul className="landing-page-icon-row__list">
          {icons.map((item, index) => {
            const content = (
              <>
                {item.icon?.node?.sourceUrl && (
                  <img
                    src={item.icon.node.sourceUrl}
                    alt={item.icon.node.altText || item.label || ''}
                    className="landing-page-icon-row__icon"
                  />
                )}
                {item.label && (
                  <span className="landing-page-icon-row__label">{item.label}</span>
                )}
              </>
            );

            return (
              <li key={index} className="landing-page-icon-row__item">
                {item.link?.url ? (
                  <a href={item.link.url} className="landing-page-icon-row__link">
                    {content}
                  </a>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

LandingPageIconRow.displayName = 'LandingPageIconRow';
