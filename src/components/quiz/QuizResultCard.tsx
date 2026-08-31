import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Product } from '@/types/woocommerce';
import { useCart } from '@/context/CartContext';
import { decodeEntities } from '@/lib/decodeEntities';

interface QuizResultCardProps {
  product: Product;
}

export default function QuizResultCard({ product }: QuizResultCardProps) {
  const { addToCart } = useCart();
  const [isAdding, setIsAdding] = useState(false);

  const imageUrl = product.image?.sourceUrl || '/placeholder-product.png';
  const productType = product.__typename || product.type;
  const isSimpleProduct = productType === 'SimpleProduct' || product.type === 'SIMPLE';
  const isBundle = product.bbLinkedBundleId != null;
  const isInStock = !product.stockStatus || product.stockStatus === 'IN_STOCK';
  // Only simple, in-stock, non-bundle products can be added straight to cart.
  // Everything else routes to the PDP where variations / bundle building live.
  const canQuickAdd = isSimpleProduct && !isBundle && isInStock;

  const handleAdd = async () => {
    if (!canQuickAdd) return;
    setIsAdding(true);
    try {
      await addToCart({ productId: product.databaseId, quantity: 1 });
    } finally {
      setIsAdding(false);
    }
  };

  const name = decodeEntities(product.name);

  return (
    <div className="quiz-result-card">
      <Link href={`/products/${product.slug}`} className="quiz-result-card__link">
        <span className="quiz-result-card__media">
          <Image
            src={imageUrl}
            alt={product.image?.altText || name}
            fill
            sizes="(max-width: 640px) 40vw, 180px"
            className="quiz-result-card__image"
          />
        </span>
        <span className="quiz-result-card__name">{name}</span>
        <span className="quiz-result-card__price">
          {product.salePrice ? (
            <>
              <span className="quiz-result-card__price--sale">{product.salePrice}</span>
              <span className="quiz-result-card__price--regular">{product.regularPrice}</span>
            </>
          ) : (
            <span>{product.price}</span>
          )}
        </span>
      </Link>

      {canQuickAdd ? (
        <button
          type="button"
          className="quiz-result-card__add"
          onClick={handleAdd}
          disabled={isAdding}
          aria-label={`Add ${name} to cart`}
        >
          {isAdding ? 'Adding…' : 'Add to Cart'}
        </button>
      ) : (
        <Link href={`/products/${product.slug}`} className="quiz-result-card__add">
          {isBundle ? 'Create Bundle' : 'View Product'}
        </Link>
      )}
    </div>
  );
}
