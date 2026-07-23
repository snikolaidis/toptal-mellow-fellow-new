import type { NextApiRequest, NextApiResponse } from 'next';
import { timingSafeEqual } from 'crypto';
import { Meilisearch } from 'meilisearch';
import { withRateLimitOnly } from '@/lib/middleware';

const WP_URL = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const MEILI_HOST = process.env.MEILISEARCH_HOST || '';
const MEILI_ADMIN_KEY = process.env.MEILISEARCH_ADMIN_KEY || '';
const REINDEX_SECRET = process.env.REINDEX_SECRET || '';

export const PRODUCTS_INDEX = 'products';

const PRODUCT_QUERY = `
  query ReindexProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, where: { status: "publish" }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        __typename
        ... on SimpleProduct {
          id databaseId name slug type date
          description shortDescription sku
          price regularPrice salePrice
          stockStatus stockQuantity
          image { id sourceUrl altText }
          galleryImages { nodes { id sourceUrl altText } }
          productCategories { nodes { id name slug } }
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
          bbLinkedBundleId
          bbFromPrice
          uniqueSellingProps { nodes { id name uniqueSellingFields { propIcon { node { sourceUrl altText } } } } }
        }
        ... on VariableProduct {
          id databaseId name slug type date
          description shortDescription sku
          price regularPrice salePrice
          stockStatus
          image { id sourceUrl altText }
          galleryImages { nodes { id sourceUrl altText } }
          productCategories { nodes { id name slug } }
          collections { nodes { name slug } }
          variations { nodes { id databaseId name price regularPrice salePrice stockStatus attributes { nodes { name value } } } }
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
          bbLinkedBundleId
          bbFromPrice
          uniqueSellingProps { nodes { id name uniqueSellingFields { propIcon { node { sourceUrl altText } } } } }
        }
      }
    }
  }
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
  'bbLinkedBundleId',
  'bbFromPrice',
  'uniqueSellingProps',
  ...TAXONOMY_FIELDS.flatMap((t) => [`${t.key}Slugs`, `${t.key}Names`]),
  ...DISPLAY_TAXONOMY_FIELDS.flatMap((t) => [`${t.key}Slugs`, `${t.key}Names`]),
];

const SYNONYM_GROUPS: string[][] = [
  ['butter', 'budder', 'badder', 'dab', 'dabs'],
  ['ingestable', 'edible', 'edibles'],
  ['510', 'eliquid', 'cartridge', 'cartridges'],
  ['baterry', 'battery'],
];

const SYNONYMS = SYNONYM_GROUPS.reduce<Record<string, string[]>>((acc, group) => {
  for (const term of group) {
    acc[term] = [...(acc[term] || []), ...group.filter((other) => other !== term)];
  }
  return acc;
}, {});

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
    bbLinkedBundleId: (product.bbLinkedBundleId as number | null | undefined) ?? null,
    bbFromPrice: (product.bbFromPrice as number | null | undefined) ?? null,
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

async function fetchAllProducts(): Promise<ProductDocument[]> {
  const documents: ProductDocument[] = [];
  let after: string | null = null;

  for (;;) {
    const res: Response = await fetch(`${WP_URL}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: PRODUCT_QUERY, variables: { first: 100, after } }),
    });

    if (!res.ok) {
      throw new Error(`WordPress responded ${res.status}`);
    }

    const json = (await res.json()) as ProductsResponse;

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

function isAuthorized(req: NextApiRequest): boolean {
  if (!REINDEX_SECRET) return false;
  const provided = req.headers['x-reindex-secret'];
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(REINDEX_SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!WP_URL || !MEILI_HOST || !MEILI_ADMIN_KEY) {
    return res.status(503).json({ error: 'Reindex is not configured' });
  }

  const startedAt = Date.now();

  try {
    const client = new Meilisearch({ host: MEILI_HOST, apiKey: MEILI_ADMIN_KEY });

    const indexes = await client.getRawIndexes({ limit: 1000 });
    if (!indexes.results.some((i) => i.uid === PRODUCTS_INDEX)) {
      const created = await client.createIndex(PRODUCTS_INDEX, { primaryKey: 'databaseId' });
      await client.tasks.waitForTask(created.taskUid);
    }

    const index = client.index(PRODUCTS_INDEX);

    const settingsTask = await index.updateSettings({
      searchableAttributes: SEARCHABLE_ATTRIBUTES,
      filterableAttributes: FILTERABLE_ATTRIBUTES,
      sortableAttributes: SORTABLE_ATTRIBUTES,
      displayedAttributes: DISPLAYED_ATTRIBUTES,
      synonyms: SYNONYMS,
    });
    await client.tasks.waitForTask(settingsTask.taskUid);

    const documents = await fetchAllProducts();

    if (documents.length === 0) {
      return res.status(502).json({ error: 'Source returned no products; index left unchanged' });
    }

    const sourceIds = new Set(documents.map((d) => d.databaseId));
    const indexedIds = await fetchIndexedIds(index);
    const staleIds = indexedIds.filter((id) => !sourceIds.has(id));

    const addTask = await index.addDocuments(documents, { primaryKey: 'databaseId' });
    const addResult = await client.tasks.waitForTask(addTask.taskUid);

    if (addResult.status !== 'succeeded') {
      return res.status(502).json({
        error: 'Indexing failed',
        detail: addResult.error?.message ?? null,
      });
    }

    if (staleIds.length > 0) {
      const deleteTask = await index.deleteDocuments(staleIds);
      const deleteResult = await client.tasks.waitForTask(deleteTask.taskUid);
      if (deleteResult.status !== 'succeeded') {
        return res.status(502).json({
          error: 'Delete reconciliation failed',
          detail: deleteResult.error?.message ?? null,
        });
      }
    }

    return res.status(200).json({
      indexed: documents.length,
      deleted: staleIds.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[Reindex] Failed:', (error as Error).message);
    return res.status(500).json({ error: 'Reindex failed' });
  }
}

export default withRateLimitOnly(5, 60000)(handler);
