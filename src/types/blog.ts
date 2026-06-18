export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
}

export interface BlogTag {
  id: string;
  name: string;
  slug: string;
}

export interface BlogFeaturedImage {
  sourceUrl: string;
  altText: string;
  mediaDetails?: {
    width: number;
    height: number;
  };
}

export interface BlogAuthor {
  name: string;
}

export interface BlogPostSeo {
  title?: string;
  metaDesc?: string;
  schema?: { raw: string };
  opengraphTitle?: string;
  opengraphDescription?: string;
  opengraphImage?: { sourceUrl: string };
}

export interface BlogPostCard {
  id: string;
  databaseId: number;
  title: string;
  slug: string;
  excerpt: string;
  date: string;
  featuredImage?: {
    node: BlogFeaturedImage;
  };
  categories: {
    nodes: BlogCategory[];
  };
  tags: {
    nodes: BlogTag[];
  };
  author: {
    node: BlogAuthor;
  };
}

export interface LatestPostCard {
  id: string;
  databaseId: number;
  title: string;
  slug: string;
  date: string;
  featuredImage?: {
    node: {
      sourceUrl: string;
      altText: string;
    };
  };
  tags: {
    nodes: BlogTag[];
  };
}

export interface BlogPost extends BlogPostCard {
  content: string;
  modified: string;
  tags: {
    nodes: BlogTag[];
  };
  seo?: BlogPostSeo;
}
