import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfSaleCountdownHeroFragment`,
  entry: gql`
    fragment AcfSaleCountdownHeroFragment on AcfSaleCountdownHero {
      saleCountdownHero {
        saleEnd
        heading
        tiers {
          percentage
          spend
          label
        }
        button1 {
          url
          title
          target
        }
        button2 {
          url
          title
          target
        }
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
      }
    }
  `,
};
