import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfQuizFragment`,
  entry: gql`
    fragment AcfQuizFragment on AcfQuiz {
      quizBlock {
        quiz {
          nodes {
            ... on Quiz {
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
        }
      }
    }
  `,
};
