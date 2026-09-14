import { getApolloClient } from '@faustwp/core';
import type { ApolloClient, NormalizedCacheObject } from '@apollo/client';
import merge from 'deepmerge';
import {
  GET_NAV,
  GET_SHOP_MEGA_MENU,
  GET_MEGA_MENU_FEATURED,
} from '@/graphql/queries/menus';
import { GET_ALL_MOODS } from '@/graphql/queries/moods';
import { GET_FOOTER_MENU, GET_FOOTER_MENU_2, GET_SOCIAL_LINKS } from '@/components/Footer/Footer';

const STATE_KEY = '__APOLLO_STATE__';

let menuCacheState: NormalizedCacheObject | null = null;
let menuCacheExpiry = 0;
const MENU_CACHE_TTL = 300_000; // 5 minutes
// Short, not zero: skipping the memo on failure removes the only thing
// throttling concurrent pages, and a build burst gets rate limited.
const MENU_CACHE_TTL_INCOMPLETE = 30_000;

const MENU_QUERIES = [
  ['GetNav', GET_NAV],
  ['GetShopMegaMenu', GET_SHOP_MEGA_MENU],
  ['GetAllMoods', GET_ALL_MOODS],
  ['GetMegaMenuFeatured', GET_MEGA_MENU_FEATURED],
  ['GetFooterMenu', GET_FOOTER_MENU],
  ['GetFooterMenu2', GET_FOOTER_MENU_2],
  ['GetSocialLinks', GET_SOCIAL_LINKS],
] as const;

type MenuQueryName = (typeof MENU_QUERIES)[number][0];

export async function prefetchMenus() {
  const client: ApolloClient<NormalizedCacheObject> = getApolloClient();

  if (menuCacheState && Date.now() < menuCacheExpiry) {
    client.cache.restore(menuCacheState);
    return client;
  }

  const settled = await Promise.all(
    MENU_QUERIES.map(([name, query]) =>
      client.query({ query }).then(
        () => null,
        () => name,
      ),
    ),
  );
  const failed = settled.filter((name): name is MenuQueryName => name !== null);

  // A partial result held for the full TTL is what leaves later pages with half a
  // menu, so an incomplete fetch is memoised only briefly and retried after that.
  menuCacheState = client.cache.extract();
  menuCacheExpiry =
    Date.now() + (failed.length === 0 ? MENU_CACHE_TTL : MENU_CACHE_TTL_INCOMPLETE);

  if (failed.length > 0) {
    console.error(
      `[prefetchMenus] ${failed.length}/${MENU_QUERIES.length} failed (${failed.join(', ')}), retrying in ${MENU_CACHE_TTL_INCOMPLETE / 1000}s`,
    );
  }

  return client;
}

export function mergeMenuState(
  pageProps: Record<string, any>,
  menuClient: ApolloClient<NormalizedCacheObject>,
) {
  const menuState = menuClient.cache.extract();
  const existing = pageProps[STATE_KEY] || {};
  pageProps[STATE_KEY] = merge(existing, menuState, {
    arrayMerge: (_dest: any[], source: any[]) => source,
  });
}
