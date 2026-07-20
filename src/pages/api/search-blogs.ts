import type { NextApiRequest, NextApiResponse } from 'next';
import { getClient } from '@/lib/apollo-client';
import { gql } from '@apollo/client';
import { withRateLimitOnly } from '@/lib/middleware';
import { cachedQuery } from '@/lib/cache';

const SEARCH_BLOGS = gql`
  query SearchBlogs($search: String!) {
    posts(first: 4, where: { search: $search }) {
      nodes {
        id
        title
        slug
        date
      }
    }
  }
`;

interface BlogResult {
  id: string;
  title: string;
  slug: string;
  date: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.length < 2) {
    return res.status(400).json({ success: false, posts: [] });
  }

  try {
    const client = getClient();
    const { data } = await cachedQuery(client, {
      query: SEARCH_BLOGS,
      variables: { search: q },
    }, { ttl: 300 });

    const posts: BlogResult[] = (data?.posts?.nodes || []).map((post: BlogResult) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      date: post.date,
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    return res.status(200).json({ success: true, posts });
  } catch (error) {
    console.error('[Search Blogs API] Query failed');
    return res.status(500).json({ success: false, posts: [] });
  }
}

export default withRateLimitOnly(30, 60000)(handler);
