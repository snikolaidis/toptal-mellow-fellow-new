import { Meilisearch } from 'meilisearch';

export const PRODUCTS_INDEX = 'products';
export const COLLECTIONS_INDEX = 'collections';
export const POSTS_INDEX = 'posts';

// Per request, not per page fetch. Each attempt builds its own signal, never a
// shared one hoisted out of the loop: the clock starts when the signal is
// constructed, so a single signal would give every page one shared budget.
// Products pages five times at 456 products and runs 25 to 48 seconds in total,
// so a shared signal would abort it partway through.
const REQUEST_TIMEOUT_MS = 30_000;

// A healthy page returns in about 5 seconds, so 30s is already a 6x margin and
// the failures are transient spikes rather than a budget that is too tight.
// Three attempts, because the one observed failure recovered within seconds.
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 1_000;
const RETRY_CAP_MS = 8_000;

// Ceiling across every attempt of every page in one index, so a backend that is
// slow rather than down cannot sit in backoff indefinitely. Sized well clear of
// a healthy run and well inside the workflow's timeout-minutes: 10.
const FETCH_DEADLINE_MS = 5 * 60_000;

/** A failure no later attempt can resolve. Thrown to skip the retry loop. */
class NonRetryableError extends Error {}

// 5xx, 408 and 429 can plausibly differ next time. Every other 4xx is
// deterministic: retrying a malformed query or a rejected key three times only
// burns the deadline and buries the message that says what is actually wrong.
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

// Retry-After is either delta-seconds or an HTTP date.
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000);
  }

  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

// Full jitter: uniform across the whole window rather than clustered near the
// ceiling, so retries from concurrent callers do not line up.
function backoffWithFullJitter(attempt: number): number {
  const ceiling = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** (attempt - 1));
  return Math.random() * ceiling;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST a GraphQL document, retrying only failures a later attempt could
 * resolve. Shared by all three indexes.
 *
 * A 200 carrying a GraphQL `errors` array is not retried here: the caller
 * inspects it, because a rejected field is deterministic.
 */
async function postGraphQL<T>(
  wpUrl: string,
  query: string,
  variables: Record<string, unknown>,
  deadlineAt: number,
  label: string
): Promise<T> {
  let lastError: Error = new Error('request never attempted');

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    let retryAfterMs: number | null = null;

    try {
      const res = await fetch(`${wpUrl}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (res.ok) {
        return (await res.json()) as T;
      }

      if (!isRetryableStatus(res.status)) {
        throw new NonRetryableError(`WordPress responded ${res.status}`);
      }

      retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
      lastError = new Error(`WordPress responded ${res.status}`);
    } catch (error) {
      if (error instanceof NonRetryableError) throw error;
      // Timeout, transport failure, or an unparseable body. All worth retrying.
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (attempt === RETRY_ATTEMPTS) break;

    const waitMs = retryAfterMs ?? backoffWithFullJitter(attempt);

    if (Date.now() + waitMs >= deadlineAt) {
      throw new Error(
        `${lastError.message} (deadline reached after ${attempt} attempt(s))`
      );
    }

    // Logged, never swallowed: a backend degrading toward failure has to stay
    // visible in the run output even on nights the retry succeeds.
    console.warn(
      `  ${label}: attempt ${attempt} of ${RETRY_ATTEMPTS} failed (${lastError.message}), retrying in ${Math.round(waitMs)}ms`
    );
    await sleep(waitMs);
  }

  throw new Error(`${lastError.message} (after ${RETRY_ATTEMPTS} attempts)`);
}

// A fragment, not a spliced string: the loader strips interpolations, leaving an
// empty selection set. The four below are not on Product, so they sit per branch.
const PRODUCT_FIELDS = /* GraphQL */ `
  fragment ReindexProductFields on Product {
    id databaseId name slug type date
    description shortDescription sku
    image { id sourceUrl altText }
    collections { nodes { name slug } }
    strainTypes { nodes { name slug } }
    strainNames { nodes { name slug } }
    blendTypes { nodes { name slug } }
    productLines { nodes { name slug } }
    size { nodes { name slug } }
    mfproductTypes { nodes { name slug } }
    cannabinoids { nodes { name slug } }
    singleCannabinoid { nodes { name slug } }
    mG { nodes { name slug } }
    pieces { nodes { name slug } }
    bbBundleMode
    bbFromPrice
    bbShowPrice
    bbFixedPrice
    bbFixedOriginalPrice
    uniqueSellingProps { nodes { id name uniqueSellingFields { propIcon { node { sourceUrl altText } } } } }
  }
`;

const PRODUCT_QUERY = /* GraphQL */ `
  query ReindexProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, where: { status: "publish" }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        __typename
        ... on SimpleProduct { ...ReindexProductFields price regularPrice salePrice stockStatus }
        ... on VariableProduct { ...ReindexProductFields price regularPrice salePrice stockStatus }
      }
    }
  }
  ${PRODUCT_FIELDS}
`;

const TAXONOMY_FIELDS: Array<{ source: string; key: string }> = [
  { source: 'mfproductTypes', key: 'productType' },
  { source: 'size', key: 'size' },
  { source: 'strainTypes', key: 'strainType' },
  { source: 'blendTypes', key: 'blendType' },
  { source: 'cannabinoids', key: 'cannabinoid' },
  { source: 'singleCannabinoid', key: 'singleCannabinoid' },
  { source: 'mG', key: 'mg' },
  { source: 'pieces', key: 'pieces' },
  { source: 'collections', key: 'collection' },
];

const DISPLAY_TAXONOMY_FIELDS: Array<{ source: string; key: string }> = [
  { source: 'strainNames', key: 'strainName' },
  { source: 'productLines', key: 'productLine' },
];

const SEARCHABLE_ATTRIBUTES = [
  'name',
  'sku',
  ...TAXONOMY_FIELDS.map((t) => `${t.key}Names`),
  'shortDescription',
  'description',
];

const FILTERABLE_ATTRIBUTES = [
  ...TAXONOMY_FIELDS.map((t) => `${t.key}Slugs`),
  'stockStatus',
];

const SORTABLE_ATTRIBUTES = ['priceNumber', 'name', 'date'];

const DISPLAYED_ATTRIBUTES = [
  'databaseId',
  'id',
  'name',
  'slug',
  'type',
  'date',
  'price',
  'regularPrice',
  'salePrice',
  'stockStatus',
  'image',
  'bbBundleMode',
  'bbFromPrice',
  'bbShowPrice',
  'bbFixedPrice',
  'bbFixedOriginalPrice',
  'uniqueSellingProps',
  ...TAXONOMY_FIELDS.flatMap((t) => [`${t.key}Slugs`, `${t.key}Names`]),
  ...DISPLAY_TAXONOMY_FIELDS.flatMap((t) => [`${t.key}Slugs`, `${t.key}Names`]),
];

const COLLECTION_QUERY = /* GraphQL */ `
  query ReindexCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { databaseId name slug count }
    }
  }
`;

const COLLECTION_SEARCHABLE_ATTRIBUTES = ['name'];

const COLLECTION_FILTERABLE_ATTRIBUTES: string[] = [];

const COLLECTION_SORTABLE_ATTRIBUTES = ['count'];

const COLLECTION_DISPLAYED_ATTRIBUTES = ['databaseId', 'name', 'slug', 'count'];

const COLLECTION_SYNONYMS: Record<string, string[]> = {};

const POST_QUERY = /* GraphQL */ `
  query ReindexPosts($first: Int!, $after: String) {
    posts(first: $first, after: $after, where: { status: PUBLISH }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        databaseId
        title
        slug
        date
        excerpt
        content
        featuredImage { node { sourceUrl altText } }
      }
    }
  }
`;

const POST_SEARCHABLE_ATTRIBUTES = ['title', 'excerpt', 'content'];

const POST_FILTERABLE_ATTRIBUTES: string[] = [];

const POST_SORTABLE_ATTRIBUTES = ['date'];

const POST_DISPLAYED_ATTRIBUTES = [
  'databaseId',
  'title',
  'slug',
  'date',
  'excerpt',
  'featuredImage',
];

const POST_SYNONYMS: Record<string, string[]> = {};

const SYNONYM_GROUPS: string[][] = [
  ['butter', 'budder', 'badder', 'dab', 'dabs'],
  ['ingestable', 'ingestible', 'edible', 'edibles'],
  ['510', 'eliquid', 'cartridge', 'cartridges'],
  ['baterry', 'battery'],
];

// Deliberately one-directional, and deliberately not a group. Meilisearch matches
// by prefix, so a term sitting mid-token is unreachable: "cbd" never finds h4cbd,
// "berry" never finds strawberry. The reverse must not hold, or searching h4cbd
// returns all 287 CBD products. A group cannot express that, because the reducer
// below expands every member to every other.
const SYNONYM_EXPANSIONS: Record<string, string[]> = {
  cbd: ['h4cbd'],
  berry: ['strawberry', 'blueberry', 'raspberry', 'blackberry'],
};

const GROUPED_SYNONYMS = SYNONYM_GROUPS.reduce<Record<string, string[]>>((acc, group) => {
  for (const term of group) {
    acc[term] = [...(acc[term] || []), ...group.filter((other) => other !== term)];
  }
  return acc;
}, {});

const SYNONYMS = Object.entries(SYNONYM_EXPANSIONS).reduce<Record<string, string[]>>(
  (acc, [term, expansions]) => {
    acc[term] = [...(acc[term] || []), ...expansions].filter(
      (value, index, all) => all.indexOf(value) === index
    );
    return acc;
  },
  { ...GROUPED_SYNONYMS }
);

interface TaxonomyNode {
  name?: string | null;
  slug?: string | null;
}

interface TaxonomyConnection {
  nodes?: TaxonomyNode[] | null;
}

interface WooProduct {
  id?: string | null;
  databaseId?: number | null;
  name?: string | null;
  slug?: string | null;
  date?: string | null;
  sku?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  price?: string | null;
  regularPrice?: string | null;
  salePrice?: string | null;
  stockStatus?: string | null;
  image?: { sourceUrl?: string | null; altText?: string | null } | null;
  [key: string]: unknown;
}

interface ProductDocument {
  databaseId: number;
  id: string | null;
  name: string;
  slug: string;
  date: string | null;
  sku: string | null;
  description: string;
  shortDescription: string;
  price: string | null;
  regularPrice: string | null;
  salePrice: string | null;
  priceNumber: number;
  stockStatus: string;
  image: { sourceUrl: string | null; altText: string | null };
  [key: string]: unknown;
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePriceNumber(price: string | null | undefined): number {
  if (!price) return 0;
  const match = price.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : 0;
}

function toDocument(product: WooProduct): ProductDocument {
  const doc: ProductDocument = {
    databaseId: product.databaseId as number,
    id: product.id ?? null,
    name: product.name ?? '',
    slug: product.slug ?? '',
    type: (product.type as string | null | undefined) ?? null,
    date: product.date ?? null,
    sku: product.sku ?? null,
    description: stripHtml(product.description),
    shortDescription: stripHtml(product.shortDescription),
    price: product.price ?? null,
    regularPrice: product.regularPrice ?? null,
    salePrice: product.salePrice ?? null,
    priceNumber: parsePriceNumber(product.price),
    stockStatus: product.stockStatus ?? 'IN_STOCK',
    image: {
      sourceUrl: product.image?.sourceUrl ?? null,
      altText: product.image?.altText ?? null,
    },
    bbBundleMode: (product.bbBundleMode as string | null | undefined) ?? null,
    bbFromPrice: (product.bbFromPrice as number | null | undefined) ?? null,
    bbShowPrice: (product.bbShowPrice as boolean | null | undefined) ?? null,
    bbFixedPrice: (product.bbFixedPrice as number | null | undefined) ?? null,
    bbFixedOriginalPrice: (product.bbFixedOriginalPrice as number | null | undefined) ?? null,
    uniqueSellingProps: (product.uniqueSellingProps as unknown) ?? null,
  };

  for (const { source, key } of [...TAXONOMY_FIELDS, ...DISPLAY_TAXONOMY_FIELDS]) {
    const connection = product[source] as TaxonomyConnection | null | undefined;
    const nodes = connection?.nodes || [];
    doc[`${key}Slugs`] = nodes.map((n) => n?.slug).filter((s): s is string => !!s);
    doc[`${key}Names`] = nodes.map((n) => n?.name).filter((n): n is string => !!n);
  }

  return doc;
}

interface ProductsConnection {
  pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
  nodes?: WooProduct[] | null;
}

interface ProductsResponse {
  errors?: Array<{ message: string }> | null;
  data?: { products?: ProductsConnection | null } | null;
}

async function fetchAllProducts(wpUrl: string): Promise<ProductDocument[]> {
  const documents: ProductDocument[] = [];
  const deadlineAt = Date.now() + FETCH_DEADLINE_MS;
  let after: string | null = null;

  for (;;) {
    // Annotated, not inferred: `after` is reassigned from this value further
    // down, which is enough for the checker to call the inference circular.
    const json: ProductsResponse = await postGraphQL<ProductsResponse>(
      wpUrl,
      PRODUCT_QUERY,
      { first: 100, after },
      deadlineAt,
      'products'
    );

    if (json.errors && json.errors.length > 0) {
      throw new Error(`GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`);
    }

    const connection: ProductsConnection | null | undefined = json.data?.products;
    if (!connection) {
      throw new Error('GraphQL response missing products connection');
    }

    for (const node of connection.nodes || []) {
      if (typeof node?.databaseId === 'number') {
        documents.push(toDocument(node));
      }
    }

    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor ?? null;
  }

  return documents;
}

interface WooCollection {
  databaseId?: number | null;
  name?: string | null;
  slug?: string | null;
  count?: number | null;
}

interface CollectionDocument {
  databaseId: number;
  name: string;
  slug: string;
  count: number;
  [key: string]: unknown;
}

interface CollectionsConnection {
  pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
  nodes?: WooCollection[] | null;
}

interface CollectionsResponse {
  errors?: Array<{ message: string }> | null;
  data?: { collections?: CollectionsConnection | null } | null;
}

function isSlugLikeName(name: string, slug: string): boolean {
  return !/\s/.test(name) && name.includes('-') && name === slug;
}

async function fetchAllCollections(wpUrl: string): Promise<CollectionDocument[]> {
  const documents: CollectionDocument[] = [];
  const deadlineAt = Date.now() + FETCH_DEADLINE_MS;
  let after: string | null = null;

  for (;;) {
    const json: CollectionsResponse = await postGraphQL<CollectionsResponse>(
      wpUrl,
      COLLECTION_QUERY,
      { first: 100, after },
      deadlineAt,
      'collections'
    );

    if (json.errors && json.errors.length > 0) {
      throw new Error(`GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`);
    }

    const connection: CollectionsConnection | null | undefined = json.data?.collections;
    if (!connection) {
      throw new Error('GraphQL response missing collections connection');
    }

    for (const node of connection.nodes || []) {
      if (typeof node?.databaseId !== 'number') continue;
      const count = node.count ?? 0;
      if (count <= 0) continue;
      const name = node.name ?? '';
      const slug = node.slug ?? '';
      if (isSlugLikeName(name, slug)) continue;
      documents.push({
        databaseId: node.databaseId,
        name,
        slug,
        count,
      });
    }

    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor ?? null;
  }

  return documents;
}

interface WpFeaturedImage {
  node?: { sourceUrl?: string | null; altText?: string | null } | null;
}

interface WpPost {
  databaseId?: number | null;
  title?: string | null;
  slug?: string | null;
  date?: string | null;
  excerpt?: string | null;
  content?: string | null;
  featuredImage?: WpFeaturedImage | null;
}

interface PostDocument {
  databaseId: number;
  title: string;
  slug: string;
  date: string;
  excerpt: string;
  content: string;
  featuredImage: { sourceUrl: string; altText: string } | null;
  [key: string]: unknown;
}

interface PostsConnection {
  pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
  nodes?: WpPost[] | null;
}

interface PostsResponse {
  errors?: Array<{ message: string }> | null;
  data?: { posts?: PostsConnection | null } | null;
}

function decodeCodePoint(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 0x10ffff) return ' ';
  return String.fromCodePoint(value);
}

function stripPostHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => decodeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => decodeCodePoint(Number(dec)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&[a-z0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchAllPosts(wpUrl: string): Promise<PostDocument[]> {
  const documents: PostDocument[] = [];
  const deadlineAt = Date.now() + FETCH_DEADLINE_MS;
  let after: string | null = null;

  for (;;) {
    const json: PostsResponse = await postGraphQL<PostsResponse>(
      wpUrl,
      POST_QUERY,
      { first: 100, after },
      deadlineAt,
      'posts'
    );

    if (json.errors && json.errors.length > 0) {
      throw new Error(`GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`);
    }

    const connection: PostsConnection | null | undefined = json.data?.posts;
    if (!connection) {
      throw new Error('GraphQL response missing posts connection');
    }

    for (const node of connection.nodes || []) {
      if (typeof node?.databaseId !== 'number') continue;
      const sourceUrl = node.featuredImage?.node?.sourceUrl ?? '';
      documents.push({
        databaseId: node.databaseId,
        title: node.title ?? '',
        slug: node.slug ?? '',
        date: node.date ?? '',
        excerpt: stripPostHtml(node.excerpt ?? ''),
        content: stripPostHtml(node.content ?? ''),
        featuredImage: sourceUrl
          ? { sourceUrl, altText: node.featuredImage?.node?.altText ?? '' }
          : null,
      });
    }

    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor ?? null;
  }

  return documents;
}

async function fetchIndexedIds(index: ReturnType<Meilisearch['index']>): Promise<number[]> {
  const ids: number[] = [];
  const limit = 1000;
  let offset = 0;

  for (;;) {
    const page = await index.getDocuments<{ databaseId: number }>({
      limit,
      offset,
      fields: ['databaseId'],
    });
    for (const doc of page.results) {
      if (typeof doc.databaseId === 'number') ids.push(doc.databaseId);
    }
    if (page.results.length < limit) break;
    offset += limit;
  }

  return ids;
}

export interface ReindexDocument {
  databaseId: number;
  [key: string]: unknown;
}

export interface IndexSettings {
  searchableAttributes: string[];
  filterableAttributes: string[];
  sortableAttributes: string[];
  displayedAttributes: string[];
  synonyms: Record<string, string[]>;
}

export interface IndexDefinition {
  uid: string;
  settings: IndexSettings;
  fetchDocuments: () => Promise<ReindexDocument[]>;
}

export interface IndexResult {
  ok: boolean;
  indexed: number;
  deleted: number;
  durationMs: number;
  error?: string;
}

export function buildIndexDefinitions(wpUrl: string): IndexDefinition[] {
  return [
    {
      uid: PRODUCTS_INDEX,
      settings: {
        searchableAttributes: SEARCHABLE_ATTRIBUTES,
        filterableAttributes: FILTERABLE_ATTRIBUTES,
        sortableAttributes: SORTABLE_ATTRIBUTES,
        displayedAttributes: DISPLAYED_ATTRIBUTES,
        synonyms: SYNONYMS,
      },
      fetchDocuments: () => fetchAllProducts(wpUrl),
    },
    {
      uid: COLLECTIONS_INDEX,
      settings: {
        searchableAttributes: COLLECTION_SEARCHABLE_ATTRIBUTES,
        filterableAttributes: COLLECTION_FILTERABLE_ATTRIBUTES,
        sortableAttributes: COLLECTION_SORTABLE_ATTRIBUTES,
        displayedAttributes: COLLECTION_DISPLAYED_ATTRIBUTES,
        synonyms: COLLECTION_SYNONYMS,
      },
      fetchDocuments: () => fetchAllCollections(wpUrl),
    },
    {
      uid: POSTS_INDEX,
      settings: {
        searchableAttributes: POST_SEARCHABLE_ATTRIBUTES,
        filterableAttributes: POST_FILTERABLE_ATTRIBUTES,
        sortableAttributes: POST_SORTABLE_ATTRIBUTES,
        displayedAttributes: POST_DISPLAYED_ATTRIBUTES,
        synonyms: POST_SYNONYMS,
      },
      fetchDocuments: () => fetchAllPosts(wpUrl),
    },
  ];
}

export function resolveTargets(
  type: string | string[] | undefined,
  definitions: IndexDefinition[]
): IndexDefinition[] | null {
  if (type === undefined || type === 'all') return definitions;
  if (typeof type !== 'string') return null;
  const match = definitions.find((definition) => definition.uid === type);
  return match ? [match] : null;
}

export async function rebuildIndex(
  client: Meilisearch,
  definition: IndexDefinition,
  existingUids: Set<string>
): Promise<IndexResult> {
  const startedAt = Date.now();

  try {
    if (!existingUids.has(definition.uid)) {
      const created = await client.createIndex(definition.uid, { primaryKey: 'databaseId' });
      await client.tasks.waitForTask(created.taskUid);
    }

    const index = client.index(definition.uid);

    const settingsTask = await index.updateSettings(definition.settings);
    await client.tasks.waitForTask(settingsTask.taskUid);

    const documents = await definition.fetchDocuments();

    if (documents.length === 0) {
      return {
        ok: false,
        indexed: 0,
        deleted: 0,
        durationMs: Date.now() - startedAt,
        error: 'Source returned no documents; index left unchanged',
      };
    }

    const sourceIds = new Set(documents.map((d) => d.databaseId));
    const indexedIds = await fetchIndexedIds(index);
    const staleIds = indexedIds.filter((id) => !sourceIds.has(id));

    const addTask = await index.addDocuments(documents, { primaryKey: 'databaseId' });
    const addResult = await client.tasks.waitForTask(addTask.taskUid);

    if (addResult.status !== 'succeeded') {
      return {
        ok: false,
        indexed: 0,
        deleted: 0,
        durationMs: Date.now() - startedAt,
        error: addResult.error?.message ?? 'Indexing failed',
      };
    }

    if (staleIds.length > 0) {
      const deleteTask = await index.deleteDocuments(staleIds);
      const deleteResult = await client.tasks.waitForTask(deleteTask.taskUid);
      if (deleteResult.status !== 'succeeded') {
        return {
          ok: false,
          indexed: documents.length,
          deleted: 0,
          durationMs: Date.now() - startedAt,
          error: deleteResult.error?.message ?? 'Delete reconciliation failed',
        };
      }
    }

    return {
      ok: true,
      indexed: documents.length,
      deleted: staleIds.length,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      indexed: 0,
      deleted: 0,
      durationMs: Date.now() - startedAt,
      error: (error as Error).message,
    };
  }
}
