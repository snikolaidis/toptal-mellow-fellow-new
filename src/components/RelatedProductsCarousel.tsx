'use client';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Autoplay } from 'swiper/modules';
import Link from 'next/link';
import Image from 'next/image';
import { SmartRelatedProduct } from '@/types/blog';
import styles from '@/styles/pages/blogs.module.css';

function decodeEntities(str: string) {
  return str
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

interface Props {
  products: SmartRelatedProduct[];
}

export default function RelatedProductsCarousel({ products }: Props) {
  if (!products.length) return null;

  return (
    <section className={styles.relatedProductsSection}>
      <h2 className={styles.faqTitle}>Related Products</h2>
      <Swiper
        modules={[Pagination, Autoplay]}
        pagination={{ clickable: true }}
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
            <Link href={`/product/${product.slug}`} className={styles.relatedCard}>
              <div className={styles.relatedImageWrap}>
                <Image
                  src={product.image}
                  alt={decodeEntities(product.title)}
                  fill
                  sizes="(max-width: 540px) 80vw, (max-width: 900px) 45vw, 280px"
                  className={styles.relatedImage}
                />
              </div>
              <div className={styles.relatedInfo}>
                <p className={styles.relatedTitle}>{decodeEntities(product.title)}</p>
                <p className={styles.relatedPrice}>${product.rawPrice} USD</p>
              </div>
              <span className={styles.relatedBtn}>Buy Now</span>
            </Link>
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
}
