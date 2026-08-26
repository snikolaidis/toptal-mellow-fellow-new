import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyJwt, extractJwt } from '@/lib/jwt-auth';
import { validateSession } from '@/lib/session-manager';
import { exchangeRefreshToken } from '@/lib/faust-auth';
import { makeHttpRequest, getWordPressGraphQLUrl } from '@/lib/http';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const cookies = req.headers.cookie || '';
  const jwt = extractJwt(cookies);
  const result = jwt ? verifyJwt(jwt) : null;

  if (!result || !(await validateSession(result.sessionId))) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const tokens = await exchangeRefreshToken(cookies);
  if (!tokens?.accessToken) {
    return res.status(401).json({ error: 'Could not obtain access token' });
  }

  const { query, variables } = req.body || {};
  if (!query) {
    return res.status(400).json({ error: 'Missing query' });
  }

  const graphqlUrl = getWordPressGraphQLUrl();
  const body: Record<string, unknown> = { query };
  if (variables) body.variables = variables;

  const wpRes = await makeHttpRequest({
    url: graphqlUrl,
    body: JSON.stringify(body),
    authToken: tokens.accessToken,
  });

  return res.status(200).json(wpRes.data);
}
