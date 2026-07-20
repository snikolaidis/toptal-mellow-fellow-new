import { gql } from '@apollo/client';

/**
 * Backend-managed highlights group (ACF block `acf/highlights-group`).
 * Migrated from the Shopify `highlights-group` section: a boxed section with
 * heading + description and up to 3 highlight cards, each with an image,
 * big/small overlay text in per-text colors and an optional link. Reuses the
 * markup and classes of the (since removed) hardcoded HighlightsGroup
 * component (styles in src/styles/components/_highlights-group.scss).
 */

interface MediaItem {
  altText?: string | null;
  sourceUrl?: string | null;
}

interface Highlight {
  image?: { node?: MediaItem | null } | null;
  link?: { url?: string | null; title?: string | null; target?: string | null } | null;
  bigText?: string | null;
  bigColor?: string | null;
  smallText?: string | null;
  smallColor?: string | null;
}

interface HighlightsGroupProps {
  highlightsGroup?: {
    heading?: string | null;
    description?: string | null;
    highlights?: Highlight[] | null;
  } | null;
}

function HighlightCard({ highlight }: { highlight: Highlight }) {
  const media = highlight.image?.node;
  if (!media?.sourceUrl) return null;

  return (
    <a
      className="highlights-group__item"
      href={highlight.link?.url || undefined}
      target={highlight.link?.target || undefined}
      rel={highlight.link?.target === '_blank' ? 'noopener noreferrer' : undefined}
    >
      <img
        className="highlights-group__item-image"
        src={media.sourceUrl}
        alt={media.altText || `${highlight.bigText || ''} ${highlight.smallText || ''}`.trim()}
        width={800}
        loading="lazy"
      />

      <h4 className="highlights-group__item-title">
        {highlight.bigText && (
          <span
            className="highlights-group__big-text"
            style={highlight.bigColor ? { color: highlight.bigColor } : undefined}
          >
            {highlight.bigText}
          </span>
        )}
        {highlight.smallText && (
          <span
            className="highlights-group__small-text"
            style={highlight.smallColor ? { color: highlight.smallColor } : undefined}
          >
            {highlight.smallText}
          </span>
        )}
      </h4>
    </a>
  );
}

export default function HighlightsGroup(props: HighlightsGroupProps) {
  const heading = props.highlightsGroup?.heading;
  const description = props.highlightsGroup?.description;
  const highlights = props.highlightsGroup?.highlights ?? [];
  if (highlights.length === 0) {
    return null;
  }

  return (
    <section className="highlights-group">
      <div className="container">
        <div className="highlights-group__box">
          <div className="highlights-group__header">
            {heading && <h3 className="highlights-group__title">{heading}</h3>}
            {description && (
              // Description is an inline-richtext field (may contain <strong>,
              // <em>, etc.), authored in WP — render it as HTML like the
              // original Shopify section did.
              <p
                className="highlights-group__description"
                dangerouslySetInnerHTML={{ __html: description }}
              />
            )}
          </div>

          <div className="highlights-group__track">
            {highlights.map((highlight, i) => (
              <HighlightCard key={i} highlight={highlight} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

HighlightsGroup.displayName = 'AcfHighlightsGroup';

HighlightsGroup.fragments = {
  key: `AcfHighlightsGroupFragment`,
  entry: gql`
    fragment AcfHighlightsGroupFragment on AcfHighlightsGroup {
      highlightsGroup {
        heading
        description
        highlights {
          bigText
          bigColor
          smallText
          smallColor
          link {
            url
            title
            target
          }
          image {
            node {
              altText
              sourceUrl
            }
          }
        }
      }
    }
  `,
};
