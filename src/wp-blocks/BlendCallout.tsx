import { gql } from '@apollo/client';
import Image from 'next/image';
import Link from 'next/link';

/**
 * Renders the `acf/blend-callout` ACF block on the frontend: a blend art image,
 * heading, a multi-paragraph WYSIWYG description, and two CTA links (learn about
 * blends + shop the blend). Mirrors the HighlightsGroup convention for rendering
 * an ACF rich-text field as HTML.
 *
 * Data shape confirmed via GraphiQL against the live schema:
 * AcfBlendCallout.blendCallout { heading, description, image { node {...} }, learnLink {...}, shopLink {...} }
 */
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

interface BlendCalloutProps {
  blendCallout?: {
    heading?: string | null;
    description?: string | null;
    image?: { node?: MediaItem | null } | null;
    learnLink?: LinkField | null;
    shopLink?: LinkField | null;
  } | null;
}

function CalloutLink({ link, fallback }: { link?: LinkField | null; fallback: string }) {
  if (!link?.url) return null;

  return (
    <Link
      href={link.url}
      target={link.target || undefined}
      rel={link.target === '_blank' ? 'noopener noreferrer' : undefined}
      className="blend-callout__cta"
    >
      {link.title || fallback}
    </Link>
  );
}

export default function BlendCallout(props: BlendCalloutProps) {
  const { blendCallout } = props;

  if (!blendCallout) {
    return null;
  }

  const { heading, description, image, learnLink, shopLink } = blendCallout;
  const media = image?.node;

  return (
    <section className="blend-callout">
      {media?.sourceUrl && (
        <div className="blend-callout__media">
          <Image
            className="blend-callout__image"
            src={media.sourceUrl}
            alt={media.altText || ''}
            width={media.mediaDetails?.width ?? 800}
            height={media.mediaDetails?.height ?? 600}
          />
        </div>
      )}

      <div className="blend-callout__content">
        {heading && <h3 className="blend-callout__heading">{heading}</h3>}

        {description && (
          // Description is a WYSIWYG field authored in WP: multi-paragraph,
          // block-level HTML — render it as HTML in a <div> (not a <p>, which
          // would nest block elements inside a paragraph and be invalid).
          <div
            className="blend-callout__description"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        )}

        <div className="blend-callout__actions">
          <CalloutLink link={learnLink} fallback="More about our blends" />
          <CalloutLink link={shopLink} fallback="Shop" />
        </div>
      </div>
    </section>
  );
}

BlendCallout.displayName = 'AcfBlendCallout';

BlendCallout.fragments = {
  key: `AcfBlendCalloutFragment`,
  entry: gql`
    fragment AcfBlendCalloutFragment on AcfBlendCallout {
      blendCallout {
        heading
        description
        image {
          node {
            sourceUrl
            altText
            mediaDetails {
              width
              height
            }
          }
        }
        learnLink {
          url
          title
          target
        }
        shopLink {
          url
          title
          target
        }
      }
    }
  `,
};
