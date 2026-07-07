import { useEffect, useRef, useState } from 'react';
import { gql } from '@apollo/client';
import Image from 'next/image';
import Link from 'next/link';

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

  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (typeof IntersectionObserver === 'undefined' || prefersReduced) {
      setVisible(true);
      return;
    }

    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!blendCallout) {
    return null;
  }

  const { heading, description, image, learnLink, shopLink } = blendCallout;
  const media = image?.node;

  return (
    <section
      ref={sectionRef}
      className={`blend-callout${visible ? ' is-visible' : ''}`}
    >
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
