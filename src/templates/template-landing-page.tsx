import { gql } from '@apollo/client';
import { FaustTemplate } from '@faustwp/core';
import Layout from '@/components/Layout';
import ResponsiveImage from '@/wp-blocks/ResponsiveImage';
import LandingPageIconRow from '@/components/LandingPageIconRow';
import LandingCollectionGroup from '@/wp-blocks/LandingCollectionGroup';
import type { LandingPageSettings } from '@/types/mellow-fellow';

interface LandingPageData {
  page?: {
    title: string;
    seo?: { title?: string; metaDesc?: string };
    landingPageSettings?: LandingPageSettings | null;
  } | null;
}

const LandingPage: FaustTemplate<LandingPageData> = (props) => {
  const page = props.data?.page;
  if (!page) return null;

  const { heroImage, collectionGroup } = page.landingPageSettings ?? {};

  const collectionGroupItems = (collectionGroup?.items ?? [])
    .map((item) => {
      const collection = item.collection?.nodes?.[0];
      if (!collection?.slug || !collection?.name) return null;
      return {
        slug: collection.slug,
        name: collection.name,
        titleOverride: item.titleOverride,
        thumbnailUrl: collection.collectionFields?.thumbnailImage?.node?.sourceUrl,
        url: collection.uri,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <Layout title={page.title} seo={page.seo}>
      {heroImage && <ResponsiveImage responsiveImage={heroImage} />}

      <LandingPageIconRow />

      {collectionGroupItems.length > 0 && (
        <LandingCollectionGroup
          heading={collectionGroup?.heading ?? undefined}
          showThumbnail={!!collectionGroup?.showThumbnail}
          showProductsSlider={!!collectionGroup?.showProductsSlider}
          productCount={collectionGroup?.productCount}
          items={collectionGroupItems}
        />
      )}
    </Layout>
  );
};

LandingPage.query = gql`
  query GetLandingPage($id: ID!) {
    page(id: $id, idType: DATABASE_ID) {
      title
      seo {
        title
        metaDesc
      }
      landingPageSettings {
        heroImage {
          mobileImage {
            node {
              altText
              sourceUrl
              mediaDetails {
                width
                height
              }
            }
          }
          tabletImage {
            node {
              altText
              sourceUrl
              mediaDetails {
                width
                height
              }
            }
          }
          desktopImage {
            node {
              altText
              sourceUrl
              mediaDetails {
                width
                height
              }
            }
          }
          link {
            url
            title
            target
          }
          borderRadius
          width
          eagerLoad
        }
        collectionGroup {
          heading
          productCount
          showThumbnail
          showProductsSlider
          items {
            titleOverride
            collection {
              nodes {
                ... on Collection {
                  name
                  slug
                  uri
                  collectionFields {
                    thumbnailImage {
                      node {
                        sourceUrl
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

LandingPage.variables = (seedNode) => ({ id: seedNode.databaseId });

export default LandingPage;
