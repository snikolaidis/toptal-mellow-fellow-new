import Head from 'next/head';
import { ReactNode } from 'react';
import Footer from '@/components/Footer/Footer';
import NavBar from './NavBar/NavBar';
import CartDrawer from './CartDrawer/CartDrawer';

interface LayoutProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

export default function Layout({
  children,
  title = 'Home',
  description = 'Premium cannabis products for elevated experiences',
}: LayoutProps) {
  const pageTitle = `${title} | Mellow Fellow`;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
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
