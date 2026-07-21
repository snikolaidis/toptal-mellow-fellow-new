import { getApolloClient } from '@faustwp/core';
import type { ApolloClient, NormalizedCacheObject } from '@apollo/client';
import merge from 'deepmerge';
import { GET_NAV } from '@/components/NavBar/NavBar';
import { GET_FOOTER_MENU, GET_FOOTER_MENU_2, GET_SOCIAL_LINKS } from '@/components/Footer/Footer';

const STATE_KEY = '__APOLLO_STATE__';

export async function prefetchMenus() {
  const client: ApolloClient<NormalizedCacheObject> = getApolloClient();
  await Promise.all([
    client.query({ query: GET_NAV }).catch(() => null),
    client.query({ query: GET_FOOTER_MENU }).catch(() => null),
    client.query({ query: GET_FOOTER_MENU_2 }).catch(() => null),
    client.query({ query: GET_SOCIAL_LINKS }).catch(() => null),
  ]);
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
