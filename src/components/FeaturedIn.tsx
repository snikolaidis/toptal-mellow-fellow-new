import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

import Image from 'next/image';

const logos = [
  { id: 1, src: '/logos/forbes.avif', alt: 'Forbes Logo' },
  { id: 2, src: '/logos/la-weekly.avif', alt: 'LA Weekly Logo' },
  { id: 3, src: '/logos/mens-journal.avif', alt: 'Mens\'s Journal' },
  { id: 4, src: '/logos/paper-mag.webp', alt: 'Paper Mag Logo' },
  { id: 5, src: '/logos/bella-magazine.webp', alt: 'Bella Magazine' },
  { id: 6, src: '/logos/high-times.webp', alt: 'High Times' },
  { id: 7, src: '/logos/vapes.avif', alt: 'Vapes' },
  { id: 8, src: '/logos/FHAA.webp', alt: 'FHAA' }
];

export default function FeaturedIn() {
  return (
    <div className="section featured-in">
      <h3 className="section__title">
        Featured In
      </h3>

      <Swiper
        slidesPerView={2}
        spaceBetween={30}
        modules={[Autoplay]}
        autoplay={{ delay: 5000, disableOnInteraction: false }}
        loop
        breakpoints={{
          768: {
            slidesPerView: logos.length,
          }
        }}
      >
        {logos.map((logo) => (
          <SwiperSlide key={logo.id}>
            <Image
              src={ logo.src }
              alt={ logo.alt }
              width={500}
              height={500}
            />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}