import type { NextApiRequest, NextApiResponse } from 'next';
import http from 'http';
import https from 'https';

/**
 * Customer Registration API Route
 *
 * Registers a new WooCommerce customer via GraphQL
 */

// HTTPS agent for self-signed certificates in development
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV === 'production',
});

interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

async function makeGraphQLRequest(
  urlString: string,
  body: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      agent: isHttps ? httpsAgent : undefined,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const wordpressUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const graphqlEndpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/graphql';
  const url = `${wordpressUrl}${graphqlEndpoint}`;

  try {
    const { email, password, firstName, lastName }: RegisterRequest = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // WooGraphQL registerCustomer mutation
    const mutation = `
      mutation RegisterCustomer($input: RegisterCustomerInput!) {
        registerCustomer(input: $input) {
          customer {
            id
            databaseId
            email
            firstName
            lastName
          }
        }
      }
    `;

    const variables = {
      input: {
        email,
        password,
        firstName: firstName || '',
        lastName: lastName || '',
        username: email, // Use email as username
      },
    };

    const requestBody = JSON.stringify({ query: mutation, variables });
    const response = await makeGraphQLRequest(url, requestBody);
    const result = response.data;

    if (result.errors) {
      const errorMessage = result.errors[0]?.message || 'Registration failed';
      console.error('Registration error:', result.errors);
      return res.status(400).json({
        success: false,
        message: errorMessage,
      });
    }

    if (result.data?.registerCustomer?.customer) {
      return res.status(200).json({
        success: true,
        customer: result.data.registerCustomer.customer,
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Registration failed - no customer returned',
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during registration',
    });
  }
}
