import type { NextApiRequest, NextApiResponse } from 'next';
import { getClient } from '@/lib/apollo-client';
import { gql } from '@apollo/client';
import { withRateLimitOnly } from '@/lib/middleware';
import { cachedQuery } from '@/lib/cache';

const SEARCH_BLOGS = gql`
  query SearchBlogs($search: String!, $first: Int!) {
    posts(first: $first, where: { search: $search }) {
      nodes {
        id
        title
        slug
        date
        excerpt
        featuredImage {
          node {
            sourceUrl
            altText
          }
        }
      }
    }
  }
`;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.length < 2) {
    return res.status(400).json({ success: false, posts: [] });
  }

  const firstRaw = typeof req.query.first === 'string' ? parseInt(req.query.first, 10) : 4;
  const first = Math.max(1, Math.min(12, Number.isFinite(firstRaw) ? firstRaw : 4));

  try {
    const client = getClient();
    const { data } = await cachedQuery(client, {
      query: SEARCH_BLOGS,
      variables: { search: q, first },
    }, { ttl: 300 });

    const posts = (data?.posts?.nodes || []).map((post: any) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      date: post.date,
      excerpt: post.excerpt || '',
      featuredImage: post.featuredImage?.node?.sourceUrl
        ? { sourceUrl: post.featuredImage.node.sourceUrl, altText: post.featuredImage.node.altText || '' }
        : null,
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    return res.status(200).json({ success: true, posts });
  } catch (error) {
    console.error('[Search Blogs API] Query failed');
    return res.status(500).json({ success: false, posts: [] });
  }
}

export default withRateLimitOnly(30, 60000)(handler);
