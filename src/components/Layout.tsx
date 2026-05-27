import Head from 'next/head';
import { ReactNode } from 'react';
import Footer from '@/components/Footer/Footer';
import NavBar from './NavBar/NavBar';

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
  const pageTitle = `${title} | Twenty One Cannabis`;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-[#f5f5f0]">
        <NavBar />

        {/* Main Content */}
        <main className="flex-1 flex flex-col items-center w-full">
          <div className="w-full max-w-[1920px] px-4 md:px-8 lg:px-16 xl:px-24 2xl:px-32 py-8">
            {children}
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
