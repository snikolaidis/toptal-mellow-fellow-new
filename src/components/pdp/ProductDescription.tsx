import ProductCoaLink from '@/components/pdp/ProductCoaLink';
import ProductMellowMeter from '@/components/pdp/ProductMellowMeter';
import PdpTrustBadges from '@/components/pdp/PdpTrustBadges';
import Nutrition from '@/components/pdp/Nutrition';
import Allergens from '@/components/pdp/Allergens';
import { Product, ProductNutrition } from '@/types/woocommerce';

interface Props {
  product: Product;
  nutrition?: ProductNutrition | null;
  allergens?: string | null;
}

export default function ProductDescription({ product, nutrition, allergens }: Props) {
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
          <Nutrition nutrition={nutrition} />
          <Allergens html={allergens} />
        </div>
        <div className="column">
          <ProductMellowMeter product={product} />
          <ProductCoaLink product={product} />
        </div>
      </div>
    </section>
  );
}