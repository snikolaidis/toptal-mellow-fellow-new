import { fragments } from './CannabinoidCallout.fragments';
import Image from 'next/image';
import Link from 'next/link';
import RichText from '@/components/RichText';

interface MediaItem {
  altText?: string | null;
  sourceUrl?: string | null;
  mediaDetails?: { width?: number | null; height?: number | null } | null;
}

interface LinkField {
  url?: string | null;
  title?: string | null;
  target?: string | null;
}

interface CannabinoidCalloutProps {
  cannabinoidCallout?: {
    name?: string | null;
    description?: string | null;
    icon?: { node?: MediaItem | null } | null;
    learnLink?: LinkField | null;
    shopLink?: LinkField | null;
  } | null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function CalloutLink({ link, fallback }: { link?: LinkField | null; fallback: string }) {
  if (!link?.url) return null;

  return (
    <Link
      href={link.url}
      target={link.target || undefined}
      rel={link.target === '_blank' ? 'noopener noreferrer' : undefined}
      className="cannabinoid-callout__cta"
    >
      {link.title || fallback}
    </Link>
  );
}

export default function CannabinoidCallout(props: CannabinoidCalloutProps) {
  const { cannabinoidCallout } = props;

  if (!cannabinoidCallout) {
    return null;
  }

  const { name, description, icon, learnLink, shopLink } = cannabinoidCallout;
  const media = icon?.node;

  const slug = name ? slugify(name) : '';
  const anchorId = slug ? `learn-about-${slug}` : undefined;

  return (
    <section id={anchorId} className="cannabinoid-callout">
      {media?.sourceUrl && (
        <div className="cannabinoid-callout__media">
          <Image
            className="cannabinoid-callout__icon"
            src={media.sourceUrl}
            alt={media.altText || ''}
            width={media.mediaDetails?.width ?? 800}
            height={media.mediaDetails?.height ?? 600}
          />
        </div>
      )}

      <div className="cannabinoid-callout__content">
        {name && <h3 className="cannabinoid-callout__name">{name}</h3>}

        {description && (
          <RichText html={description} className="cannabinoid-callout__description" />
        )}

        <div className="cannabinoid-callout__actions">
          <CalloutLink link={learnLink} fallback="Learn more" />
          <CalloutLink link={shopLink} fallback="Shop" />
        </div>
      </div>
    </section>
  );
}

CannabinoidCallout.displayName = 'AcfCannabinoidCallout';

CannabinoidCallout.fragments = fragments;
