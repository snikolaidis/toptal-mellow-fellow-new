import { gql } from '@apollo/client';
import type { ApolloClient, NormalizedCacheObject } from '@apollo/client';
import type { BlogTag } from '@/types/blog';

export const GET_ALL_POST_SLUGS = gql`
  query GetAllPostSlugs {
    posts(first: 1000) {
      nodes {
        slug
      }
    }
  }
`;

export const GET_ALL_POSTS = gql`
  query GetAllPosts($first: Int, $after: String) {
    posts(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        databaseId
        title
        slug
        excerpt
        date
        featuredImage {
          node {
            sourceUrl
            altText
          }
        }
        categories {
          nodes {
            id
            name
            slug
          }
        }
        tags {
          nodes {
            id
            name
            slug
          }
        }
        author {
          node {
            name
          }
        }
      }
    }
  }
`;

export const GET_CATEGORY_BY_SLUG = gql`
  query GetCategoryBySlug($slug: ID!) {
    category(id: $slug, idType: SLUG) {
      name
      description
    }
  }
`;

export const GET_LATEST_POSTS = gql`
  query GetLatestPosts($first: Int) {
    posts(first: $first, where: { orderby: { field: DATE, order: DESC } }) {
      nodes {
        id
        databaseId
        title
        slug
        date
        featuredImage {
          node {
            sourceUrl
            altText
          }
        }
        tags {
          nodes {
            id
            name
            slug
          }
        }
      }
    }
  }
`;

export const GET_ALL_TAGS = gql`
  query GetAllTags($after: String) {
    tags(first: 100, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        slug
        count
      }
    }
  }
`;

export async function fetchAllTags(
  client: ApolloClient<NormalizedCacheObject>
): Promise<BlogTag[]> {
  const tags: BlogTag[] = [];
  let after: string | null = null;

  for (;;) {
    const result: any = await client.query({ query: GET_ALL_TAGS, variables: { after } });
    const page = result.data?.tags;
    tags.push(
      ...(page?.nodes || []).filter((tag: { count?: number | null }) => (tag.count ?? 0) > 0)
    );
    if (!page?.pageInfo?.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }

  return tags;
}

export const GET_POST_BY_SLUG = gql`
  query GetPostBySlug($slug: ID!) {
    post(id: $slug, idType: SLUG) {
      id
      databaseId
      title
      slug
      content
      excerpt
      date
      modified
      featuredImage {
        node {
          sourceUrl
          altText
          mediaDetails {
            width
            height
          }
        }
      }
      categories {
        nodes {
          id
          name
          slug
        }
      }
      tags {
        nodes {
          id
          name
          slug
        }
      }
      author {
        node {
          name
        }
      }
      seo {
        title
        metaDesc
        schema {
          raw
        }
        opengraphTitle
        opengraphDescription
        opengraphImage {
          sourceUrl
        }
      }
      smartRelatedProducts {
        id
        databaseId
        slug
        title
        image
        rawPrice
      }
      blogPostsFields {
        faqs {
          nodes {
            id
            ... on FAQ {
              title
              content
            }
          }
        }
      }
    }
  }
`;
