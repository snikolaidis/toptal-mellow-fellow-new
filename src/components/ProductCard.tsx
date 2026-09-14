import Link from 'next/link';
import Image from 'next/image';
import { Product } from '@/types/woocommerce';
import { useCart } from '@/context/CartContext';
import { ReactNode, useState } from 'react';
import QuickView from '@/components/shop/QuickView';
import { recordWidgetSource, WidgetSource } from '@/lib/widgetAttribution';
import { decodeEntities } from '@/lib/decodeEntities';

// Most of the catalogue sits at exactly 15, which is a default rather than real
// stock, so anything from 15 up would badge roughly three quarters of the store
// and stop meaning anything.
const LOW_STOCK_THRESHOLD = 10;

interface ProductCardProps {
  product: Product;
  badge?: 'new' | 'sale' | 'limited';
  priority?: boolean;
  source?: WidgetSource;
}

const IconIndica = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.51275 2.23725C2.51275 1.43745 2.68755 0.67475 3.01275 0C1.22513 0.8374 0 2.64987 0 4.75C0 7.64987 2.35013 10 5.25 10C7.35013 10 9.16263 8.7627 10 6.98725C9.3252 7.31245 8.5625 7.48725 7.76275 7.48725C4.86237 7.48725 2.51275 5.13762 2.51275 2.23725Z" fill="#162B58"/>
  </svg>
);

const IconHybrid = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 12C2.68594 12 0 9.31406 0 6C0 2.68594 2.68594 0 6 0C9.31406 0 12 2.68594 12 6C12 9.31406 9.31406 12 6 12ZM6 10.5C8.48438 10.5 10.5 8.48438 10.5 6C10.5 3.51562 8.48438 1.5 6 1.5V10.5Z" fill="#858F67"/>
  </svg>
);

const IconSativa = () => (
  <svg width="11" height="12" viewBox="0 0 11 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5.49948 2.90265C7.30069 2.90265 8.76125 4.28903 8.76125 5.99994C8.76125 7.71032 7.30125 9.09723 5.49948 9.09723C3.69828 9.09723 2.23771 7.71085 2.23771 5.99994C2.23771 4.28956 3.69772 2.90265 5.49948 2.90265ZM8.91543 7.87338C8.85948 7.96557 8.89294 8.08379 8.99002 8.13744L10.692 9.07076C10.7227 9.08795 10.7578 9.09628 10.7929 9.09628C10.8658 9.09628 10.9333 9.05878 10.97 8.99889C11.026 8.9067 10.9925 8.78848 10.8954 8.73483L9.1935 7.80151C9.09642 7.74838 8.97192 7.78015 8.91542 7.87234L8.91543 7.87338ZM3.60111 2.49066L3.03509 1.5589V1.55629C2.97749 1.46411 2.85408 1.43338 2.75591 1.48702C2.65882 1.54171 2.62646 1.6589 2.68296 1.75213L3.24899 2.68389C3.30493 2.77607 3.42999 2.80784 3.52707 2.75472C3.62415 2.70159 3.65761 2.58284 3.60167 2.49066L3.60111 2.49066ZM8.91543 4.1281C8.97302 4.22029 9.09643 4.25101 9.1946 4.19737L10.8965 3.26405H10.8993C10.9964 3.20936 11.0287 3.09217 10.9722 2.99895C10.9146 2.90676 10.7912 2.87603 10.693 2.92968L8.99111 3.863H8.98837C8.89129 3.91768 8.85893 4.03488 8.91543 4.1281ZM10.9854 5.99994C10.9854 5.89317 10.8943 5.80672 10.7819 5.80672H9.64873C9.53629 5.80672 9.44524 5.89317 9.44524 5.99994C9.44524 6.10671 9.53629 6.19316 9.64873 6.19316H10.7819C10.8943 6.19316 10.9854 6.10671 10.9854 5.99994ZM5.70294 2.05986V0.193224C5.70294 0.0864547 5.61189 0 5.49946 0C5.38702 0 5.29597 0.0864574 5.29597 0.193224V2.05986C5.29597 2.16663 5.38702 2.25309 5.49946 2.25309C5.61189 2.25309 5.70294 2.16663 5.70294 2.05986ZM8.31867 1.75049C8.37462 1.65727 8.33952 1.54008 8.24298 1.48643C8.1459 1.43331 8.0214 1.46664 7.9649 1.55831L7.39887 2.49007C7.34292 2.58225 7.37638 2.70048 7.47346 2.75413C7.57054 2.80725 7.69505 2.77548 7.75155 2.6833L8.31758 1.75154V1.74893L8.31867 1.75049ZM0.0277717 9.00146C0.0853631 9.09364 0.208777 9.12437 0.306953 9.07073L2.00889 8.13741C2.10597 8.08428 2.13833 7.96658 2.08348 7.8749C2.02753 7.78168 1.90358 7.74938 1.80539 7.80303L0.103461 8.73635H0.100718C0.00363616 8.79104 -0.028723 8.90823 0.0277717 9.00146ZM2.08354 4.12659C2.13949 4.03441 2.10603 3.91618 2.00895 3.86253L0.307016 2.92921C0.209934 2.87609 0.0854319 2.90786 0.0289302 3.00004C-0.0270156 3.09223 0.00644178 3.21045 0.103524 3.26411L1.80546 4.19743C1.83617 4.21461 1.87127 4.22295 1.90802 4.22295C1.98097 4.22295 2.04844 4.18545 2.08518 4.12555L2.08354 4.12659ZM7.39785 9.50932L7.96388 10.4411C8.01983 10.5333 8.14378 10.564 8.24032 10.5119C8.3385 10.4588 8.37251 10.3411 8.31601 10.2478L7.74999 9.31609C7.69404 9.2239 7.57009 9.19317 7.47354 9.24525C7.37536 9.29838 7.34136 9.41608 7.39785 9.50932ZM0.0135901 6.00003C0.0135901 6.1068 0.104639 6.19326 0.217075 6.19326H1.35024C1.46268 6.19326 1.55373 6.1068 1.55373 6.00003C1.55373 5.89327 1.46268 5.80681 1.35024 5.80681H0.217075C0.104636 5.80681 0.0135901 5.89327 0.0135901 6.00003ZM2.68135 10.2469C2.6265 10.3391 2.65886 10.4563 2.75594 10.5094C2.85302 10.5641 2.97752 10.5323 3.03512 10.4401L3.60115 9.50838C3.6571 9.41619 3.62364 9.29797 3.52656 9.24432C3.42947 9.19119 3.30497 9.22296 3.24847 9.31515L2.68244 10.2469L2.68135 10.2469ZM5.29596 9.94014V11.8068C5.29596 11.9135 5.387 12 5.49944 12C5.61188 12 5.70293 11.9135 5.70293 11.8068V9.94014C5.70293 9.83337 5.61188 9.74691 5.49944 9.74691C5.387 9.74691 5.29596 9.83337 5.29596 9.94014Z" fill="#FFBF00"/>
  </svg>
);

export default function ProductCard({ product, badge, priority = false, source }: ProductCardProps) {
  const { addToCart } = useCart();
  const [isAdding, setIsAdding] = useState(false);
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);

  const imageUrl = product.image?.sourceUrl || '/placeholder-product.png';
  const name = decodeEntities(product.name) || '';
  const productType = product.__typename || product.type;
  const isSimpleProduct = productType === 'SimpleProduct' || product.type === 'SIMPLE';
  const isInStock = !product.stockStatus || product.stockStatus === 'IN_STOCK';
  // Bundle Builder entry-point product. "byob" can't be added to cart
  // directly — it has no fixed price and needs its own bundle-picker page.
  // "fixed" is a normal add-to-cart with a flat bundle price (see
  // addFixedBundleToCart). "mystery" renders identically to "fixed".
  const isByobBundle = product.bbBundleMode === 'byob';
  const isFixedBundle = product.bbBundleMode === 'fixed' || product.bbBundleMode === 'mystery';
  const isBundle = isByobBundle || isFixedBundle;

  const hasSale = !!product.salePrice;
  const displayBadge = badge || (hasSale ? 'sale' : undefined);

  const stockLeft = product.stockQuantity;
  const isLowStock =
    isInStock && typeof stockLeft === 'number' && stockLeft > 0 && stockLeft <= LOW_STOCK_THRESHOLD;

  // Product attribute taxonomies (first assigned term of each).
  const strainType = product.strainTypes?.nodes?.[0]?.name;
  const strainName = decodeEntities(product.strainNames?.nodes?.[0]?.name);
  const blendType = product.blendTypes?.nodes?.[0]?.name;
  const lineCollection = decodeEntities(product.productLines?.nodes?.[0]?.name);
  const size = product.size?.nodes?.[0]?.name;
  const mG = product.mG?.nodes?.[0]?.name;
  const pieces = product.pieces?.nodes?.[0]?.name;
  const mfProductTypeRaw = product.mfproductTypes?.nodes?.[0]?.name;
  // Taxonomy terms come uppercase (e.g. "DISPOSABLE VAPE") — title-case for display.
  const mfProductType = mfProductTypeRaw
    ?.toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const uniqueSellingProps = (product.uniqueSellingProps?.nodes || [])
    .map((usp) => ({
      id: usp.id,
      name: usp.name,
      iconUrl: usp.uniqueSellingFields?.propIcon?.node?.sourceUrl,
    }))
    .filter((usp): usp is { id: string; name: string; iconUrl: string } => !!usp.iconUrl);

  const handleQuickAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isSimpleProduct || !isInStock) return;

    setIsAdding(true);
    try {
      if (source) {
        recordWidgetSource(product.databaseId, source);
      }
      await addToCart({
        productId: product.databaseId,
        quantity: 1,
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleQuickView = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsQuickViewOpen(true);
  };

  const getBadgeClasses = () => {
    const base = 'product__tag';
    switch (displayBadge) {
      case 'new':
        return `${base} product__tag--new`;
      case 'sale':
        return `${base} product__tag--sale`;
      case 'limited':
        return `${base} product__tag--limited`;
      default:
        return base;
    }
  };

  const getStrainTypeIcon = (strainType: string): ReactNode => {
    switch (strainType) {
      case 'Indica': return <IconIndica />;
      case 'Hybrid': return <IconHybrid />;
      case 'Sativa': return <IconSativa />;
      default: return null;
    }
  };

  return (
    <>
      <div className="product-card">
        <Link href={`/products/${product.slug}`} prefetch={false} className="block">
          <div className="product__media-badges">
            <div className="product__tags">
              <div className="product__tags-left">
                {mfProductType && (
                  <div className="product__tag product-type">
                    {mfProductType}
                  </div>
                )}

                {/* Out of Stock Badge when out of stock, otherwise the regular Badge */}
                {!isInStock ? (
                  <div className="product__tag product__tag--sold-out">
                    Sold Out
                  </div>
                ) : (
                  displayBadge && (
                    <div className={getBadgeClasses()}>
                      {displayBadge === 'new' && 'New'}
                      {displayBadge === 'sale' && 'Price Drop'}
                      {displayBadge === 'limited' && 'Limited'}
                    </div>
                  )
                )}
              </div>

              {/* Unique selling prop icons (e.g. Vegan, High Potency) — title shown on hover */}
              {uniqueSellingProps.length > 0 && (
                <div className="product__usp-icons">
                  {uniqueSellingProps.map((usp) => (
                    <div key={usp.id} className="product__usp-icon" title={usp.name}>
                      <img src={usp.iconUrl} alt="" loading="lazy" decoding="async" width={20} height={20} />
                      <span className="product__usp-tooltip">{usp.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inner container with padding to keep product images away from edges */}
            <div className="image is-square">
              <Image
                src={imageUrl}
                alt={product.image?.altText || name}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                className="object-contain object-center transition-transform duration-700 group-hover:scale-105"
                priority={priority}
              />
            </div>
          </div>

          {/* Product Info */}
          <div className="product__info">
            {lineCollection && (
              <p className="product__line-collection">
                {lineCollection}
              </p>
            )}

            {blendType && (
              <p className="product__blend-type">
                {blendType}
              </p>
            )}

            {strainName && (
              <p className="product__strain-name">
                {strainName}
              </p>
            )}

            {!lineCollection && !blendType && !strainName && name && (() => {
              // No taxonomy data available (e.g. lean recommendation feeds) — fall back to
              // splitting the raw title on its last dash, mirroring the blend-type/strain-name
              // split used for regular products so the card reads the same way.
              const parts = name.split(/\s[-–—]\s/);
              const main = parts[0];
              const variant = parts.slice(1).join(' - ');
              return (
                <>
                  <p className="product__blend-type">{main}</p>
                  {variant && (
                    <p className="product__strain-name">{variant}</p>
                  )}
                </>
              );
            })()}

            <div className="product__strain-tags">
              {strainType && (
                <div className={`product__tag strain-type ${strainType.replace(' ', '-').toLowerCase()}`}>
                  {getStrainTypeIcon(strainType)}
                  {strainType}
                </div>
              )}

              {size && (
                <div className="product__tag product-size">
                  {size}
                </div>
              )}

              {mG && (
                <div className="product__tag product-mg">
                  {mG}
                </div>
              )}

              {pieces && (
                <div className="product__tag product-pieces">
                  {pieces}
                </div>
              )}
            </div>

            <div className="product__price">
              {isFixedBundle ? (
                product.bbFixedPrice != null && (
                  product.bbFixedOriginalPrice != null &&
                  product.bbFixedOriginalPrice > product.bbFixedPrice + 0.005 ? (
                    <>
                      <span className="product__price--sale">${product.bbFixedPrice.toFixed(2)}</span>
                      <span className="product__price--regular">${product.bbFixedOriginalPrice.toFixed(2)}</span>
                    </>
                  ) : (
                    <span>${product.bbFixedPrice.toFixed(2)}</span>
                  )
                )
              ) : isByobBundle ? (
                product.bbShowPrice && product.bbFromPrice != null && (
                  <span>From ${product.bbFromPrice.toFixed(2)}</span>
                )
              ) : product.salePrice ? (
                <>
                  <span className="product__price--sale">{product.salePrice}</span>
                  <span className="product__price--regular">{product.regularPrice}</span>
                </>
              ) : (
                <span>{product.price}</span>
              )}
            </div>
          </div>
        </Link>

        {/* Action Buttons */}
        {isInStock && (
          <div className="is-flex">
            {/* Quick View Button
            <button
              onClick={handleQuickView}
              className="button is-small is-fullwidth"
              aria-label={`Quick view ${name}`}
            >
              Quick view
            </button>*/}

            {/* Neither bundle type can be added to cart directly from the
                card. byob goes straight to its picker (same slug, /bundle/
                route); fixed has no picker, so it goes to the PDP to review
                what's included first. */}
            {isBundle && (
              <Link
                href={isByobBundle ? `/bundle/${product.slug}` : `/products/${product.slug}`}
                prefetch={false}
                className="button is-small add-to-cart is-fullwidth"
                aria-label={isFixedBundle ? `View ${name} bundle` : `Create a bundle from ${name}`}
              >
                {isFixedBundle ? 'View Bundle' : 'Create Bundle'}
              </Link>
            )}

            {/* Quick Add Button (Simple Products Only) */}
            {isSimpleProduct && !isBundle && (
              <button
                onClick={handleQuickAdd}
                disabled={isAdding}
                className={`button is-small add-to-cart is-fullwidth ${isAdding ? 'is-loading' : ''}`}
                aria-label={`Add ${name} to cart`}
              >
                Add to cart
              </button>
            )}

            {/* View Options for Variable Products */}
            {!isSimpleProduct && !isBundle && (
              <div className="flex h-10 items-center justify-center bg-white text-black border border-black px-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider">Options</span>
              </div>
            )}
          </div>
        )}

        <div className="product__stock-slot">
          {isLowStock && (
            <span className="product__stock">Only {stockLeft} in Stock</span>
          )}
        </div>
      </div>

      {/* Quick View Modal */}
      <QuickView
        product={product}
        isOpen={isQuickViewOpen}
        onClose={() => setIsQuickViewOpen(false)}
      />
    </>
  );
}
