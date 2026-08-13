import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfBlogPostsFragment`,
  entry: gql`
    fragment AcfBlogPostsFragment on AcfBlogPosts {
      blogPosts {
        title
        subheading
        postCount
        buttonText
        buttonLink {
          url
          title
          target
        }
      }
    }
  `,
};
