import ProductCoaLink from '@/components/pdp/ProductCoaLink';
import ProductMellowMeter from '@/components/pdp/ProductMellowMeter';
import PdpTrustBadges from '@/components/pdp/PdpTrustBadges';
import { Product } from '@/types/woocommerce';

interface Props {
  product: Product;
}

export default function ProductDescription({ product }: Props) {
  return (
    <section className="product-description-section">
      <div className="columns is-8-desktop">
        <div className="column">
          {product.description && (
            <div className="description-box">
              <div
                className="description"
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            </div>
          )}
          <PdpTrustBadges />
        </div>
        <div className="column">
          <ProductMellowMeter product={product} />
          <ProductCoaLink product={product} />
        </div>
      </div>
    </section>
  );
}