import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import CollectionCard from '@/components/CollectionCard';
import { CollectionCard as CollectionCardType } from '@/types/mellow-fellow';

interface CollectionCardsProps {
  cards: CollectionCardType[];
  title?: string;
}

export default function CollectionCards({ cards, title }: CollectionCardsProps) {
  return (
    <section className="section collection-cards">
      
      {title && title.length > 0 &&
        <h3 className="section__title">
          { title }
        </h3>
      }

      <Swiper
        slidesPerView={1}
        spaceBetween={20}
        slidesOffsetAfter={100}
        loop
        breakpoints={{
          601: {
            slidesPerView: 2,
            slidesOffsetAfter: 40
          },
          901: {
            slidesPerView: 2,
            slidesOffsetAfter: 200
          },
          1201: {
            slidesPerView: 3,
            slidesOffsetAfter: 100
          }
        }}
      >
        {cards.map((card) => (
          <SwiperSlide>
            <CollectionCard key={ card.id } card={ card }/>
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  )
}