import Image from 'next/image';
import styles from '@/styles/pages/press-grid.module.css';

export interface NewsArticle {
  id: string;
  title: string | null;
  newsArticleDetails: {
    publicationName: string | null;
    publicationDate: string | null;
    externalUrl: string | null;
    coverImage: {
      node: {
        sourceUrl: string | null;
        altText: string | null;
      } | null;
    } | null;
  } | null;
}

interface PressGridProps {
  articles: NewsArticle[];
}

function formatPublicationDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = date.toLocaleString('en-US', { timeZone: 'UTC', month: 'long' });
  const year = date.toLocaleString('en-US', { timeZone: 'UTC', year: 'numeric' });
  return `${month}, ${year}`;
}

export default function PressGrid({ articles }: PressGridProps) {
  if (!articles || articles.length === 0) {
    return null;
  }

  return (
    <section className={styles.pressSection}>
      <h2 className={styles.heading}>In the News</h2>
      <div className={styles.grid}>
        {articles.map((article) => {
          const details = article.newsArticleDetails;
          if (!details) {
            return null;
          }
          const image = details.coverImage?.node;
          const formattedDate = formatPublicationDate(details.publicationDate);
          return (
            <a
              key={article.id}
              href={details.externalUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.card}
            >
              {image?.sourceUrl && (
                <Image
                  src={image.sourceUrl}
                  alt={image.altText || details.publicationName || ''}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className={styles.image}
                />
              )}
              <span className={styles.scrim} aria-hidden="true" />
              <div className={styles.content}>
                {details.publicationName && (
                  <span className={styles.publication}>{details.publicationName}</span>
                )}
                {formattedDate && (
                  <span className={styles.date}>{formattedDate}</span>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
