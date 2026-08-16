import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfHighlightsGroupFragment`,
  entry: gql`
    fragment AcfHighlightsGroupFragment on AcfHighlightsGroup {
      highlightsGroup {
        heading
        description
        highlights {
          bigText
          bigColor
          smallText
          smallColor
          link {
            url
            title
            target
          }
          image {
            node {
              altText
              sourceUrl
            }
          }
        }
      }
    }
  `,
};
