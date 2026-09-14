import { GetStaticProps } from 'next';
import Layout from '@/components/Layout';
import Link from 'next/link';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';

export default function Custom404() {
  return (
    <Layout title="Page Not Found">
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50vh',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '3rem',
          fontWeight: 600,
          color: '#232323',
          marginBottom: '1rem',
        }}>
          404
        </h1>
        <p style={{
          fontSize: '1.125rem',
          color: '#8A8683',
          marginBottom: '2rem',
        }}>
          This page could not be found.
        </p>
        <Link
          href="/"
          style={{
            padding: '1rem 2rem',
            backgroundColor: '#354654',
            color: 'white',
            fontWeight: 600,
            fontSize: '0.875rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            textDecoration: 'none',
          }}
        >
          Go Home
        </Link>
      </div>
    </Layout>
  );
}

// The header fetches its nav client-side, and this is the one page reached cold,
// so without a warm cache it renders the hardcoded Shop item on its own.
export const getStaticProps: GetStaticProps = async () => {
  const props: Record<string, unknown> = {};
  try {
    mergeMenuState(props, await prefetchMenus());
  } catch (error) {
    // Leaving the cache empty is safe: the header falls back to fetching.
    console.error('[404] menu prefetch failed, falling back to a client fetch', error);
  }
  return { props, revalidate: 300 };
};
