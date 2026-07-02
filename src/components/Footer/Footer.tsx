import Link from 'next/link';
import { gql, useQuery } from '@apollo/client';
import { getClient, getBrowserClient } from '@/lib/apollo-client';
import {
  EmailIcon,
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
  TwitterIcon,
  YouTubeIcon,
} from '@/components/icons';

const GET_FOOTER_MENU = gql`
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

// Social URLs come from the "Site Settings" ACF options page
// (mellow-fellow-site-settings.php mu-plugin). Kept as a separate query from
// GET_FOOTER_MENU: if the mu-plugin isn't deployed yet, siteSettings is an
// unknown field and GraphQL rejects the whole document — a combined query
// would take the footer menu down with it.
const GET_SOCIAL_LINKS = gql`
  query GetSocialLinks {
    siteSettings {
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

// Resolve a WordPress menu item URL to an app-appropriate href. WP items mix
// relative paths (/contact-us/), full frontend-domain URLs (the headless app on
// *.up.railway.app) and true external links (e.g. affiliate URLs). Internal
// targets get client-side Next navigation; everything else opens externally.
function footerHref(uri: string): { href: string; external: boolean } {
  if (!uri) return { href: '#', external: false };
  if (uri.startsWith('/')) return { href: uri, external: false };
  try {
    const u = new URL(uri);
    const wpHost = new URL(process.env.NEXT_PUBLIC_WORDPRESS_URL || '').host;
    const runtimeHost = typeof window !== 'undefined' ? window.location.host : '';
    const isInternal =
      u.host === wpHost ||
      (runtimeHost && u.host === runtimeHost) ||
      u.host.endsWith('.up.railway.app');
    return isInternal
      ? { href: u.pathname + u.search + u.hash, external: false }
      : { href: uri, external: true };
  } catch {
    return { href: uri, external: true };
  }
}

export default function Footer() {
  const client = typeof window !== 'undefined' ? getBrowserClient() : getClient();
  const { data } = useQuery(GET_FOOTER_MENU, { client });
  const footerMenu = data?.menus?.nodes?.[0];
  const footerItems: FooterMenuItem[] = footerMenu?.menuItems?.nodes ?? [];

  const { data: socialData } = useQuery(GET_SOCIAL_LINKS, {
    client,
    errorPolicy: 'ignore',
  });
  const socialLinks: SocialLinks | undefined =
    socialData?.siteSettings?.socialLinks ?? undefined;

  return (
    <>
      {/* Newsletter */}
      <section className="footer-newsletter section">
        <div className="container">
          <p><span>Get 15% off your first purchase </span>when you join the Mellow Fam!</p>
          <form className="newsletter-form">
            <input
              type="email"
              placeholder="your@email.com"
              className="newsletter-input"
            />
            <button type="submit" className="newsletter-btn">
              Subscribe
            </button>
          </form>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            {/* Backend-managed menu (WP "Footer 1" location) */}
            <div className="link-section">
              <h3 className="section-title">{footerMenu?.name ?? 'Shop'}</h3>
              <ul className="link-list">
                {footerItems.map((item) => {
                  const { href, external } = footerHref(item.uri);
                  return (
                    <li key={item.id}>
                      {external ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link"
                        >
                          {item.label}
                        </a>
                      ) : (
                        <Link href={href} className="link">
                          {item.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Brand */}
            <div className="brand-section">
              <h4 className="section-title">Get in touch</h4>
              <a href="/pages/contact-us">
                <span className="icon-text">
                  <span className="icon">
                    <EmailIcon />
                  </span>
                  <span>Email us</span>
                </span>
              </a>
              <div className="social-links">
                {SOCIAL_NETWORKS.map(({ key, label, Icon }) => {
                  const url = socialLinks?.[key];
                  if (!url) return null;
                  return (
                    <a
                      key={key}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="social-link"
                      aria-label={label}
                    >
                      <span className="icon">
                        <Icon />
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Info Links */}
            <div className="link-section">
              <h4 className="section-title">Information</h4>
              <ul className="link-list">
                <li><Link href="/account" className="link">My Account</Link></li>
                <li><Link href="#" className="link">Shipping & Returns</Link></li>
                <li><Link href="#" className="link">FAQ</Link></li>
                <li><Link href="#" className="link">Contact</Link></li>
              </ul>
            </div>
          </div>
        </div>
      </footer>

      {/* Footer Bottom */}
      <div className="footer-bottom">
        <p className="copyright">
          &copy; {new Date().getFullYear()} Twenty One Cannabis. All rights reserved. 21+ only.
        </p>
        <div className="legal-links">
          <a href="#" className="legal-link">Privacy</a>
          <a href="#" className="legal-link">Terms</a>
        </div>
      </div>
    </>
  );
}
