import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import { Product } from '@/types/woocommerce';
import ProductCard from '@/components/ProductCard';

interface CollectionSwiperProps {
  products: Product[];
  title: string;
}

const title = "Explore What's New";

const button_link = "";
const button_text = "";

export default function CollectionSwiper({ products, title }: CollectionSwiperProps) {
  return (
    <section className="section collection-swiper">
      <div className="container">
        {title.length > 0 &&
          <h3 className="section__title">
            { title }
          </h3>
        }

        <div className="collection-swiper__products-slider">
          <Swiper
            slidesPerView={4}
            slidesOffsetAfter={9}
            slidesOffsetBefore={9}
            modules={[Autoplay, Pagination, Navigation]}
            pagination={{ clickable: true }}
            navigation
            autoplay={{ delay: 5000, disableOnInteraction: false }}
          >
            {products.map((product) => (
              <SwiperSlide>
                <ProductCard key={product.id} product={product} />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        {button_link.length > 0 && button_text.length > 0 &&
          <div className="collection-swiper__cta">
            <a href={ button_link }>
              { button_text }
            </a>
          </div>
        }
      </div>
    </section>
  )
}