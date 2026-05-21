import { NextPageContext } from 'next';
import Layout from '@/components/Layout';
import Link from 'next/link';

interface ErrorProps {
  statusCode: number | undefined;
}

function Error({ statusCode }: ErrorProps) {
  return (
    <Layout title={statusCode ? `Error ${statusCode}` : 'Error'}>
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
          {statusCode || 'Error'}
        </h1>
        <p style={{
          fontSize: '1.125rem',
          color: '#8A8683',
          marginBottom: '2rem',
        }}>
          {statusCode === 404
            ? 'This page could not be found.'
            : statusCode
            ? `An error ${statusCode} occurred on the server.`
            : 'An error occurred on the client.'}
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

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;
