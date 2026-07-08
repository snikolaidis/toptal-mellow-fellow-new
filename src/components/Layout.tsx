import Head from 'next/head';
import { ReactNode } from 'react';
import { useRouter } from 'next/router';
import Footer from '@/components/Footer/Footer';
import NavBar from './NavBar/NavBar';
import CartDrawer from './CartDrawer/CartDrawer';

interface SeoData {
  title?: string;
  metaDesc?: string;
  schema?: string;
  faqSchema?: string;
  productSchema?: string;
  opengraphTitle?: string;
  opengraphDescription?: string;
  opengraphImage?: string;
  canonical?: string;
  ogType?: string;
  publishedTime?: string;
  modifiedTime?: string;
}

interface LayoutProps {
  children: ReactNode;
  title?: string;
  description?: string;
  seo?: SeoData;
}

const RAW_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
const SITE_URL = RAW_SITE_URL && !/^https?:\/\//i.test(RAW_SITE_URL) ? `https://${RAW_SITE_URL}` : RAW_SITE_URL;
const SITE_NAME = 'Mellow Fellow';

export default function Layout({
  children,
  title = 'Home',
  description = 'Premium cannabis products for elevated experiences',
  seo,
}: LayoutProps) {
  const router = useRouter();
  const pageTitle = seo?.title || `${title} | ${SITE_NAME}`;
  const pageDescription = seo?.metaDesc || description;
  const canonical = seo?.canonical || `${SITE_URL}${router.asPath.split('?')[0]}`;
  const ogType = seo?.ogType || 'website';
  const ogImage = seo?.opengraphImage;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="canonical" href={canonical} />

        {/* Open Graph */}
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:type" content={ogType} />
        <meta property="og:url" content={canonical} />
        <meta property="og:title" content={seo?.opengraphTitle || pageTitle} />
        <meta property="og:description" content={seo?.opengraphDescription || pageDescription} />
        {ogImage && <meta property="og:image" content={ogImage} />}

        {/* Article-specific Open Graph */}
        {seo?.publishedTime && (
          <meta property="article:published_time" content={seo.publishedTime} />
        )}
        {seo?.modifiedTime && (
          <meta property="article:modified_time" content={seo.modifiedTime} />
        )}

        {/* Twitter Card */}
        <meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
        <meta name="twitter:site" content="@MellowFellowFam" />
        <meta name="twitter:title" content={seo?.opengraphTitle || pageTitle} />
        <meta name="twitter:description" content={seo?.opengraphDescription || pageDescription} />
        {ogImage && <meta name="twitter:image" content={ogImage} />}

        {/* JSON-LD Structured Data */}
        {seo?.schema && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: seo.schema }}
          />
        )}
        {seo?.faqSchema && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: seo.faqSchema }}
          />
        )}
        {seo?.productSchema && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: seo.productSchema }}
          />
        )}
      </Head>

      <NavBar />

      <main>
        {children}
      </main>

      <Footer />
      <CartDrawer />
    </>
  );
}
