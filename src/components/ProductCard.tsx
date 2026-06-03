import Link from 'next/link';
import Image from 'next/image';
import { Product } from '@/types/woocommerce';
import { useCart } from '@/context/CartContext';
import { useState } from 'react';
import QuickView from '@/components/shop/QuickView';

interface ProductCardProps {
  product: Product;
  badge?: 'new' | 'sale' | 'limited';
  priority?: boolean;
}

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const EyeIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

export default function ProductCard({ product, badge, priority = false }: ProductCardProps) {
  const { addToCart } = useCart();
  const [isAdding, setIsAdding] = useState(false);
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);

  const imageUrl = product.image?.sourceUrl || '/placeholder-product.png';
  const productType = product.__typename || product.type;
  const isSimpleProduct = productType === 'SimpleProduct' || product.type === 'SIMPLE';
  const isInStock = !product.stockStatus || product.stockStatus === 'IN_STOCK';

  const hasSale = !!product.salePrice;
  const displayBadge = badge || (hasSale ? 'sale' : undefined);

  const handleQuickAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isSimpleProduct || !isInStock) return;

    setIsAdding(true);
    try {
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
    const base = 'absolute top-4 left-4 text-[10px] font-semibold px-3 py-1.5 uppercase tracking-wider z-10';
    switch (displayBadge) {
      case 'new':
        return `${base} bg-black text-white`;
      case 'sale':
        return `${base} bg-black text-white`;
      case 'limited':
        return `${base} bg-white text-black border border-black`;
      default:
        return base;
    }
  };

  return (
    <>
      <div className="product-card">
        <Link href={`/product/${product.slug}`} className="block">
          <div className="is-relative aspect-square w-full overflow-hidden bg-[#f5f5f0]">
            {/* Inner container with padding to keep product images away from edges */}
            <div className="image is-square">
              <Image
                src={imageUrl}
                alt={product.image?.altText || product.name}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                className="object-contain object-center transition-transform duration-700 group-hover:scale-105"
                priority={priority}
              />
            </div>

            {/* Badge */}
            {displayBadge && (
              <span className={getBadgeClasses()}>
                {displayBadge === 'new' && 'New'}
                {displayBadge === 'sale' && 'Sale'}
                {displayBadge === 'limited' && 'Limited'}
              </span>
            )}

            {/* Out of Stock Overlay */}
            {!isInStock && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                <span className="bg-black text-white px-4 py-2 text-xs font-semibold uppercase tracking-wider">
                  Sold Out
                </span>
              </div>
            )}

            {/* Action Buttons */}
            {isInStock && (
              <div className="absolute bottom-4 right-4 flex flex-col gap-2 opacity-0 transition-all duration-300 group-hover:opacity-100">
                {/* Quick View Button */}
                <button
                  onClick={handleQuickView}
                  className="flex h-10 w-10 items-center justify-center bg-white text-black border border-black transition-colors hover:bg-black hover:text-white"
                  aria-label={`Quick view ${product.name}`}
                >
                  <EyeIcon />
                </button>

                {/* Quick Add Button (Simple Products Only) */}
                {isSimpleProduct && (
                  <button
                    onClick={handleQuickAdd}
                    disabled={isAdding}
                    className="flex h-10 w-10 items-center justify-center bg-white text-black border border-black transition-colors hover:bg-black hover:text-white disabled:opacity-50"
                    aria-label={`Add ${product.name} to cart`}
                  >
                    {isAdding ? <LoadingSpinner /> : <PlusIcon />}
                  </button>
                )}

                {/* View Options for Variable Products */}
                {!isSimpleProduct && (
                  <div className="flex h-10 items-center justify-center bg-white text-black border border-black px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Options</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Link>

        {/* Product Info */}
        <div className="flex flex-col gap-1 pt-4">
          {product.productCategories?.nodes && product.productCategories.nodes.length > 0 && (
            <p className="text-[10px] text-[#666666] uppercase tracking-wider">
              {product.productCategories.nodes[0].name}
            </p>
          )}

          <Link href={`/product/${product.slug}`}>
            <h3 className="text-sm font-medium text-black hover:text-[#666666] transition-colors line-clamp-1">
              {product.name}
            </h3>
          </Link>

          <div className="flex items-center gap-2 mt-1">
            {product.salePrice ? (
              <>
                <span className="text-sm font-medium text-black">{product.salePrice}</span>
                <span className="text-sm text-[#999999] line-through">{product.regularPrice}</span>
              </>
            ) : (
              <span className="text-sm font-medium text-black">{product.price}</span>
            )}
          </div>
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
