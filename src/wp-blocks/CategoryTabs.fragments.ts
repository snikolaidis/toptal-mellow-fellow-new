import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfCategoryTabsFragment`,
  entry: gql`
    fragment AcfCategoryTabsFragment on AcfCategoryTabs {
      moodTerms {
        name
        slug
        count
      }
      categoryTabs {
        heading
        subheading
        filterGroup
        tabs {
          label
          isActive
          collection {
            nodes {
              __typename
              ... on Collection {
                databaseId
                name
                slug
              }
            }
          }
          productCategory {
            nodes {
              __typename
              ... on ProductCategory {
                databaseId
                name
                slug
              }
            }
          }
          link {
            url
            title
            target
          }
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
