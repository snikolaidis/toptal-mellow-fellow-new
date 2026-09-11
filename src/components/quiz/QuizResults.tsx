import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import QuizResultCard from './QuizResultCard';
import { Product } from '@/types/woocommerce';

interface QuizResultsProps {
  heading?: string | null;
  name?: string | null;
  topMatches: Product[];
  alsoLike: Product[];
  loading: boolean;
  error: boolean;
  onRetake: () => void;
}

export default function QuizResults({
  heading,
  name,
  topMatches,
  alsoLike,
  loading,
  error,
  onRetake,
}: QuizResultsProps) {
  const baseHeading = heading || 'Your Matches';
  const displayHeading = name ? `${baseHeading}, ${name}` : baseHeading;

  return (
    <div className="quiz-results">
      <h2 className="quiz-results__heading">{displayHeading}</h2>

      {loading ? (
        <div className="quiz-results__loading">
          <span className="spinner quiz-results__spinner" aria-hidden="true" />
          <p>Finding your matches…</p>
        </div>
      ) : (
        <>
          {error && (
            <p className="quiz-results__error">
              We could not load your matches right now. Browse the full range instead.
            </p>
          )}

          {topMatches.length > 0 && (
            <div className="quiz-results__grid">
              {topMatches.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  priority={index < 4}
                />
              ))}
            </div>
          )}

          {alsoLike.length > 0 && (
            <section className="quiz-results__also">
              <h3 className="quiz-results__also-heading">You may also like</h3>
              <div className="quiz-results__also-row">
                {alsoLike.map((product) => (
                  <QuizResultCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <div className="quiz-results__actions">
        <button type="button" className="btn-secondary" onClick={onRetake}>
          Retake Quiz
        </button>
        <Link href="/shop" className="btn-primary">
          Shop All Products
        </Link>
      </div>
    </div>
  );
}
