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

export async function prefetchMenus() {
  const client: ApolloClient<NormalizedCacheObject> = getApolloClient();

  const now = Date.now();
  if (menuCacheState && now < menuCacheExpiry) {
    client.cache.restore(menuCacheState);
    return client;
  }

  await Promise.all([
    client.query({ query: GET_NAV }).catch(() => null),
    client.query({ query: GET_SHOP_MEGA_MENU }).catch(() => null),
    client.query({ query: GET_ALL_MOODS }).catch(() => null),
    client.query({ query: GET_MEGA_MENU_FEATURED }).catch(() => null),
    client.query({ query: GET_FOOTER_MENU }).catch(() => null),
    client.query({ query: GET_FOOTER_MENU_2 }).catch(() => null),
    client.query({ query: GET_SOCIAL_LINKS }).catch(() => null),
  ]);

  menuCacheState = client.cache.extract();
  menuCacheExpiry = now + MENU_CACHE_TTL;

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
