import { GetServerSideProps } from 'next';

const RAW_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
const SITE_URL = RAW_SITE_URL && !/^https?:\/\//i.test(RAW_SITE_URL) ? `https://${RAW_SITE_URL}` : RAW_SITE_URL;

function Robots() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const lines = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /checkout',
    'Disallow: /cart',
    'Disallow: /account',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /order-confirmation',
    'Disallow: /api/',
  ];
  if (SITE_URL) {
    lines.push('Sitemap: ' + SITE_URL + '/sitemap.xml');
  }
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.write(lines.join('\n') + '\n');
  res.end();
  return { props: {} };
};

export default Robots;
