import { ApolloClient, InMemoryCache, createHttpLink, from } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { RetryLink } from '@apollo/client/link/retry';

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
    max: 8,
    retryIf: (error) => {
      if (!error) return false;
      const status = (error as { statusCode?: number }).statusCode;
      if (typeof status === 'number') return RETRYABLE_STATUS.has(status);
      // Generic network failure (fetch failed, ECONNRESET, socket hang up).
      return true;
    },
  },
});

// Remove trailing slash from WordPress URL and ensure proper path
const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const graphqlEndpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/graphql';

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

export function getClient() {
  if (!client || typeof window === 'undefined') {
    client = new ApolloClient({
      link: from([errorLink, retryLink, httpLink]),
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
// Uses the /api/graphql proxy to avoid CORS issues
let browserClient: ApolloClient<any> | null = null;

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
    // Use the proxy endpoint to avoid CORS issues
    // When switching to production with WordPress CORS config,
    // change this back to: `${wordpressUrl}${graphqlEndpoint}`
    const browserHttpLink = createHttpLink({
      uri: '/api/graphql',
      credentials: 'include',
      fetch: fetchWithCredentials,
    });

    browserClient = new ApolloClient({
      link: from([errorLink, browserHttpLink]),
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
