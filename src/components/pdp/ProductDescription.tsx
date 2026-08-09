import ProductCoaLink from '@/components/pdp/ProductCoaLink';
import PdpTrustBadges from '@/components/pdp/PdpTrustBadges';
import { Product } from '@/types/woocommerce';

interface Props {
  product: Product;
}

export default function ProductDescription({ product }: Props) {
  return (
    <section className="product-description-section">
      <div className="columns is-desktop">
        <div className="column">
          {product.description && (
            <>
              <h2>
                About Mellow Sips
              </h2>
              <div
                className="description"
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            </>
          )}
          <PdpTrustBadges />
        </div>
        <div className="column">
          <ProductCoaLink product={product} />
        </div>
      </div>
    </section>
  );
}