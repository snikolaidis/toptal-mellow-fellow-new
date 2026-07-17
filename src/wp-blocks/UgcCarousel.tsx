import { gql, useQuery } from '@apollo/client';
import UGCGallery, { UGCItem } from '@/components/affiliate/UGCGallery';
import { getClient, getBrowserClient } from '@/lib/apollo-client';

const GET_UGC_GALLERY = gql`
  query GetUgcGallery {
    pageBy(uri: "affiliate-data") {
      affiliatePageContent {
        ugcGallery {
          videoUrl {
            node {
              mediaItemUrl
            }
          }
          videoPoster {
            node {
              sourceUrl
            }
          }
          taggedProduct {
            nodes {
              ... on SimpleProduct {
                id
                databaseId
                name
                slug
                price
                regularPrice
                salePrice
                stockStatus
                shortDescription
                image {
                  id
                  sourceUrl
                  altText
                }
              }
            }
          }
        }
      }
    }
  }
`;

interface UgcRow {
  videoUrl?: { node?: { mediaItemUrl?: string } | null } | null;
  videoPoster?: { node?: { sourceUrl?: string } | null } | null;
  taggedProduct?: { nodes?: any[] } | null;
}

interface UgcCarouselProps {
  ugcCarousel?: {
    title?: string | null;
  } | null;
}

export default function UgcCarousel(props: UgcCarouselProps) {
  const title = props.ugcCarousel?.title || 'What Other Customers are Saying';

  const client = typeof window !== 'undefined' ? getBrowserClient() : getClient();
  const { data } = useQuery(GET_UGC_GALLERY, { client });

  const rows: UgcRow[] = data?.pageBy?.affiliatePageContent?.ugcGallery ?? [];

  const items: UGCItem[] = rows
    .filter((row) => row?.videoUrl?.node?.mediaItemUrl)
    .map((row, i) => ({
      id: `ugc-${i}`,
      videoUrl: row.videoUrl!.node!.mediaItemUrl as string,
      posterUrl: row.videoPoster?.node?.sourceUrl || null,
      product: row.taggedProduct?.nodes?.[0] || null,
    }));

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="ugc-carousel">
      <h3 className="section__title">{title}</h3>
      <UGCGallery items={items} size="large" />
    </section>
  );
}

UgcCarousel.displayName = 'AcfUgcCarousel';

UgcCarousel.fragments = {
  key: `AcfUgcCarouselFragment`,
  entry: gql`
    fragment AcfUgcCarouselFragment on AcfUgcCarousel {
      ugcCarousel {
        title
      }
    }
  `,
};
