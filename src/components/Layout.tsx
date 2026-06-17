import Head from 'next/head';
import { ReactNode } from 'react';
import Footer from '@/components/Footer/Footer';
import NavBar from './NavBar/NavBar';
import CartDrawer from './CartDrawer/CartDrawer';

interface SeoData {
  title?: string;
  metaDesc?: string;
  schema?: string;
  opengraphTitle?: string;
  opengraphDescription?: string;
  opengraphImage?: string;
}

interface LayoutProps {
  children: ReactNode;
  title?: string;
  description?: string;
  seo?: SeoData;
}

export default function Layout({
  children,
  title = 'Home',
  description = 'Premium cannabis products for elevated experiences',
  seo,
}: LayoutProps) {
  const pageTitle = seo?.title || `${title} | Mellow Fellow`;
  const pageDescription = seo?.metaDesc || description;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />

        {/* Open Graph */}
        {(seo?.opengraphTitle || title) && (
          <meta property="og:title" content={seo?.opengraphTitle || pageTitle} />
        )}
        {pageDescription && (
          <meta property="og:description" content={seo?.opengraphDescription || pageDescription} />
        )}
        {seo?.opengraphImage && (
          <meta property="og:image" content={seo.opengraphImage} />
        )}

        {/* JSON-LD Structured Data */}
        {seo?.schema && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: seo.schema }}
          />
        )}
      </Head>

      <NavBar />

      {/* Main Content */}
      <main>
        {children}
      </main>

      <Footer />
      <CartDrawer />
    </>
  );
}
