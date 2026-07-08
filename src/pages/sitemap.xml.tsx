import { GetServerSideProps } from 'next';
import { gql } from '@apollo/client';
import { getClient } from '@/lib/apollo-client';

const RAW_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
const SITE_URL = RAW_SITE_URL && !/^https?:\/\//i.test(RAW_SITE_URL) ? `https://${RAW_SITE_URL}` : RAW_SITE_URL;

const SITEMAP_QUERY = gql`
  query SitemapUrls {
    products(first: 1000, where: { status: "publish" }) {
      nodes {
        slug
      }
    }
    collections(first: 200) {
      nodes {
        slug
      }
    }
  }
`;

const STATIC_PATHS = ['/', '/shop', '/collections', '/store-locator', '/blogs'];

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function Sitemap() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const urls: string[] = STATIC_PATHS.map((p) => SITE_URL + p);

  try {
    const { data } = await getClient().query({ query: SITEMAP_QUERY, fetchPolicy: 'no-cache' });
    for (const n of data?.products?.nodes || []) {
      if (n?.slug) {
        urls.push(SITE_URL + '/product/' + n.slug);
      }
    }
    for (const n of data?.collections?.nodes || []) {
      if (n?.slug) {
        urls.push(SITE_URL + '/collections/' + n.slug);
      }
    }
  } catch (err) {
    console.error('[sitemap] query failed:', err instanceof Error ? err.message : err);
  }

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls.map((loc) => '<url><loc>' + escapeXml(loc) + '</loc></url>').join('') +
    '</urlset>';

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.write(body);
  res.end();
  return { props: {} };
};

export default Sitemap;
