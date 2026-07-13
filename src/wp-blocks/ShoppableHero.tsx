import { gql } from '@apollo/client';
import { useCart } from '@/context/CartContext';

/**
 * Backend-managed shoppable hero (ACF block `acf/shoppable-hero`). Migrated
 * from the Shopify `shoppable-hero` section: a responsive hero banner (reuses
 * the .responsive-banner markup/classes, like SaleCountdownHero) with a
 * picked product, overlay title/description that fall back to the product's
 * own, left/right content alignment, and an Add to Cart button.
 *
 * Add to Cart mirrors Shopify's "first available variant" cart permalink:
 * simple products add directly; variable products add the parent with the
 * first in-stock variation as variationId. External/grouped products (no
 * direct add-to-cart) and out-of-stock products get no button.
 *
 * Shopify's `custom_section_id` setting was dropped — the block supports
 * WordPress's native HTML anchor instead.
 */

interface MediaItem {
  altText?: string | null;
  sourceUrl?: string | null;
  mediaDetails?: { width?: number | null; height?: number | null } | null;
}

interface ImageSlot {
  node?: MediaItem | null;
}

interface ProductVariation {
  databaseId?: number | null;
  stockStatus?: string | null;
}

interface ProductNode {
  __typename?: string;
  databaseId?: number | null;
  name?: string | null;
  description?: string | null;
  stockStatus?: string | null;
  variations?: { nodes?: ProductVariation[] | null } | null;
}

interface ShoppableHeroProps {
  shoppableHero?: {
    customTitle?: string | null;
    customDescription?: string | null;
    // WPGraphQL for ACF resolves `select` fields as a list regardless of the
    // field's single/multi-select setting — confirmed via introspection
    // (ShoppableHero.contentAlignment: [String]). This is a single-select
    // field; only the first entry is meaningful.
    contentAlignment?: (string | null)[] | null;
    product?: { nodes?: ProductNode[] | null } | null;
    mobileImage?: ImageSlot | null;
    tabletImage?: ImageSlot | null;
    desktopImage?: ImageSlot | null;
  } | null;
}

/**
 * Shopify adds `selected_or_first_available_variant`. The equivalent here:
 * simple products add by their own databaseId; variable products add the
 * parent plus the first in-stock variation. Returns null when the product
 * can't be added directly (external/grouped, out of stock, no variation).
 */
function getAddToCartInput(
  product: ProductNode
): { productId: number; quantity: number; variationId?: number } | null {
  if (!product.databaseId) return null;

  if (product.__typename === 'SimpleProduct') {
    if (product.stockStatus && product.stockStatus !== 'IN_STOCK') return null;
    return { productId: product.databaseId, quantity: 1 };
  }

  if (product.__typename === 'VariableProduct') {
    const variation = (product.variations?.nodes ?? []).find(
      (v) => v.databaseId && (!v.stockStatus || v.stockStatus === 'IN_STOCK')
    );
    if (!variation?.databaseId) return null;
    return { productId: product.databaseId, quantity: 1, variationId: variation.databaseId };
  }

  return null;
}

export default function ShoppableHero(props: ShoppableHeroProps) {
  const data = props.shoppableHero;
  const { addToCart, isMutating } = useCart();

  const { mobileImage, tabletImage, desktopImage } = data ?? {};
  const fallbackImage = mobileImage?.node?.sourceUrl
    ? mobileImage
    : tabletImage?.node?.sourceUrl
      ? tabletImage
      : desktopImage;

  const product = data?.product?.nodes?.[0] ?? null;
  const hasContent = !!product;

  if (!data || (!fallbackImage?.node?.sourceUrl && !hasContent)) {
    return null;
  }

  const title = data.customTitle || product?.name;
  const cartInput = product ? getAddToCartInput(product) : null;
  const alignment = data.contentAlignment?.[0] === 'right' ? 'right' : 'left';

  return (
    <section className="shoppable-hero">
      <div className="responsive-banner">
        <div className="responsive-banner__wrapper">
          <picture>
            {desktopImage?.node?.sourceUrl && (
              <source media="(width >= 1024px)" srcSet={desktopImage.node.sourceUrl} />
            )}
            {tabletImage?.node?.sourceUrl && (
              <source media="(width >= 768px)" srcSet={tabletImage.node.sourceUrl} />
            )}
            {mobileImage?.node?.sourceUrl && (
              <source media="(width < 768px)" srcSet={mobileImage.node.sourceUrl} />
            )}
            {fallbackImage?.node?.sourceUrl && (
              <img
                className="responsive-banner__image"
                src={fallbackImage.node.sourceUrl}
                alt={fallbackImage.node.altText || ''}
                width={fallbackImage.node.mediaDetails?.width ?? undefined}
                height={fallbackImage.node.mediaDetails?.height ?? undefined}
                loading="eager"
              />
            )}
          </picture>
        </div>
      </div>

      {hasContent && (
        <div className={`content align-${alignment}`}>
          {title && <h3 className="title">{title}</h3>}

          <div className="description">
            {data.customDescription ? (
              <p>{data.customDescription}</p>
            ) : (
              product?.description && (
                // Product descriptions are WP-authored HTML, rendered as HTML
                // just like Shopify's `{{ product.description }}`.
                <div dangerouslySetInnerHTML={{ __html: product.description }} />
              )
            )}

            {cartInput && (
              <button
                type="button"
                className="btn btn--full"
                disabled={isMutating}
                onClick={() => {
                  addToCart(cartInput).catch(() => {
                    // CartContext logs the error and manages its own state;
                    // swallowing here just prevents an unhandled rejection.
                  });
                }}
              >
                Add to cart
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

ShoppableHero.displayName = 'AcfShoppableHero';

ShoppableHero.fragments = {
  key: `AcfShoppableHeroFragment`,
  entry: gql`
    fragment AcfShoppableHeroFragment on AcfShoppableHero {
      shoppableHero {
        customTitle
        customDescription
        contentAlignment
        product {
          nodes {
            __typename
            ... on SimpleProduct {
              databaseId
              name
              description
              stockStatus
            }
            ... on VariableProduct {
              databaseId
              name
              description
              stockStatus
              variations(first: 20) {
                nodes {
                  databaseId
                  stockStatus
                }
              }
            }
            ... on ExternalProduct {
              databaseId
              name
              description
            }
            ... on GroupProduct {
              databaseId
              name
              description
            }
          }
        }
        mobileImage {
          node {
            altText
            sourceUrl
            mediaDetails {
              width
              height
            }
          }
        }
        tabletImage {
          node {
            altText
            sourceUrl
            mediaDetails {
              width
              height
            }
          }
        }
        desktopImage {
          node {
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
  `,
};
