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

export interface NavMenuItem {
  id: string;
  label: string;
  uri: string;
  childItems?: {
    nodes: NavMenuItem[];
  };
}

export const isRealHref = (uri?: string | null) => !!uri && uri !== '#';
