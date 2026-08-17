import { BlogPostCard } from '@/types/blog';

interface MediaNode {
  node?: {
    sourceUrl: string;
    altText?: string;
  } | null;
}

export interface MoodFields {
  moodHeroDesktop?: MediaNode | null;
  moodHeroMobile?: MediaNode | null;
  warningMessage?: string | null;
  faqSectionTitle?: string | null;
  faqs?: { nodes: Array<{ id: string; title: string; content: string }> };
  thumbnailImage?: MediaNode | null;
}

export interface MoodPill {
  name: string;
  slug: string;
}

// relatedCollections / relatedCollectionTitle are omitted on purpose. The
// endpoint resolves that ACF relationship inside the current taxonomy
// (mellow-fellow-collection-meta.php:126), so on a mood term it returns other
// moods while the collection page's tiles link to /collections/<slug>.
export interface Mood {
  id: string;
  databaseId: number;
  name: string;
  slug: string;
  description?: string;
  count?: number;
  moodFields?: MoodFields;
  relatedPosts?: BlogPostCard[];
  seo?: {
    title?: string;
    metaDesc?: string;
    schema?: { raw?: string };
    opengraphTitle?: string;
    opengraphDescription?: string;
    opengraphImage?: { sourceUrl?: string };
  };
}
