import { Product } from '@/types/woocommerce';
import Image from 'next/image';

interface Props {
  product: Product;
}

export default function ProductTimeline({ product }: Props) {

  if (!product.productDetails?.timelineImage) {
    return null;
  }

  const timelineImage = product.productDetails?.timelineImage?.node;

  if (!timelineImage?.sourceUrl) {
    return null;
  }

  return (
    <div className="product-timeline">
      <Image
        src={timelineImage.sourceUrl}
        alt={timelineImage.altText || `${product.name} timeline`}
        width={timelineImage.mediaDetails?.width || 444}
        height={timelineImage.mediaDetails?.height || 221}
        sizes="(max-width: 1024px) 100vw, 50vw"
      />
    </div>
  )
}