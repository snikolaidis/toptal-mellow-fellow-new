import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfWhatSetsUsApartFragment`,
  entry: gql`
    fragment AcfWhatSetsUsApartFragment on AcfWhatSetsUsApart {
      whatSetsUsApart {
        heading
        items {
          label
          labelColor
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
  `,
};
