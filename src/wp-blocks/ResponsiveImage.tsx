import type { CSSProperties } from 'react';
import { fragments } from './ResponsiveImage.fragments';

/**
 * Backend-managed responsive image (ACF block `acf/responsive-image`).
 * Migrated from the Shopify `responsive-banner` theme block: a <picture> with
 * separate mobile/tablet/desktop slots, optional link, border radius (passed
 * to the existing .responsive-banner__image styles via the --border-radius
 * CSS variable) and full/contained width. Shopify eager-loaded the image when
 * the section sat in the top two of the page; position isn't knowable here,
 * so that became the editor-controlled `eagerLoad` toggle.
 */

interface MediaItem {
  altText?: string | null;
  sourceUrl?: string | null;
  mediaDetails?: { width?: number | null; height?: number | null } | null;
}

interface ImageSlot {
  node?: MediaItem | null;
}

interface ResponsiveImageProps {
  responsiveImage?: {
    mobileImage?: ImageSlot | null;
    tabletImage?: ImageSlot | null;
    desktopImage?: ImageSlot | null;
    link?: { url?: string | null; title?: string | null; target?: string | null } | null;
    borderRadius?: number | null;
    width?: string | null;
    eagerLoad?: boolean | null;
  } | null;
}

export default function ResponsiveImage(props: ResponsiveImageProps) {
  const data = props.responsiveImage;
  const { mobileImage, tabletImage, desktopImage } = data ?? {};

  // Same fallback precedence as the Liquid block's `main_img`.
  const fallback = mobileImage?.node?.sourceUrl
    ? mobileImage
    : tabletImage?.node?.sourceUrl
      ? tabletImage
      : desktopImage;
  if (!fallback?.node?.sourceUrl) {
    return null;
  }

  const picture = (
    <picture>
      {desktopImage?.node?.sourceUrl && (
        <source
          media="(width >= 1024px)"
          srcSet={desktopImage.node.sourceUrl}
          width={desktopImage.node.mediaDetails?.width ?? undefined}
          height={desktopImage.node.mediaDetails?.height ?? undefined}
        />
      )}
      {tabletImage?.node?.sourceUrl && (
        <source
          media="(width >= 768px)"
          srcSet={tabletImage.node.sourceUrl}
          width={tabletImage.node.mediaDetails?.width ?? undefined}
          height={tabletImage.node.mediaDetails?.height ?? undefined}
        />
      )}
      {mobileImage?.node?.sourceUrl && (
        <source
          media="(width < 768px)"
          srcSet={mobileImage.node.sourceUrl}
          width={mobileImage.node.mediaDetails?.width ?? undefined}
          height={mobileImage.node.mediaDetails?.height ?? undefined}
        />
      )}
      <img
        className="responsive-banner__image"
        src={fallback.node.sourceUrl}
        alt={fallback.node.altText || ''}
        width={fallback.node.mediaDetails?.width ?? undefined}
        height={fallback.node.mediaDetails?.height ?? undefined}
        loading={data?.eagerLoad ? 'eager' : 'lazy'}
      />
    </picture>
  );

  const url = data?.link?.url;
  const contained = data?.width === 'contained';

  return (
    <section className="responsive-banner" style={{ '--border-radius': `${data?.borderRadius ?? 0}px` } as CSSProperties}>
      <div className={`responsive-banner__wrapper${contained ? ' container' : ''}`}>
        {url ? (
          <a
            href={url}
            target={data?.link?.target || undefined}
            rel={data?.link?.target === '_blank' ? 'noopener noreferrer' : undefined}
          >
            {picture}
          </a>
        ) : (
          picture
        )}
      </div>
    </section>
  );
}

ResponsiveImage.displayName = 'AcfResponsiveImage';

ResponsiveImage.fragments = fragments;
