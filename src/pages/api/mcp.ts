import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Thin pass-through to the MCP endpoint served by the WordPress mu-plugin
 * (mellow-fellow-mcp.php). It exists because WP Engine sits behind a bot rule
 * that answers 403 to Python HTTP clients, which is what FlowHunt calls from,
 * so FlowHunt cannot reach WordPress directly. This host is not behind that
 * rule, and a server-side fetch from here reaches WordPress fine.
 *
 * No credentials live here. The caller's Authorization header is forwarded
 * unchanged and WordPress is the only thing that validates it.
 */

export const config = { api: { bodyParser: false } };

const UPSTREAM_TIMEOUT_MS = 30000;

function rpcError(code: number, message: string) {
  return { jsonrpc: '2.0', error: { code, message }, id: null };
}

async function readBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json(rpcError(-32000, 'Method not allowed. Use POST.'));
  }

  const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  if (!wpUrl) {
    return res.status(500).json(rpcError(-32603, 'WordPress URL is not configured'));
  }

  const body = await readBody(req);
  const auth = req.headers.authorization;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${wpUrl}/wp-json/mf/v1/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body,
      signal: controller.signal,
    });

    const text = await upstream.text();

    // A notification is answered with 202 and no body, and that has to survive
    // the hop or the client waits for a response that never comes.
    if (!text) {
      return res.status(upstream.status).end();
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return res
      .status(504)
      .json(rpcError(-32603, aborted ? 'Upstream timed out' : 'Could not reach WordPress'));
  } finally {
    clearTimeout(timer);
  }
}
