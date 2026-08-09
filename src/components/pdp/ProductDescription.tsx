import ProductCoaLink from '@/components/pdp/ProductCoaLink';
import ProductBlendsHighlights from '@/components/pdp/ProductBlendsHighlights';
import PdpTrustBadges from '@/components/pdp/PdpTrustBadges';
import { Product } from '@/types/woocommerce';

interface Props {
  product: Product;
}

export default function ProductDescription({ product }: Props) {
  return (
    <section className="product-description-section">
      <div className="columns">
        <div className="column">
          {product.description && (
            <div className="description-box">
              <h2 className="description-box__title">
                About Mellow Sips
              </h2>
              <div
                className="description"
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            </div>
          )}
          <PdpTrustBadges />
        </div>
        <div className="column">
          <ProductBlendsHighlights product={product} />
          <ProductCoaLink product={product} />
        </div>
      </div>
    </section>
  );
}