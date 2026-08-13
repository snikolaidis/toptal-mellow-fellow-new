import { fragments } from './QuizHero.fragments';
import Image from 'next/image';
import Link from 'next/link';

interface MediaItem {
  id?: string;
  altText?: string | null;
  sourceUrl?: string | null;
  mediaDetails?: { width?: number | null; height?: number | null } | null;
}

interface QuizHeroProps {
  quizHero?: {
    eyebrow?: string | null;
    heading?: string | null;
    subheading?: string | null;
    ctaButton?: { url?: string | null; title?: string | null; target?: string | null } | null;
    ctaHighlight?: string | null;
    mobileImage?: { node?: MediaItem | null } | null;
  } | null;
}

const DEFAULT_MOBILE_IMAGE = '/quiz-hero-can-pineapple-orange.webp';

const COVER_STYLE = { objectFit: 'cover', objectPosition: 'center' } as const;

export default function QuizHero(props: QuizHeroProps) {
  const { quizHero } = props;

  if (!quizHero) {
    return null;
  }

  const { eyebrow, heading, subheading, ctaButton, ctaHighlight, mobileImage } = quizHero;
  const mobileImageUrl = mobileImage?.node?.sourceUrl || DEFAULT_MOBILE_IMAGE;

  return (
    <section className="quiz-hero">
      <div className="quiz-hero__media" aria-hidden="true">
        <Image
          src={mobileImageUrl}
          alt=""
          fill
          sizes="100vw"
          style={COVER_STYLE}
        />
      </div>

      <div className="quiz-hero__content">
        {eyebrow && <p className="quiz-hero__eyebrow">{eyebrow}</p>}
        {heading && <h1 className="quiz-hero__heading">{heading}</h1>}
        {subheading && <p className="quiz-hero__subheading">{subheading}</p>}

        {ctaButton?.url && (
          <Link
            href={ctaButton.url}
            target={ctaButton.target || undefined}
            rel={ctaButton.target === '_blank' ? 'noopener noreferrer' : undefined}
            className="quiz-hero__cta"
          >
            <span className="quiz-hero__cta-label">{ctaButton.title}</span>
            {ctaHighlight && (
              <>
                {' '}
                <span className="quiz-hero__cta-highlight">{ctaHighlight}</span>
              </>
            )}
          </Link>
        )}
      </div>
    </section>
  );
}

QuizHero.displayName = 'AcfQuizHero';

QuizHero.fragments = fragments;
