import { gql } from '@apollo/client';
import Image from 'next/image';
import Link from 'next/link';

/**
 * Renders the `acf/hero-section` ACF block on the frontend.
 *
 * Data shape confirmed via GraphiQL against the live schema:
 * AcfHeroSection.heroSection { heading, subheading, backgroundImage { node {...} }, ctaButton {...} }
 */
interface MediaItem {
  id?: string;
  altText?: string | null;
  sourceUrl?: string | null;
  mediaDetails?: { width?: number | null; height?: number | null } | null;
}

interface HeroSectionProps {
  heroSection?: {
    heading?: string | null;
    subheading?: string | null;
    backgroundImage?: { node?: MediaItem | null } | null;
    ctaButton?: { url?: string | null; title?: string | null; target?: string | null } | null;
  } | null;
}

export default function HeroSection(props: HeroSectionProps) {
  const { heroSection } = props;

  if (!heroSection) {
    return null;
  }

  const { heading, subheading, backgroundImage, ctaButton } = heroSection;
  const image = backgroundImage?.node;

  return (
    <section className="hero-section">
      {image?.sourceUrl && (
        <div className="hero-section__media">
          <Image
            src={image.sourceUrl}
            alt={image.altText || ''}
            fill
            priority
            sizes="100vw"
            style={{ objectFit: 'cover' }}
          />
        </div>
      )}

      <div className="hero-section__content">
        {heading && <h1 className="hero-section__heading">{heading}</h1>}
        {subheading && (
          <p className="hero-section__subheading">{subheading}</p>
        )}

        {ctaButton?.url && (
          <Link
            href={ctaButton.url}
            target={ctaButton.target || undefined}
            rel={ctaButton.target === '_blank' ? 'noopener noreferrer' : undefined}
            className="hero-section__cta"
          >
            {ctaButton.title || 'Learn more'}
          </Link>
        )}
      </div>
    </section>
  );
}

HeroSection.displayName = 'AcfHeroSection';

HeroSection.fragments = {
  key: `AcfHeroSectionFragment`,
  entry: gql`
    fragment AcfHeroSectionFragment on AcfHeroSection {
      heroSection {
        heading
        subheading
        backgroundImage {
          node {
            id
            altText
            sourceUrl
            mediaDetails {
              width
              height
            }
          }
        }
        ctaButton {
          url
          title
          target
        }
      }
    }
  `,
};
