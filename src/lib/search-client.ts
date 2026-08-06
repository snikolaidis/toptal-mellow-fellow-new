import { Meilisearch } from 'meilisearch';

export const MAX_QUERY_LENGTH = 200;

const MEILI_HOST = process.env.MEILISEARCH_HOST || '';
const MEILI_SEARCH_KEY = process.env.MEILISEARCH_SEARCH_KEY || '';

let client: Meilisearch | null = null;

export function isSearchConfigured(): boolean {
  return Boolean(MEILI_HOST && MEILI_SEARCH_KEY);
}

// Built on first use rather than as an eager module-scope const: the Meilisearch
// constructor throws on an empty host, which would fail at import time instead of
// letting the caller return its 503.
export function getSearchClient(): Meilisearch {
  if (!client) {
    client = new Meilisearch({ host: MEILI_HOST, apiKey: MEILI_SEARCH_KEY });
  }
  return client;
}

export function capQuery(value: string): string {
  return value.slice(0, MAX_QUERY_LENGTH);
}
