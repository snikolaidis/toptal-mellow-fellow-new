import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

import Image from 'next/image';

const slides = [
  { id: 1, img: '/MAY26_Mellow_Cares_Export__Desktop_Hero.webp' },
  { id: 2, img: '/Flower_THCa_Exotic_Flower_3.5g_Launch_Graphics_B2C_Desktop_Hero.webp' },
  { id: 3, img: '/Hash_Hole_2026_Desktop_Hero.webp' },
  { id: 4, img: '/Max_Dose_Gummies_B2C_Desktop_Hero.webp' },
  { id: 5, img: '/MAY26_Mellow_Cares_Export__Desktop_Hero.webp' },
  { id: 6, img: '/Prerolls_THCa_THCp_1g_Prepriced_Exports_B2B__Desktop_Hero.webp' }
];

export default function HeroSwiper() {
  return (
    <Swiper
      modules={[Autoplay, Pagination, Navigation]}
      pagination={{ clickable: true }}
      navigation
      autoplay={{ delay: 5000, disableOnInteraction: false }}
      loop
    >
      {slides.map((slide) => (
        <SwiperSlide key={slide.id}>
          <Image
            src={ slide.img }
            alt="Mellow Fellow"
            width={3000}
            height={1500}
          />
        </SwiperSlide>
      ))}
    </Swiper>
  );
}