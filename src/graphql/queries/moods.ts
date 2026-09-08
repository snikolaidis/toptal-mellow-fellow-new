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

// count has no consumer yet, and is null rather than 0 on an empty term.
export const GET_ALL_MOODS = gql`
  query GetAllMoods {
    moods(first: 100) {
      nodes {
        name
        slug
        count
      }
    }
  }
`;
