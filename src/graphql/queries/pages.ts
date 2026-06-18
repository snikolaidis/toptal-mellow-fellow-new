import { gql } from '@apollo/client';

// Get a single Content/policy page by its URI (for /pages/<slug>)
export const GET_CONTENT_PAGE_BY_SLUG = gql`
    query GetContentPageBySlug($slug: ID!) {
        page(id: $slug, idType: URI) {
            title
            slug
            editorBlocks(flat: false) {
                __typename
                renderedHtml
            }
            seo {
                title
                metaDesc
            }
        }
    }
`;

// Get all published page slugs for static paths
export const GET_ALL_CONTENT_PAGE_SLUGS = gql`
    query GetAllContentPageSlugs {
        pages(first: 100, where: {status: PUBLISH }) {
            nodes {
                slug
            }
        }
    }
`;