import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfQuizHeroFragment`,
  entry: gql`
    fragment AcfQuizHeroFragment on AcfQuizHero {
      quizHero {
        eyebrow
        heading
        subheading
        ctaButton {
          url
          title
          target
        }
        ctaHighlight
        mobileImage {
          node {
            id
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
