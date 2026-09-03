/**
 * Server-side Klaviyo Reviews fetching.
 *
 * Called from the PDP's `getStaticProps`, which renders every review into the
 * page; sorting, filtering and search then run client-side over that set, so
 * no request-time endpoint is involved. The private key is read from the
 * environment here and must never be imported into client code.
 */

const KLAVIYO_API = 'https://a.klaviyo.com/api/reviews';
const KLAVIYO_REVISION = '2026-07-15';

/** Aggregate stats across every published rating for a product. */
export interface KlaviyoReviewSummary {
  average: number;
  total: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface KlaviyoReviewsResult {
  summary: KlaviyoReviewSummary;
  reviews: KlaviyoReview[];
}

export interface KlaviyoReview {
  id: string;
  rating: number;
  author: string | null;
  content: string;
  verified: boolean;
  created: string;
  images: string[];
  reply: { content: string; author: string | null; updated: string | null } | null;
}

interface KlaviyoApiReview {
  id: string;
  attributes: {
    rating: number;
    author: string | null;
    content: string | null;
    verified: boolean;
    created: string;
    images?: string[] | null;
    public_reply?: {
      content?: string | null;
      author?: string | null;
      updated?: string | null;
    } | null;
  };
}

// Klaviyo indexes catalog items by a compound id rather than the bare product id
export function toCatalogItemId(productId: string | number): string {
  return `$woocommerce:::$default:::${productId}`;
}

const EMPTY_RESULT: KlaviyoReviewsResult = {
  summary: { average: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
  reviews: [],
};

// The cap is a safety valve against an unbounded walk if that ever changes.
const MAX_PAGES = 5;

/**
 * Fetches every published rating for a product in one pass, then derives two
 * different things from it:
 *
 *  - `summary` — average, total and star distribution across ALL published
 *    ratings, including the star-only ones with no written text.
 *  - `reviews` — every rating, newest first, so the card list matches the total
 *    in the summary above it.
 */
export async function fetchKlaviyoReviews(
  productId: string | number
): Promise<KlaviyoReviewsResult> {
  const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;
  if (!apiKey) {
    console.error('[reviews] KLAVIYO_PRIVATE_API_KEY is not set');
    return EMPTY_RESULT;
  }

  // `status=published` keeps unmoderated (pending) reviews off the storefront.
  const filter = [
    `equals(item.id,"${toCatalogItemId(productId)}")`,
    'equals(status,"published")',
  ].join(',');

  const first = new URL(KLAVIYO_API);
  first.searchParams.set('filter', `and(${filter})`);
  first.searchParams.set('sort', '-created');
  first.searchParams.set('page[size]', '100');

  try {
    const rows: KlaviyoApiReview[] = [];
    let next: string | null = first.toString();

    for (let page = 0; next && page < MAX_PAGES; page += 1) {
      const res: Response = await fetch(next, {
        headers: {
          Authorization: `Klaviyo-API-Key ${apiKey}`,
          revision: KLAVIYO_REVISION,
          accept: 'application/vnd.api+json',
        },
      });

      if (!res.ok) {
        const detail = await res.text();
        console.error('[reviews] Klaviyo responded %s: %s', res.status, detail.slice(0, 300));
        return EMPTY_RESULT;
      }

      const json = (await res.json()) as {
        data?: KlaviyoApiReview[];
        links?: { next?: string | null };
      };

      rows.push(...(json.data || []));
      next = json.links?.next || null;
    }

    if (rows.length === 0) {
      return EMPTY_RESULT;
    }

    const distribution: KlaviyoReviewSummary['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;

    for (const row of rows) {
      const rating = row.attributes.rating;
      sum += rating;
      if (rating >= 1 && rating <= 5) {
        distribution[Math.round(rating) as 1 | 2 | 3 | 4 | 5] += 1;
      }
    }

    // Omit `attributes.email` — Klaviyo returns the reviewer's email address on every review and we must hide it
    const reviews: KlaviyoReview[] = rows
      .map((r) => ({
        id: r.id,
        rating: r.attributes.rating,
        author: r.attributes.author,
        content: (r.attributes.content || '').trim(),
        verified: Boolean(r.attributes.verified),
        created: r.attributes.created,
        images: r.attributes.images || [],
        reply: r.attributes.public_reply?.content
          ? {
              content: r.attributes.public_reply.content,
              author: r.attributes.public_reply.author || null,
              updated: r.attributes.public_reply.updated || null,
            }
          : null,
      }));

    return {
      summary: { average: sum / rows.length, total: rows.length, distribution },
      reviews,
    };
  } catch (error) {
    console.error('[reviews] fetch failed:', error);
    return EMPTY_RESULT;
  }
}
