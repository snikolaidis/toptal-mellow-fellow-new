import type { NextApiRequest, NextApiResponse } from 'next';
import { makeHttpRequest, getWordPressGraphQLUrl } from '@/lib/http';
import { withMiddleware, withCsrf, withRateLimit } from '@/lib/middleware';

/**
 * Customer Registration API Route
 *
 * Registers a new WooCommerce customer via GraphQL.
 * Protected with CSRF validation and rate limiting (3 attempts per 15 min).
 */

interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const url = getWordPressGraphQLUrl();

  if (!url) {
    return res.status(500).json({ message: 'WordPress URL not configured' });
  }

  try {
    const { email, password, firstName, lastName }: RegisterRequest = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    // Enforce password strength
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
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
        username: email,
      },
    };

    const response = await makeHttpRequest({
      url,
      body: JSON.stringify({ query: mutation, variables }),
    });

    const result = response.data;

    if (result.errors) {
      return res.status(400).json({
        success: false,
        message: 'Registration failed. Please try again.',
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
      message: 'Registration failed. Please try again.',
    });
  } catch (error) {
    console.error('Registration failed');
    return res.status(500).json({
      success: false,
      message: 'An error occurred during registration',
    });
  }
}

export default withMiddleware(
  withCsrf(),
  withRateLimit({ maxAttempts: 3, windowMs: 15 * 60 * 1000 })
)(handler);
