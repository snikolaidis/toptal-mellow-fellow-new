import { GetStaticProps } from 'next';
import Link from 'next/link';
import { getClient } from '@/lib/apollo-client';
import { GET_PRODUCTS } from '@/graphql/queries/products';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import { Product } from '@/types/woocommerce';

interface HomePageProps {
  products: Product[];
}

// Icons
const ArrowRightIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
  </svg>
);

const LeafIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const ShieldIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const TruckIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
  </svg>
);

const HeartIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
  </svg>
);

export default function HomePage({ products }: HomePageProps) {
  const featuredProducts = products.slice(0, 4);
  const newArrivals = products.slice(4, 8);

  return (
    <Layout title="Home" description="Mellow Fellow - Premium cannabis products for elevated experiences">
      <div className="flex flex-col gap-16">
        {/* Hero Section */}
        <section className="relative">
          <div
            className="relative flex min-h-[70vh] flex-col gap-6 items-start justify-end p-8 md:p-16 overflow-hidden"
            style={{
              backgroundImage: `linear-gradient(to right, rgba(53, 70, 84, 0.85) 0%, rgba(53, 70, 84, 0.5) 100%), url("https://images.unsplash.com/photo-1616690002178-fbe13ac60c18?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="relative z-10 max-w-xl">
              <span className="inline-block px-4 py-2 text-xs font-semibold uppercase tracking-widest mb-6" style={{ backgroundColor: '#C9A962', color: '#232323' }}>
                New Collection
              </span>
              <h1 className="text-white text-4xl md:text-6xl lg:text-7xl font-bold leading-none tracking-tight lowercase mb-4">
                mellow<br />
                fellow.
              </h1>
              <p className="text-white/70 text-base md:text-lg leading-relaxed mb-8 max-w-md">
                Curated cannabis products for those who appreciate quality and craftsmanship.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href="/shop" className="btn-primary">
                  Shop Now
                </Link>
                <Link href="/shop?category=flower" className="btn-secondary">
                  Explore Flower
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Categories Grid */}
        <section>
          <div className="section-header">
            <h2 className="section-title">Shop by Category</h2>
            <Link href="/shop" className="section-link">
              View All <ArrowRightIcon />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Flower */}
            <Link href="/shop?category=flower" className="group relative aspect-square overflow-hidden" style={{ backgroundColor: '#354654' }}>
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                style={{ backgroundImage: `url("https://images.unsplash.com/photo-1603909223429-69bb7101f420?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80")` }}
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(53, 70, 84, 0.9) 0%, rgba(53, 70, 84, 0.2) 50%, transparent 100%)' }} />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <h3 className="text-white text-xl font-semibold lowercase tracking-tight">flower</h3>
              </div>
            </Link>

            {/* Edibles */}
            <Link href="/shop?category=edibles" className="group relative aspect-square overflow-hidden" style={{ backgroundColor: '#354654' }}>
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                style={{ backgroundImage: `url("https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80")` }}
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(53, 70, 84, 0.9) 0%, rgba(53, 70, 84, 0.2) 50%, transparent 100%)' }} />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <h3 className="text-white text-xl font-semibold lowercase tracking-tight">edibles</h3>
              </div>
            </Link>

            {/* Concentrates */}
            <Link href="/shop?category=concentrates" className="group relative aspect-square overflow-hidden" style={{ backgroundColor: '#354654' }}>
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                style={{ backgroundImage: `url("https://images.unsplash.com/photo-1559181567-c3190ca9959b?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80")` }}
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(53, 70, 84, 0.9) 0%, rgba(53, 70, 84, 0.2) 50%, transparent 100%)' }} />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <h3 className="text-white text-xl font-semibold lowercase tracking-tight">concentrates</h3>
              </div>
            </Link>

            {/* Accessories */}
            <Link href="/shop?category=accessories" className="group relative aspect-square overflow-hidden" style={{ backgroundColor: '#354654' }}>
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                style={{ backgroundImage: `url("https://images.unsplash.com/photo-1527027337830-e4647e838820?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80")` }}
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(53, 70, 84, 0.9) 0%, rgba(53, 70, 84, 0.2) 50%, transparent 100%)' }} />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <h3 className="text-white text-xl font-semibold lowercase tracking-tight">accessories</h3>
              </div>
            </Link>
          </div>
        </section>

        {/* Featured Products */}
        <section>
          <div className="section-header">
            <h2 className="section-title">Featured</h2>
            <Link href="/shop" className="section-link">
              View All <ArrowRightIcon />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8 md:gap-x-6">
            {featuredProducts.length > 0 ? (
              featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))
            ) : (
              <p className="col-span-full text-center py-12 text-[#666666]">
                No products found. Check back soon for new arrivals.
              </p>
            )}
          </div>
        </section>

        {/* Brand Story Banner */}
        <section className="relative overflow-hidden text-white" style={{ backgroundColor: '#354654' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            <div
              className="aspect-square md:aspect-auto bg-cover bg-center min-h-[400px]"
              style={{ backgroundImage: `url("https://images.unsplash.com/photo-1586023492125-27b2c045efd7?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80")` }}
            />
            <div className="flex flex-col justify-center p-8 md:p-16">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-4">Our Story</span>
              <h2 className="text-3xl md:text-4xl font-bold lowercase tracking-tight mb-6">
                crafted with<br />intention.
              </h2>
              <p className="text-white/60 leading-relaxed mb-8">
                Mellow Fellow is more than a brand—it&apos;s a philosophy. We believe in mindful consumption, quality ingredients, and creating products that elevate your everyday moments.
              </p>
              <Link href="/shop" className="btn-outline inline-flex w-fit border-white text-white hover:bg-white hover:text-black">
                Learn More
              </Link>
            </div>
          </div>
        </section>

        {/* New Arrivals */}
        {newArrivals.length > 0 && (
          <section>
            <div className="section-header">
              <h2 className="section-title">New Arrivals</h2>
              <Link href="/shop" className="section-link">
                View All <ArrowRightIcon />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8 md:gap-x-6">
              {newArrivals.map((product) => (
                <ProductCard key={product.id} product={product} badge="new" />
              ))}
            </div>
          </section>
        )}

        {/* Trust Badges */}
        <section className="border-t border-b border-[#D5D0C9] py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="flex flex-col items-center text-center gap-3">
              <div style={{ color: '#354654' }}>
                <LeafIcon />
              </div>
              <div>
                <h4 className="font-semibold text-sm uppercase tracking-wider" style={{ color: '#232323' }}>Premium Quality</h4>
                <p className="text-xs mt-1" style={{ color: '#8A8683' }}>Lab-tested products</p>
              </div>
            </div>
            <div className="flex flex-col items-center text-center gap-3">
              <div style={{ color: '#354654' }}>
                <ShieldIcon />
              </div>
              <div>
                <h4 className="font-semibold text-sm uppercase tracking-wider" style={{ color: '#232323' }}>Safe & Secure</h4>
                <p className="text-xs mt-1" style={{ color: '#8A8683' }}>Discreet packaging</p>
              </div>
            </div>
            <div className="flex flex-col items-center text-center gap-3">
              <div style={{ color: '#354654' }}>
                <TruckIcon />
              </div>
              <div>
                <h4 className="font-semibold text-sm uppercase tracking-wider" style={{ color: '#232323' }}>Fast Delivery</h4>
                <p className="text-xs mt-1" style={{ color: '#8A8683' }}>Same-day available</p>
              </div>
            </div>
            <div className="flex flex-col items-center text-center gap-3">
              <div style={{ color: '#354654' }}>
                <HeartIcon />
              </div>
              <div>
                <h4 className="font-semibold text-sm uppercase tracking-wider" style={{ color: '#232323' }}>Satisfaction</h4>
                <p className="text-xs mt-1" style={{ color: '#8A8683' }}>100% guaranteed</p>
              </div>
            </div>
          </div>
        </section>

        {/* Newsletter CTA */}
        <section className="text-white p-8 md:p-16 text-center" style={{ backgroundColor: '#354654' }}>
          <h2 className="text-2xl md:text-3xl font-bold lowercase tracking-tight mb-4">
            stay mellow.
          </h2>
          <p className="text-white/60 mb-8 max-w-md mx-auto">
            Subscribe for exclusive drops, early access, and curated content delivered to your inbox.
          </p>
          <form className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="email"
              placeholder="your@email.com"
              className="flex-1 h-12 px-4 bg-transparent border border-white/30 text-white placeholder:text-white/50 focus:outline-none focus:border-white"
            />
            <button
              type="submit"
              className="h-12 px-8 font-semibold text-sm uppercase tracking-wider transition-colors"
              style={{ backgroundColor: '#C9A962', color: '#232323' }}
            >
              Subscribe
            </button>
          </form>
          <p className="text-xs text-white/40 mt-4">21+ only. By subscribing, you agree to our terms.</p>
        </section>
      </div>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps = async () => {
  try {
    const client = getClient();
    const { data } = await client.query({
      query: GET_PRODUCTS,
      variables: { first: 12 },
    });

    return {
      props: {
        products: data?.products?.nodes || [],
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching products:', error);
    return {
      props: {
        products: [],
      },
      revalidate: 60,
    };
  }
};
