import Layout from '@/components/Layout';

const WP_BASE = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const STORE_LOCATOR_URL = process.env.NEXT_PUBLIC_STORE_LOCATOR_URL || `${WP_BASE}/store-locator`;

export default function StoreLocatorPage() {
  return (
    <Layout title="Store Locator">
      <iframe
        src={STORE_LOCATOR_URL}
        title="Store Locator"
        loading="lazy"
        style={{ width: '100%', minHeight: '80vh', border: 'none', display: 'block' }}
      />
    </Layout>
  );
}
