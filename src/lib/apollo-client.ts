import { ApolloClient, InMemoryCache, createHttpLink, from } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { RetryLink } from '@apollo/client/link/retry';
import { createRegisterFirstPersistedQueryLink } from './persistedQueryLink';

// WP Engine sits behind Cloudflare/nginx, which return 429 (rate limit) and
// 504 (gateway timeout) when the static build hammers GraphQL with many
// concurrent requests. Retry those transient failures with backoff so a single
// blip does not fail the whole build.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const retryLink = new RetryLink({
  delay: (count, _operation, error) => {
    const retryAfter = Number(
      (error as { response?: { headers?: { get?: (k: string) => string | null } } })?.response
        ?.headers?.get?.('retry-after')
    );
    if (retryAfter && !Number.isNaN(retryAfter)) {
      return Math.min(retryAfter * 1000, 30000);
    }
    const base = Math.min(1500 * 2 ** (count - 1), 30000);
    return base / 2 + Math.random() * (base / 2);
  },
  attempts: {
    max: 5,
    retryIf: (error) => {
      if (!error) return false;
      const status = (error as { statusCode?: number }).statusCode;
      if (typeof status === 'number') return RETRYABLE_STATUS.has(status);
      // Skip retries on SSL/certificate errors (local dev with self-signed certs)
      const msg = String((error as any)?.message || '');
      if (msg.includes('SSL') || msg.includes('certificate') || msg.includes('self-signed')) return false;
      // Retry generic network errors in production builds (WPEngine can be flaky)
      if (typeof window === 'undefined') return true;
      return false;
    },
  },
});

// Remove trailing slash from WordPress URL and ensure proper path
const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const graphqlEndpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/graphql';

// Do not add `useGETForQueries`: it overrides context after merge, so it would
// rewrite the registration POST to GET and put oversized documents in the URL.
const httpLink = createHttpLink({
  uri: `${wordpressUrl}${graphqlEndpoint}`,
  credentials: 'include',
});

const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path }) =>
      console.error(
        `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`
      )
    );
  }
  if (networkError) {
    console.error(`[Network error]: ${networkError}`);
  }
});

let client: ApolloClient<any> | null = null;

// Keep retryLink below this one: inverted, the registration POST runs inside the
// persisted-query link's forward and never gets the 429/5xx backoff.
const persistedQueryLink = createRegisterFirstPersistedQueryLink();

export function getClient() {
  if (!client || typeof window === 'undefined') {
    client = new ApolloClient({
      link: from([errorLink, persistedQueryLink, retryLink, httpLink]),
      cache: new InMemoryCache({
        typePolicies: {
          Product: {
            keyFields: ['databaseId'],
          },
          SimpleProduct: {
            keyFields: ['databaseId'],
          },
          VariableProduct: {
            keyFields: ['databaseId'],
          },
        },
      }),
      defaultOptions: {
        watchQuery: {
          fetchPolicy: 'cache-and-network',
        },
        query: {
          fetchPolicy: 'network-only',
          errorPolicy: 'all',
        },
      },
    });
  }
  return client;
}

// Browser-only client for mutations and cart operations
let browserClient: ApolloClient<any> | null = null;

const browserRetryLink = new RetryLink({
  delay: (count) => Math.min(1000 * 2 ** (count - 1), 8000),
  attempts: {
    max: 3,
    retryIf: (error) => {
      const status = (error as { statusCode?: number }).statusCode;
      return typeof status === 'number' && (status === 502 || status === 503 || status === 504);
    },
  },
});

// Custom fetch that ensures credentials are always included
const fetchWithCredentials = (
  uri: RequestInfo | URL,
  options?: RequestInit
): Promise<Response> => {
  return fetch(uri, {
    ...options,
    credentials: 'include',
  });
};

export function getBrowserClient() {
  if (typeof window === 'undefined') {
    throw new Error('getBrowserClient can only be used in the browser');
  }

  if (!browserClient) {
    const browserHttpLink = createHttpLink({
      uri: '/api/graphql',
      credentials: 'include',
      fetch: fetchWithCredentials,
    });

    browserClient = new ApolloClient({
      link: from([errorLink, browserRetryLink, browserHttpLink]),
      cache: new InMemoryCache(),
      defaultOptions: {
        watchQuery: {
          fetchPolicy: 'cache-and-network',
        },
        query: {
          fetchPolicy: 'network-only',
        },
        mutate: {
          fetchPolicy: 'no-cache',
        },
      },
    });
  }

  return browserClient;
}

// Reset the browser client (useful for clearing cache after logout, etc.)
export function resetBrowserClient() {
  if (browserClient) {
    browserClient.clearStore();
    browserClient = null;
  }
}
