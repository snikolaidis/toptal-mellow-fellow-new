import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfLoyaltyTiersFragment`,
  entry: gql`
    fragment AcfLoyaltyTiersFragment on AcfLoyaltyTiers {
      loyaltyTiers {
        badgeText
        heading
        body
        tiersTitle
        cta {
          url
          title
          target
        }
        badgeIcon {
          node {
            id
            altText
            sourceUrl
          }
        }
        tiers {
          name
          points
          iconBg
          icon {
            node {
              id
              altText
              sourceUrl
            }
          }
          benefits {
            label
            icon {
              node {
                id
                altText
                sourceUrl
              }
            }
          }
        }
      }
    }
  `,
};
