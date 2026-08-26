'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Product } from '@/types/woocommerce';
import { useCart } from '@/context/CartContext';

interface QuickViewProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
}

export default function QuickView({ product, isOpen, onClose }: QuickViewProps) {
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [selectedVariation, setSelectedVariation] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  const imageUrl = product.image?.sourceUrl || '/placeholder-product.png';
  const productType = product.__typename || product.type;
  const isSimpleProduct = productType === 'SimpleProduct' || product.type === 'SIMPLE';
  const isVariableProduct = productType === 'VariableProduct' || product.type === 'VARIABLE';
  const isInStock = !product.stockStatus || product.stockStatus === 'IN_STOCK';
  const variations = product.variations?.nodes || [];

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setSelectedVariation('');
      setAddedToCart(false);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const handleAddToCart = async () => {
    if (!isInStock) return;
    if (isVariableProduct && !selectedVariation) return;

    setIsAdding(true);
    try {
      await addToCart({
        productId: product.databaseId,
        quantity,
        variationId: selectedVariation ? parseInt(selectedVariation) : undefined,
      });
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
    } finally {
      setIsAdding(false);
    }
  };

  // Get selected variation details for pricing
  const selectedVariationData = selectedVariation
    ? variations.find((v) => v.databaseId.toString() === selectedVariation)
    : null;

  const displayPrice = selectedVariationData?.price || product.price;
  const displaySalePrice = selectedVariationData?.salePrice || product.salePrice;
  const displayRegularPrice = selectedVariationData?.regularPrice || product.regularPrice;

  if (!isOpen) return null;

  return (
    <div className="quickview-overlay" onClick={onClose}>
      <div className="quickview-modal" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button className="quickview-close" onClick={onClose} aria-label="Close">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="quickview-content">
          {/* Image */}
          <div className="quickview-image">
            <Image
              src={imageUrl}
              alt={product.image?.altText || product.name}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>

          {/* Details */}
          <div className="quickview-details">
            {/* Category */}
            {product.productCategories?.nodes && product.productCategories.nodes.length > 0 && (
              <p className="quickview-category">
                {product.productCategories.nodes[0].name}
              </p>
            )}

            {/* Title */}
            <h2 className="quickview-title">{product.name}</h2>

            {/* Price */}
            <div className="quickview-price">
              {displaySalePrice ? (
                <>
                  <span className="sale-price">{displaySalePrice}</span>
                  <span className="regular-price">{displayRegularPrice}</span>
                </>
              ) : (
                <span>{displayPrice}</span>
              )}
            </div>

            {/* Short Description */}
            {product.shortDescription && (
              <div
                className="quickview-description"
                dangerouslySetInnerHTML={{ __html: product.shortDescription }}
              />
            )}

            {/* Variations */}
            {isVariableProduct && variations.length > 0 && (
              <div className="quickview-variations">
                <label htmlFor="variation-select">Select Option</label>
                <select
                  id="variation-select"
                  value={selectedVariation}
                  onChange={(e) => setSelectedVariation(e.target.value)}
                  className="variation-select"
                >
                  <option value="">Choose an option</option>
                  {variations.map((variation) => (
                    <option key={variation.databaseId} value={variation.databaseId.toString()}>
                      {variation.name} - {variation.price}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quantity & Add to Cart */}
            {isInStock ? (
              <div className="quickview-actions">
                <div className="quantity-selector">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="quantity-btn"
                    aria-label="Decrease quantity"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                  </button>
                  <span className="quantity-value">{quantity}</span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="quantity-btn"
                    aria-label="Increase quantity"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>

                <button
                  onClick={handleAddToCart}
                  disabled={isAdding || (isVariableProduct && !selectedVariation)}
                  className={`add-to-cart-btn ${addedToCart ? 'added' : ''}`}
                >
                  {isAdding ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Adding...
                    </span>
                  ) : addedToCart ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Added!
                    </span>
                  ) : (
                    'Add to Cart'
                  )}
                </button>
              </div>
            ) : (
              <div className="out-of-stock">Out of Stock</div>
            )}

            {/* View Full Details Link */}
            <Link href={`/products/${product.slug}`} className="view-details-link" onClick={onClose}>
              View Full Details
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
