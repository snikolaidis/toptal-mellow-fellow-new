import { gql } from '@apollo/client';

export const GET_ALL_MOOD_SLUGS = gql`
  query GetAllMoodSlugs {
    moods(first: 100) {
      nodes {
        slug
      }
    }
  }
`;

export const GET_ALL_MOODS = gql`
  query GetAllMoods {
    moods(first: 100) {
      nodes {
        name
        slug
      }
    }
  }
`;
