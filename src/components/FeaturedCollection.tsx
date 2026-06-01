import { Product } from '@/types/woocommerce';
import ProductCard from '@/components/ProductCard';

interface FeaturedCollectionProps {
  products: Product[];
  title: string;
}

const button_link = "";
const button_text = "";

export default function FeaturedCollection({ products, title }: FeaturedCollectionProps) {
  return (
    <section className="section featured-collection">
      <div className="container">
        {title.length > 0 &&
          <h3 className="section__title">
            { title }
          </h3>
        }

        <div className="products-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {button_link.length > 0 && button_text.length > 0 &&
          <div className="featured-collection__cta">
            <a href={ button_link }>
              { button_text }
            </a>
          </div>
        }
      </div>
    </section>
  )
}