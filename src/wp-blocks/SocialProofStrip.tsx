import type { CSSProperties } from 'react';
import { gql } from '@apollo/client';
import Image from 'next/image';

interface MediaItem {
  id?: string;
  altText?: string | null;
  sourceUrl?: string | null;
  mediaDetails?: { width?: number | null; height?: number | null } | null;
}

interface Thumb {
  image?: { node?: MediaItem | null } | null;
  glowColor?: string | null;
}

interface SocialProofStripProps {
  socialProofStrip?: {
    heading?: string | null;
    subheading?: string | null;
    thumbs?: Thumb[] | null;
  } | null;
}

export default function SocialProofStrip(props: SocialProofStripProps) {
  const data = props.socialProofStrip;

  if (!data) {
    return null;
  }

  const { heading, subheading } = data;
  const thumbs = (data.thumbs ?? []).filter((t) => t.image?.node?.sourceUrl);

  return (
    <section className="social-proof-strip">
      {thumbs.length > 0 && (
        <div className="social-proof-strip__track">
          {thumbs.map((thumb, i) => {
            const image = thumb.image?.node;
            return (
              <div
                key={i}
                className="social-proof-strip__thumb"
                style={
                  thumb.glowColor
                    ? ({ '--glow-color': thumb.glowColor } as CSSProperties)
                    : undefined
                }
              >
                <span className="social-proof-strip__glow" aria-hidden="true" />
                <Image
                  className="social-proof-strip__image"
                  src={image!.sourceUrl!}
                  alt={image?.altText || ''}
                  width={image?.mediaDetails?.width ?? 200}
                  height={image?.mediaDetails?.height ?? 200}
                />
              </div>
            );
          })}
        </div>
      )}

      {heading && <h2 className="social-proof-strip__heading">{heading}</h2>}
      {subheading && <p className="social-proof-strip__subheading">{subheading}</p>}
    </section>
  );
}

SocialProofStrip.displayName = 'AcfSocialProofStrip';

SocialProofStrip.fragments = {
  key: `AcfSocialProofStripFragment`,
  entry: gql`
    fragment AcfSocialProofStripFragment on AcfSocialProofStrip {
      socialProofStrip {
        heading
        subheading
        thumbs {
          glowColor
          image {
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
        }
      }
    }
  `,
};
