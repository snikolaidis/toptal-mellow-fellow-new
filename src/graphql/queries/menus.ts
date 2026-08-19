import { gql } from '@apollo/client';

// Warmed server-side by prefetchMenus(). Changing any field here changes the
// cache key and the nav silently falls back to a client-side fetch on every page.
export const GET_NAV = gql`
  query {
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
      }
    }
  }
`;

export interface NavMenuItem {
  id: string;
  label: string;
  uri: string;
  childItems?: {
    nodes: NavMenuItem[];
  };
}

export const isRealHref = (uri?: string | null) => !!uri && uri !== '#';
