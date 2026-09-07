import { gql } from '@apollo/client';

// Warmed server-side by prefetchMenus(). Changing any field here changes the
// cache key and the nav silently falls back to a client-side fetch on every page.
export const GET_NAV = gql`
  query GetNav {
    menuItems(where: { location: PRIMARY, parentId: 0 }, first: 100) {
      nodes {
        id
        label
        uri
        childItems {
          nodes {
            id
            label
            uri
          }
        }
      }
    }
  }
`;

// Also warmed by prefetchMenus(). The panel renders only once opened, so an
// unwarmed cache fetches on the click that opens it.
export const GET_SHOP_MEGA_MENU = gql`
  query GetShopMegaMenu {
    menuItems(where: { location: SHOP_MEGA_MENU, parentId: 0 }, first: 100) {
      nodes {
        id
        label
        uri
        childItems {
          nodes {
            id
            label
            uri
          }
        }
      }
    }
  }
`;

const MEGA_MENU_SLIDE_IMAGE = gql`
  fragment MegaMenuSlideImage on AcfMediaItemConnectionEdge {
    node {
      altText
      sourceUrl
      mediaDetails {
        width
        height
      }
    }
  }
`;

export const GET_MEGA_MENU_FEATURED = gql`
  query GetMegaMenuFeatured {
    siteSettings {
      # Without an id Apollo cannot normalise SiteSettings, and this write
      # replaces the footer's socialLinks under the same root field.
      id
      megaMenuFeatured {
        links {
          label
          link {
            url
            title
            target
          }
        }
      }
      # Selected here rather than in a query of its own: a second query writing
      # this same root field is what the id above guards against, and this way
      # the carousel is warm from the one prefetchMenus() request.
      promotionalSlides {
        slides {
          caption
          link {
            url
            title
            target
          }
          desktopImage {
            ...MegaMenuSlideImage
          }
          tabletImage {
            ...MegaMenuSlideImage
          }
          mobileImage {
            ...MegaMenuSlideImage
          }
        }
      }
    }
  }
  ${MEGA_MENU_SLIDE_IMAGE}
`;

export interface MegaMenuFeaturedLink {
  label?: string | null;
  link?: {
    url?: string | null;
    title?: string | null;
    target?: string | null;
  } | null;
}

export interface SlideImageEdge {
  node?: {
    altText?: string | null;
    sourceUrl?: string | null;
    mediaDetails?: { width?: number | null; height?: number | null } | null;
  } | null;
}

/** A row of the shared Promotional Slides group. Every field is optional in ACF. */
export interface PromotionalSlide {
  caption?: string | null;
  link?: {
    url?: string | null;
    title?: string | null;
    target?: string | null;
  } | null;
  desktopImage?: SlideImageEdge | null;
  tabletImage?: SlideImageEdge | null;
  mobileImage?: SlideImageEdge | null;
}

export interface NavMenuItem {
  id: string;
  label: string;
  uri: string;
  childItems?: {
    nodes: NavMenuItem[];
  };
}

export const isRealHref = (uri?: string | null) => !!uri && uri !== '#';
