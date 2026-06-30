import Image from 'next/image';
import Link from 'next/link';
import styles from '@/styles/pages/deals-card-grid.module.css';

export interface DealCard {
  href: string;
  label: string;
  heading: string | null;
  description: string | null;
  image: { src: string; alt: string } | null;
}

interface DealsCardGridProps {
  cards: DealCard[];
}

export default function DealsCardGrid({ cards }: DealsCardGridProps) {
  if (!cards || cards.length === 0) {
    return null;
  }

  return (
    <section className={styles.section}>
      <div className={styles.grid}>
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className={styles.card}>
            {card.image && (
              <div className={styles.imageWrap}>
                <Image
                  src={card.image.src}
                  alt={card.image.alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className={styles.image}
                />
              </div>
            )}
            <div className={styles.body}>
              {card.heading && <h3 className={styles.heading}>{card.heading}</h3>}
              {card.description && <p className={styles.description}>{card.description}</p>}
              <span className={styles.shopBtn}>{card.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
