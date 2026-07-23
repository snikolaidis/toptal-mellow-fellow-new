'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Autoplay } from 'swiper/modules';
import { BlogPostCard } from '@/types/blog';
import styles from '@/styles/pages/blogs.module.css';

interface Props {
  title?: string;
  posts: BlogPostCard[];
}

// Word-based truncation (not character-based) — cuts cleanly after the 16th
// word instead of mid-word.
function truncateWords(html: string, wordLimit: number): string {
  const text = html.replace(/<[^>]*>/g, '').trim();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= wordLimit) return text;
  return `${words.slice(0, wordLimit).join(' ')}...`;
}

export default function BlogPostsCarousel({ title = 'Learn About Our Products', posts }: Props) {
  const [paginationEl, setPaginationEl] = useState<HTMLDivElement | null>(null);

  if (!posts.length) return null;

  return (
    <section className={styles.relatedProductsSection}>
      <h2 className={styles.faqTitle}>{title}</h2>
      <Swiper
        modules={[Pagination, Autoplay]}
        pagination={paginationEl ? { clickable: true, el: paginationEl } : false}
        autoplay={{ delay: 3000, disableOnInteraction: false, pauseOnMouseEnter: true }}
        speed={1000}
        loop={posts.length > 4}
        slidesPerView={1.2}
        spaceBetween={16}
        breakpoints={{
          540: { slidesPerView: 2.1, spaceBetween: 20 },
          900: { slidesPerView: 4, spaceBetween: 24, slidesPerGroup: 4 },
        }}
        className={styles.relatedSwiper}
      >
        {posts.map((post) => (
          <SwiperSlide key={post.id} className={styles.relatedSlide}>
            <Link href={`/blogs/${post.slug}`} className={`${styles.postCard} ${styles.carouselPostCard}`}>
              {post.featuredImage?.node && (
                <div className={styles.postCardImage}>
                  <Image
                    src={post.featuredImage.node.sourceUrl}
                    alt={post.featuredImage.node.altText || post.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className={styles.featuredImageImg}
                  />
                </div>
              )}
              <div className={styles.postCardBody}>
                <h3 className={`${styles.postCardTitle} ${styles.carouselPostTitle}`}>{post.title}</h3>
                {post.excerpt && (
                  <p className={`${styles.postCardExcerpt} ${styles.carouselPostExcerpt}`}>
                    {truncateWords(post.excerpt, 16)}
                  </p>
                )}
              </div>
            </Link>
          </SwiperSlide>
        ))}
      </Swiper>
      <div ref={setPaginationEl} className={styles.relatedPagination} />
    </section>
  );
}
