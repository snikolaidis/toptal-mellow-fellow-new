import { gql } from '@apollo/client';

export const GET_NEWS_ARTICLES = gql`
  query GetNewsArticles {
    newsArticles(first: 100) {
      nodes {
        id
        title
        newsArticleDetails {
          publicationName
          publicationDate
          externalUrl
          coverImage {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
  }
`;
