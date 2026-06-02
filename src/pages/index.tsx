import { GetStaticProps } from 'next';
import { getClient } from '@/lib/apollo-client';
import { GET_PRODUCTS } from '@/graphql/queries/products';
import Layout from '@/components/Layout';
import { Product } from '@/types/woocommerce';
import dynamic from 'next/dynamic';
import CollectionLinks from '@/components/CollectionLinks';
import HighlightsGroup from '@/components/HighlightsGroup';
import CollectionSwiper from '@/components/CollectionSwiper';
import FeaturedIn from '@/components/FeaturedIn';
import FeaturedCollection from '@/components/FeaturedCollection';
import RebuyRecommendations from '@/components/RebuyRecommendations';
import CollectionCards from '@/components/CollectionCards';

const HeroSwiper = dynamic(() => import('../components/HeroSwiper'), {
  ssr: false,
});

interface HomePageProps {
  products: Product[];
}

export default function HomePage({ products }: HomePageProps) {
  const featuredProducts = products.slice(0, 8);
  const newArrivals = products.slice(8, 16);
  const awardedProducts = products.slice(16, 24);

  return (
    <Layout title="Home" description="Mellow Fellow - Premium cannabis products for elevated experiences">
      <HeroSwiper />
      <CollectionLinks />
      <CollectionSwiper products={ newArrivals } title="Explore What's New" />

      <HighlightsGroup 
        title="Deals of the Day"
        description="Get today's deals & preview upcoming deals"
        highlights={[
          { id: 1, small_text: 'Smokeable Bundles', big_text: 'Enjoy 30% Off', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Smokeable_Bundle.webp' },
          { id: 2, small_text: 'Monthly Mystery Boxes', big_text: '30% Off Value', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Fam_Box.webp' },
          { id: 3, small_text: 'Edibles Bundles', big_text: 'Stock Up & Save', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Edible_Bundle.webp' }
        ]}
      />

      <FeaturedIn />
      <CollectionSwiper products={ featuredProducts } title="Can't-Miss Bestsellers" />

      <HighlightsGroup 
        title="New Collections"
        description="Fresh drops designed to elevate your everyday."
        highlights={[
          {
            id: 1,
            small_text: 'Delta-9 + CBD Seltzers',
            big_text: 'Sip Mellow',
            link: 'https://mellowfellow.fun/collections/new-arrivals',
            image: '/images/Seltzers_3-4.webp'
          },
          {
            id: 2,
            small_text: 'THCa 3.5g Exotic Flower + One Hitter',
            big_text: 'On-The-Go Freshness',
            link: 'https://mellowfellow.fun/collections/new-arrivals',
            image: '/images/Collection_Cards_THCa_One_Hitter.webp'
          },
          {
            id: 3,
            small_text: 'New Wellness Gummies',
            big_text: 'Pure CBD, CBG and CBN',
            link: 'https://mellowfellow.fun/collections/new-arrivals',
            image: '/images/CBD_CBG_CBN_Edibles_3-4.webp'
          }
        ]}
      />

      <FeaturedCollection products={ awardedProducts } title="Award-Winning Products" />

      <CollectionCards
        title="Premium Smokable Devices"
        cards={[
          { id: 1, smallText: 'Smokeable Bundles', bigText: 'Enjoy 30% Off', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Smokeable_Bundle.webp' },
          { id: 2, smallText: 'Monthly Mystery Boxes', bigText: '30% Off Value', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Fam_Box.webp' },
          { id: 3, smallText: 'Edibles Bundles', bigText: 'Stock Up & Save', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Edible_Bundle.webp' },
          { id: 4, smallText: 'Smokeable Bundles', bigText: 'Enjoy 30% Off', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Smokeable_Bundle.webp' },
          { id: 5, smallText: 'Monthly Mystery Boxes', bigText: '30% Off Value', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Fam_Box.webp' },
          { id: 6, smallText: 'Edibles Bundles', bigText: 'Stock Up & Save', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Edible_Bundle.webp' }
        ]}
      />
      
      <div className="container">
        {/* Rebuy Recommendations */}
        <RebuyRecommendations title="Recommended for you" limit={8} gridClass="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8 md:gap-x-6" />
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
