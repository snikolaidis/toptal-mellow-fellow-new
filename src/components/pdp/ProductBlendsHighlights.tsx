import Image from 'next/image';
import { Product } from '@/types/woocommerce';

interface Props {
  product: Product;
}

export default function ProductBlendsHighlights({ product }: Props) {
  const image = product.productDetails?.blendsHighlights?.node;

  if (!image?.sourceUrl) {
    return null;
  }

  return (
    <div className="product-blends-highlights">
      <Image
        src={image.sourceUrl}
        alt={image.altText || `${product.name} blend highlights`}
        width={image.mediaDetails?.width || 439}
        height={image.mediaDetails?.height || 356}
        sizes="(max-width: 1024px) 100vw, 50vw"
      />
    </div>
  );
}
