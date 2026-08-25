import Link from 'next/link';
import { gql, useQuery } from '@apollo/client';
import {
  AmexIcon,
  DiscoverIcon,
  EmailIcon,
  FacebookIcon,
  InstagramIcon,
  JcbIcon,
  MastercardIcon,
  TikTokIcon,
  TwitterIcon,
  VisaIcon,
  YouTubeIcon,
} from '@/components/icons';

export const GET_FOOTER_MENU = gql`
  query GetFooterMenu {
    menus(where: { location: FOOTER_1 }, first: 1) {
      nodes {
        name
        menuItems(where: { parentDatabaseId: 0 }, first: 100) {
          nodes {
            id
            label
            uri
            target
          }
        }
      }
    }
  }
`;

export const GET_FOOTER_MENU_2 = gql`
  query GetFooterMenu2 {
    menus(where: { location: FOOTER_2 }, first: 1) {
      nodes {
        name
        menuItems(where: { parentDatabaseId: 0 }, first: 100) {
          nodes {
            id
            label
            uri
            target
          }
        }
      }
    }
  }
`;

// Social URLs come from the "Site Settings" ACF options page
// (mellow-fellow-site-settings.php mu-plugin). Kept as a separate query from
// GET_FOOTER_MENU: if the mu-plugin isn't deployed yet, siteSettings is an
// unknown field and GraphQL rejects the whole document — a combined query
// would take the footer menu down with it.
export const GET_SOCIAL_LINKS = gql`
  query GetSocialLinks {
    siteSettings {
      # See GET_MEGA_MENU_FEATURED: both write RootQuery.siteSettings, and
      # without an id the later write replaces this one instead of merging.
      id
      socialLinks {
        instagramUrl
        twitterUrl
        facebookUrl
        tiktokUrl
        youtubeUrl
      }
    }
  }
`;

interface SocialLinks {
  instagramUrl?: string | null;
  twitterUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
  youtubeUrl?: string | null;
}

const SOCIAL_NETWORKS: Array<{
  key: keyof SocialLinks;
  label: string;
  Icon: () => React.JSX.Element;
}> = [
  { key: 'instagramUrl', label: 'Instagram', Icon: InstagramIcon },
  { key: 'twitterUrl', label: 'Twitter', Icon: TwitterIcon },
  { key: 'facebookUrl', label: 'Facebook', Icon: FacebookIcon },
  { key: 'tiktokUrl', label: 'TikTok', Icon: TikTokIcon },
  { key: 'youtubeUrl', label: 'YouTube', Icon: YouTubeIcon },
];

interface FooterMenuItem {
  id: string;
  label: string;
  uri: string;
  target?: string | null;
}

const PAYMENT_MARKS: Array<{
  label: string;
  Icon: () => React.JSX.Element;
}> = [
  { label: 'Visa', Icon: VisaIcon },
  { label: 'Mastercard', Icon: MastercardIcon },
  { label: 'American Express', Icon: AmexIcon },
  { label: 'Discover', Icon: DiscoverIcon },
  { label: 'JCB', Icon: JcbIcon },
];

// Resolve a WordPress menu item URL to an app-appropriate href. WP items mix
// relative paths (/contact-us/), full frontend-domain URLs (the headless app)
// and true external links (e.g. affiliate URLs). Internal targets get
// client-side Next navigation; everything else opens externally.
function remapInternalPath(path: string): string {
  const clean = path.replace(/\/$/, '') || '/';
  if (clean === '/my-account') return '/account';
  return path;
}

function footerHref(uri: string): { href: string; external: boolean } {
  if (!uri) return { href: '#', external: false };
  if (uri.startsWith('/')) return { href: remapInternalPath(uri), external: false };
  try {
    const u = new URL(uri);
    const wpHost = new URL(process.env.NEXT_PUBLIC_WORDPRESS_URL || '').host;
    const runtimeHost = typeof window !== 'undefined' ? window.location.host : '';
    const isInternal =
      u.host === wpHost ||
      (runtimeHost && u.host === runtimeHost) ||
      u.host.endsWith('.wpengine.com') ||
      u.host.endsWith('.wpenginepowered.com');
    return isInternal
      ? { href: remapInternalPath(u.pathname) + u.search + u.hash, external: false }
      : { href: uri, external: true };
  } catch {
    return { href: uri, external: true };
  }
}

function MenuColumn({
  heading,
  items,
  modifier,
}: {
  heading: string;
  items: FooterMenuItem[];
  modifier: string;
}) {
  return (
    <div className={`footer-col ${modifier}`}>
      <h3 className="footer-col__heading">{heading}</h3>
      <ul className="footer-col__list">
        {items.map((item) => {
          const { href, external } = footerHref(item.uri);
          return (
            <li key={item.id}>
              {external ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-col__link"
                >
                  {item.label}
                </a>
              ) : (
                <Link href={href} className="footer-col__link">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Footer() {
  const { data } = useQuery(GET_FOOTER_MENU);
  const footerMenu = data?.menus?.nodes?.[0];
  const footerItems: FooterMenuItem[] = footerMenu?.menuItems?.nodes ?? [];

  const { data: data2 } = useQuery(GET_FOOTER_MENU_2);
  const footerMenu2 = data2?.menus?.nodes?.[0];
  const footerItems2: FooterMenuItem[] = footerMenu2?.menuItems?.nodes ?? [];

  const { data: socialData } = useQuery(GET_SOCIAL_LINKS, {
    errorPolicy: 'ignore',
  });
  const socialLinks: SocialLinks | undefined =
    socialData?.siteSettings?.socialLinks ?? undefined;

  return (
    <>
      {/* Signup band */}
      <section className="footer-signup">
        <p className="footer-signup__heading">
          Get <span className="footer-signup__accent">15% off</span> your first
          purchase when you sign up!!
        </p>
        <form className="footer-signup__form">
          <div className="footer-signup__controls">
            <input
              type="email"
              placeholder="Enter your email"
              aria-label="Email address"
              className="footer-signup__input"
            />
            <button type="submit" className="footer-signup__button">
              Join now
            </button>
          </div>
          <p className="footer-signup__consent">
            By joining you agree to receive marketing emails. Unsubscribe
            anytime.
          </p>
        </form>
      </section>

      <footer className="footer">
        <div className="footer__inner">
          <div className="footer-content">
            {/* Stay Mellow (WP "Footer 1" location) */}
            <MenuColumn
              heading={footerMenu?.name ?? 'Stay Mellow'}
              items={footerItems}
              modifier="footer-col--menu-1"
            />

            <div className="footer-col footer-col--payment">
              <h3 className="footer-col__heading">We accept</h3>
              <ul className="footer-col__accept">
                {PAYMENT_MARKS.map(({ label, Icon }) => (
                  <li key={label}>
                    <Icon />
                    <span className="is-sr-only">{label}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal (WP "Footer 2" location) */}
            <MenuColumn
              heading={footerMenu2?.name ?? 'Legal'}
              items={footerItems2}
              modifier="footer-col--menu-2"
            />

            <div className="footer-col footer-col--contact">
              <div>
                <h3 className="footer-col__heading">Get in touch</h3>
                <Link href="/pages/contact-us" className="footer-col__email">
                  <EmailIcon />
                  <span>Email us</span>
                </Link>
              </div>

              <div>
                <h4 className="footer-social__label">Follow us</h4>
                <ul className="footer-social__list">
                  {SOCIAL_NETWORKS.map(({ key, label, Icon }) => {
                    const url = socialLinks?.[key];
                    if (!url) return null;
                    return (
                      <li key={key}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="footer-social__link"
                          aria-label={label}
                        >
                          <Icon />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>

          <div className="footer-copyright">
            <p>&copy; {new Date().getFullYear()} Mellow Fellow</p>
          </div>
        </div>
      </footer>

      {/* Footer Bottom */}
      <div className="footer-bottom section">
        <p>
          <svg
            className="footer-bottom__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            THCA Disclaimer - This product is not available for shipment to the following states: Arkansas, Hawaii, Idaho, Kansas, Louisiana, Oklahoma, Oregon, Rhode Island, Utah
          </span>
        </p>
      </div>
    </>
  );
}
