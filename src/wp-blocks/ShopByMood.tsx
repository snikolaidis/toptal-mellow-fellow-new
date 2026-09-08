import { fragments } from './ShopByMood.fragments';
import Image from 'next/image';
import Link from 'next/link';
import { decodeEntities } from '@/lib/decodeEntities';

interface MediaItem {
  id?: string;
  altText?: string | null;
  sourceUrl?: string | null;
  mediaDetails?: { width?: number | null; height?: number | null } | null;
}

interface MoodTerm {
  databaseId?: number | null;
  name?: string | null;
  slug?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
}

interface MoodCard {
  image?: { node?: MediaItem | null } | null;
  label?: string | null;
  link?: { url?: string | null; title?: string | null; target?: string | null } | null;
}

const COVER_STYLE = { objectFit: 'cover' } as const;

interface ShopByMoodProps {
  moodTerms?: MoodTerm[] | null;
  shopByMood?: {
    heading?: string | null;
    subheading?: string | null;
    cards?: MoodCard[] | null;
  } | null;
}

function termToCard(term: MoodTerm): MoodCard | null {
  if (!term.slug || !term.name) return null;
  return {
    label: term.name,
    image: term.imageUrl ? { node: { sourceUrl: term.imageUrl, altText: term.imageAlt ?? '' } } : null,
    link: { url: `/moods/${term.slug}`, title: term.name, target: '' },
  };
}

function CardInner({ card }: { card: MoodCard }) {
  const image = card.image?.node;

  return (
    <>
      {image?.sourceUrl && (
        <Image
          className="shop-by-mood__image"
          src={image.sourceUrl}
          alt={image.altText || ''}
          fill
          sizes="(max-width: 767px) 50vw, 33vw"
          style={COVER_STYLE}
        />
      )}
      {card.label && (
        <span className="shop-by-mood__label">{decodeEntities(card.label)}</span>
      )}
    </>
  );
}

export default function ShopByMood(props: ShopByMoodProps) {
  const { shopByMood } = props;
  const fromTerms = (props.moodTerms ?? []).map(termToCard).filter(Boolean) as MoodCard[];
  const cards = fromTerms.length > 0 ? fromTerms : shopByMood?.cards ?? [];

  if (!shopByMood || cards.length === 0) {
    return null;
  }

  const { heading, subheading } = shopByMood;

  return (
    <section className="shop-by-mood">
      {heading && <h2 className="shop-by-mood__heading">{heading}</h2>}
      {subheading && <p className="shop-by-mood__subheading">{subheading}</p>}

      <div className="shop-by-mood__grid">
        {cards.map((card, i) =>
          card.link?.url ? (
            <Link
              key={i}
              href={card.link.url}
              target={card.link.target || undefined}
              rel={card.link.target === '_blank' ? 'noopener noreferrer' : undefined}
              className="shop-by-mood__card"
            >
              <CardInner card={card} />
            </Link>
          ) : (
            <div key={i} className="shop-by-mood__card">
              <CardInner card={card} />
            </div>
          )
        )}
      </div>
    </section>
  );
}

ShopByMood.displayName = 'AcfShopByMood';

ShopByMood.fragments = fragments;
