import type { NextApiRequest, NextApiResponse } from 'next';
import { withRateLimitOnly } from '@/lib/middleware';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const quizSlug =
    typeof body.quizSlug === 'string' ? body.quizSlug : typeof body.quiz === 'string' ? body.quiz : '';
  const selections = Array.isArray(body.selections) ? body.selections : [];

  if (!quizSlug) {
    return res.status(400).json({ success: false, message: 'Missing quiz', products: [] });
  }

  try {
    const upstream = await fetch(`${wpUrl}/wp-json/mf/v1/quiz-recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quiz: quizSlug, selections }),
    });
    const data = await upstream.json();

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(upstream.ok ? 200 : 502).json(data);
  } catch (error) {
    console.error('[Quiz Recommendations] Request failed');
    return res.status(500).json({
      success: false,
      message: 'Recommendation service unavailable',
      products: [],
    });
  }
}

export default withRateLimitOnly(20, 60000)(handler);
