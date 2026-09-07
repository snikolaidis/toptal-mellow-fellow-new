import { gql } from '@apollo/client';

// Presentation fields only. The taxonomy mapping fields on each answer are read
// server-side by the recommendation endpoint, never sent to the client.
export const GET_QUIZ_BY_SLUG = gql`
  query GetQuizBySlug($slug: ID!) {
    quiz(id: $slug, idType: SLUG) {
      databaseId
      title
      slug
      quizFields {
        introHeading
        introSubcopy
        introImage {
          node {
            sourceUrl
            altText
            mediaDetails {
              width
              height
            }
          }
        }
        resultsHeading
        resultCount
        questions {
          questionText
          selectionType
          answers {
            label
            image {
              node {
                sourceUrl
                altText
                mediaDetails {
                  width
                  height
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const GET_ALL_QUIZ_SLUGS = gql`
  query GetAllQuizSlugs {
    quizzes(first: 100) {
      nodes {
        slug
      }
    }
  }
`;
