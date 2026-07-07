export interface CollectionCard {
  id: number;
  smallText: string;
  bigText: string;
  link: string;
  image: string;
}

export interface EditorBlock {
  __typename?: string;
  renderedHtml: string | null;
}

export interface ContentPageData {
  title: string;
  slug: string;
  editorBlocks?: EditorBlock[];
  seo?: {
    title?: string;
    metaDesc?: string;
  };
}

interface LandingPageMediaItem {
  altText?: string | null;
  sourceUrl?: string | null;
  mediaDetails?: { width?: number | null; height?: number | null } | null;
}

interface LandingPageImageSlot {
  node?: LandingPageMediaItem | null;
}

export interface LandingPageHeroImage {
  mobileImage?: LandingPageImageSlot | null;
  tabletImage?: LandingPageImageSlot | null;
  desktopImage?: LandingPageImageSlot | null;
  link?: { url?: string | null; title?: string | null; target?: string | null } | null;
  borderRadius?: number | null;
  width?: string | null;
  eagerLoad?: boolean | null;
}

export interface LandingPageCollectionGroupItem {
  titleOverride?: string | null;
  collection?: {
    nodes?: {
      name?: string | null;
      slug?: string | null;
      uri?: string | null;
      collectionFields?: {
        thumbnailImage?: LandingPageImageSlot | null;
      } | null;
    }[] | null;
  } | null;
}

export interface LandingPageCollectionGroup {
  heading?: string | null;
  productCount?: number | null;
  showThumbnail?: boolean | null;
  showProductsSlider?: boolean | null;
  items?: LandingPageCollectionGroupItem[] | null;
}

export interface LandingPageSettings {
  heroImage?: LandingPageHeroImage | null;
  collectionGroup?: LandingPageCollectionGroup | null;
}