import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import ProductCard from '@/components/ProductCard';
import { Product } from '@/types/woocommerce';
import { WidgetSource } from '@/lib/widgetAttribution';

const SWIPER_BREAKPOINTS = {
  769: { slidesPerView: 2 },
  992: { slidesPerView: 3 },
  1400: { slidesPerView: 4 },
} as const;

interface Props {
  products: Product[];
  source?: WidgetSource;
}

// Separate file so the dynamic import can keep Swiper and its three
// stylesheets out of the PDP, which only ever renders the grid.
export default function ProductCarousel({ products, source }: Props) {
  return (
    <div className="product-carousel">
      <Swiper
        spaceBetween={16}
        slidesPerView={2}
        slidesOffsetAfter={8}
        slidesOffsetBefore={8}
        modules={[Pagination, Navigation]}
        pagination={{ clickable: true }}
        navigation
        breakpoints={SWIPER_BREAKPOINTS}
        cssMode={true}
      >
        {products.map((product) => (
          <SwiperSlide key={product.slug}>
            <ProductCard product={product} source={source} />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
