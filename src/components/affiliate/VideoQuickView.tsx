'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Product } from '@/types/woocommerce';
import { useCart } from '@/context/CartContext';
import styles from './VideoQuickView.module.css';

interface VideoQuickViewProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export default function VideoQuickView({
  product,
  isOpen,
  onClose,
  onNext,
  hasNext,
}: VideoQuickViewProps) {
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  const isInStock = !product.stockStatus || product.stockStatus === 'IN_STOCK';
  const imageUrl = product.image?.sourceUrl || '/placeholder-product.png';

  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setAddedToCart(false);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const handleAddToCart = async () => {
    if (!isInStock) return;
    setIsAdding(true);
    try {
      await addToCart({ productId: product.databaseId, quantity });
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
    } finally {
      setIsAdding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Bottom sheet */}
      <div className={styles.sheet}>
        {/* Header bar */}
        <div className={styles.sheetBar} />

        {/* Close + Next nav */}
        <div className={styles.sheetHeader}>
          <div />
          <div className={styles.sheetActions}>
            {hasNext && onNext && (
              <button className={styles.nextBtn} onClick={onNext} aria-label="Next product">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            )}
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className={styles.sheetContent}>
          {/* Product image */}
          <div className={styles.imageWrap}>
            <Image
              src={imageUrl}
              alt={product.image?.altText || product.name}
              width={180}
              height={240}
              style={{ objectFit: 'contain', width: '100%', height: '100%' }}
            />
          </div>

          {/* Product info */}
          <div className={styles.productInfo}>
            <h2 className={styles.productName}>{product.name}</h2>
            <p className={styles.productPrice}>
              {product.salePrice ? (
                <>
                  <span className={styles.salePrice}>{product.salePrice}</span>
                  <span className={styles.regularPrice}>{product.regularPrice}</span>
                </>
              ) : (
                product.price
              )}
            </p>

            {/* Quantity */}
            <div className={styles.quantityRow}>
              <span className={styles.quantityLabel}>Quantity</span>
              <div className={styles.quantityStepper}>
                <button
                  className={styles.stepperBtn}
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  aria-label="Decrease"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 12H4" />
                  </svg>
                </button>
                <span className={styles.stepperValue}>{quantity}</span>
                <button
                  className={styles.stepperBtn}
                  onClick={() => setQuantity(quantity + 1)}
                  aria-label="Increase"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>

            <hr className={styles.divider} />

            {/* Description */}
            {product.shortDescription && (
              <>
                <p className={styles.descLabel}>Description</p>
                <div
                  className={styles.description}
                  dangerouslySetInnerHTML={{ __html: product.shortDescription }}
                />
              </>
            )}
          </div>
        </div>

        {/* Fixed Add to Cart */}
        <div className={styles.sheetFooter}>
          <button
            className={`${styles.addToCartBtn} ${addedToCart ? styles.added : ''}`}
            onClick={handleAddToCart}
            disabled={isAdding || !isInStock}
          >
            {isAdding ? 'Adding...' : addedToCart ? '✓ Added to Cart' : isInStock ? 'Add to cart' : 'Out of Stock'}
          </button>
        </div>
      </div>
    </>
  );
}
