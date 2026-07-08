'use client';

import { useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Autoplay } from 'swiper/modules';
import { Product } from '@/types/woocommerce';
import ProductCard from '@/components/ProductCard';
import styles from '@/styles/pages/blogs.module.css';

interface Props {
  products: Product[];
}

export default function RelatedProductsCarousel({ products }: Props) {
  const [paginationEl, setPaginationEl] = useState<HTMLDivElement | null>(null);

  if (!products.length) return null;

  return (
    <section className={styles.relatedProductsSection}>
      <h2 className={styles.faqTitle}>Related Products</h2>
      <Swiper
        modules={[Pagination, Autoplay]}
        pagination={paginationEl ? { clickable: true, el: paginationEl } : false}
        autoplay={{ delay: 3000, disableOnInteraction: false, pauseOnMouseEnter: true }}
        loop
        slidesPerView={1.2}
        spaceBetween={16}
        breakpoints={{
          540: { slidesPerView: 2.1, spaceBetween: 20 },
          900: { slidesPerView: 3, spaceBetween: 24 },
        }}
        className={styles.relatedSwiper}
      >
        {products.map((product) => (
          <SwiperSlide key={product.id} className={styles.relatedSlide}>
            <ProductCard product={product} />
          </SwiperSlide>
        ))}
      </Swiper>
      <div ref={setPaginationEl} className={styles.relatedPagination} />
    </section>
  );
}
