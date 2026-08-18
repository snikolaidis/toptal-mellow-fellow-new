import { Product } from '@/types/woocommerce';

interface Props {
  product: Product;
}

export default function ProductMellowMeter({ product }: Props) {
  const term = product.mellowMeters?.nodes?.[0];
  const image = term?.mellowMeterFields?.meterImage?.node;

  if (!term || !image?.sourceUrl) {
    return null;
  }

  return (
    <div className="product-mellow-meter">
      {/* MellowMeter icons are SVGs with no intrinsic dimensions, so this
          uses a plain <img> rather than next/image (which both rejects SVG
          sources without dangerouslyAllowSVG and requires width/height). */}
      <img
        src={image.sourceUrl}
        alt={image.altText || `Mellow Meter: ${term.name}`}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
