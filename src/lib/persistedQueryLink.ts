import { ApolloLink, Observable } from '@apollo/client';
import type { DocumentNode, FetchResult, NextLink, Operation } from '@apollo/client';
import { print } from '@apollo/client/utilities';

/**
 * Not createPersistedQueryLink: it sends the hash first, and this install caches
 * the resulting PersistedQueryNotFound for 600s, so every later GET is served the
 * stale error and the full POST runs anyway. Measured against production: hash
 * first never hit the cache once. Register first instead.
 */

const PERSISTED_QUERY_VERSION = 1;

/** Matches the max-age the edge puts on the cached not-found. */
const NOT_FOUND_BACKOFF_MS = 10 * 60 * 1000;

type DocumentState = {
  registered: boolean;
  getBlockedUntil: number;
};

const documents = new Map<string, DocumentState>();
const hashes = new WeakMap<DocumentNode, Promise<string>>();

let persistedQueriesSupported = true;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Must hash the same printed string HttpLink puts in the body, or the server saves under a different hash. */
function hashFor(query: DocumentNode): Promise<string> {
  let hash = hashes.get(query);
  if (!hash) {
    hash = sha256Hex(print(query));
    hashes.set(query, hash);
  }
  return hash;
}

function isMutation(operation: Operation): boolean {
  return operation.query.definitions.some(
    (definition) => definition.kind === 'OperationDefinition' && definition.operation === 'mutation'
  );
}

function readPersistedQueryError(result: FetchResult): 'not-found' | 'not-supported' | null {
  const errors = result.errors ?? [];
  for (const error of errors) {
    const code = typeof error.extensions?.code === 'string' ? error.extensions.code : '';
    if (error.message === 'PersistedQueryNotFound' || code === 'PERSISTED_QUERY_NOT_FOUND') {
      return 'not-found';
    }
    if (error.message === 'PersistedQueryNotSupported' || code === 'PERSISTED_QUERY_NOT_SUPPORTED') {
      return 'not-supported';
    }
  }
  return null;
}

function sendAsRegistration(operation: Operation, hash: string): void {
  operation.extensions.persistedQuery = {
    version: PERSISTED_QUERY_VERSION,
    sha256Hash: hash,
  };
  operation.setContext({
    http: { includeQuery: true, includeExtensions: true },
    fetchOptions: { method: 'POST' },
  });
}

function sendAsHashedGet(operation: Operation, hash: string): void {
  operation.extensions.persistedQuery = {
    version: PERSISTED_QUERY_VERSION,
    sha256Hash: hash,
  };
  operation.setContext({
    http: { includeQuery: false, includeExtensions: true },
    fetchOptions: { method: 'GET' },
  });
}

function sendAsPlainPost(operation: Operation): void {
  delete operation.extensions.persistedQuery;
  operation.setContext({
    http: { includeQuery: true, includeExtensions: false },
    fetchOptions: { method: 'POST' },
  });
}

export function createRegisterFirstPersistedQueryLink(): ApolloLink {
  return new ApolloLink((operation: Operation, forward: NextLink) => {
    if (isMutation(operation)) {
      return forward(operation);
    }

    return new Observable<FetchResult>((observer) => {
      let subscription: ReturnType<ReturnType<NextLink>['subscribe']> | undefined;
      let cancelled = false;

      hashFor(operation.query)
        .then((hash) => {
          if (cancelled) return;

          if (!persistedQueriesSupported) {
            sendAsPlainPost(operation);
            subscription = forward(operation).subscribe(observer);
            return;
          }

          const state = documents.get(hash);
          const canUseGet = !!state?.registered && Date.now() >= state.getBlockedUntil;

          if (canUseGet) {
            sendAsHashedGet(operation, hash);
          } else {
            sendAsRegistration(operation, hash);
          }

          subscription = forward(operation).subscribe({
            next: (result) => {
              const problem = readPersistedQueryError(result);

              if (!problem) {
                if (!canUseGet) {
                  documents.set(hash, { registered: true, getBlockedUntil: 0 });
                }
                observer.next(result);
                return;
              }

              if (problem === 'not-supported') {
                persistedQueriesSupported = false;
              } else {
                documents.set(hash, {
                  registered: true,
                  getBlockedUntil: Date.now() + NOT_FOUND_BACKOFF_MS,
                });
              }

              subscription?.unsubscribe();
              if (persistedQueriesSupported) {
                sendAsRegistration(operation, hash);
              } else {
                sendAsPlainPost(operation);
              }
              subscription = forward(operation).subscribe(observer);
            },
            error: observer.error.bind(observer),
            complete: observer.complete.bind(observer),
          });
        })
        .catch((error) => {
          if (!cancelled) observer.error(error);
        });

      return () => {
        cancelled = true;
        subscription?.unsubscribe();
      };
    });
  });
}
