import type { NextApiRequest, NextApiResponse } from "next";
import { verifyJwt, extractJwt } from "@/lib/jwt-auth";
import { validateSession } from "@/lib/session-manager";
import { exchangeRefreshToken } from "@/lib/faust-auth";
import { makeHttpRequest, getWordPressGraphQLUrl } from "@/lib/http";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const cookies = req.headers.cookie || "";
  const jwt = extractJwt(cookies);
  const result = jwt ? verifyJwt(jwt) : null;
  console.log("GraphQL request with JWT:", jwt, result);
  if (!result || !(await validateSession(result.sessionId))) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const tokens = await exchangeRefreshToken(cookies);
  if (!tokens?.accessToken) {
    const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
    const faustSecret = process.env.FAUST_SECRET_KEY || '';

    if (!wordpressUrl || !faustSecret) {
      return res.status(401).json({ error: "Could not obtain access token" });
    }

    const customerResponse = await fetch(
      `${wordpressUrl}/wp-json/mellow-fellow/v1/checkout-customer?user_id=${result.userId}`,
      {
        headers: {
          Accept: 'application/json',
          'X-FaustWP-Secret': faustSecret,
        },
      },
    );
    const customerResult = await customerResponse.json();

    if (!customerResponse.ok) {
      return res.status(customerResponse.status).json(customerResult);
    }

    return res.status(200).json({
      data: {
        customer: {
          ...customerResult.customer,
          firstName: customerResult.customer.contact?.firstName || '',
          lastName: customerResult.customer.contact?.lastName || '',
          displayName: [
            customerResult.customer.contact?.firstName,
            customerResult.customer.contact?.lastName,
          ].filter(Boolean).join(' '),
          orders: { nodes: customerResult.customer.orders || [] },
        },
      },
    });
  }

  const { query, variables } = req.body || {};
  if (!query) {
    return res.status(400).json({ error: "Missing query" });
  }

  const graphqlUrl = getWordPressGraphQLUrl();
  console.log("GraphQL URL:", graphqlUrl);
  const body: Record<string, unknown> = { query };
  if (variables) body.variables = variables;

  const wpRes = await makeHttpRequest({
    url: graphqlUrl,
    body: JSON.stringify(body),
    authToken: tokens.accessToken,
  });

  console.log("WordPress GraphQL response:", wpRes.data);
  return res.status(200).json(wpRes.data);
}
