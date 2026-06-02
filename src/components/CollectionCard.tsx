import Link from 'next/link';
import { CollectionCard as CollectionCardType } from '@/types/mellow-fellow';

interface CollectionCardProps {
  card: CollectionCardType
}

export default function CollectionCard({ card }: CollectionCardProps) {

  return (
    <div className="collection-card">
      <Link href={ card.link }>
        <img className="collection-card__image" src={ card.image } alt="" width="800" />
        
        <h4 className="collection-card__title">
          <span className="collection-card__big-text">
            { card.bigText }
          </span>
          <span className="collection-card__small-text">
            { card.smallText }
          </span>
        </h4>
      </Link>
    </div>
  );
}