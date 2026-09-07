import type { NextApiRequest, NextApiResponse } from 'next';
import { withRateLimitOnly } from '@/lib/middleware';

// Pin this. Klaviyo versions by date, so tracking "today" lets the request
// contract change under us without a deploy.
const KLAVIYO_REVISION = '2026-07-15';

const KLAVIYO_LIST_ID = 'Rk6tVV';

const KLAVIYO_SUBSCRIBE_URL =
  'https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs';

interface SubscribeResponse {
  success: boolean;
  error?: string;
}

// Deliberately loose. Klaviyo is the authority on what it accepts, and a
// stricter pattern silently rejects valid addresses more often than it
// catches typos.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SubscribeResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const email =
    typeof req.body?.email === 'string' ? req.body.email.trim() : '';

  if (!email || !EMAIL_PATTERN.test(email)) {
    return res
      .status(400)
      .json({ success: false, error: 'Please enter a valid email address.' });
  }

  const apiKey = process.env.KLAVIYO_PRIVATE_KEY;

  if (!apiKey) {
    console.error('newsletter-subscribe: KLAVIYO_PRIVATE_KEY is not set');
    return res.status(503).json({
      success: false,
      error: 'Signup is unavailable right now. Please try again later.',
    });
  }

  try {
    const klaviyoResponse = await fetch(KLAVIYO_SUBSCRIBE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: KLAVIYO_REVISION,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        data: {
          type: 'profile-subscription-bulk-create-job',
          attributes: {
            profiles: {
              data: [
                {
                  type: 'profile',
                  attributes: {
                    email,
                    subscriptions: {
                      email: { marketing: { consent: 'SUBSCRIBED' } },
                    },
                  },
                },
              ],
            },
          },
          relationships: {
            list: { data: { type: 'list', id: KLAVIYO_LIST_ID } },
          },
        },
      }),
    });

    // 202 means queued, not subscribed. The endpoint is bulk and async, so it
    // reports nothing per profile: an address already on the list returns 202
    // exactly like a new one, and anything that fails while the job runs never
    // reaches us. There is no duplicate case to branch on here.
    if (klaviyoResponse.status === 202) {
      return res.status(200).json({ success: true });
    }

    if (klaviyoResponse.status === 400) {
      return res
        .status(400)
        .json({ success: false, error: 'Please enter a valid email address.' });
    }

    const detail = await klaviyoResponse.text().catch(() => '');
    console.error(
      'newsletter-subscribe: Klaviyo returned',
      klaviyoResponse.status,
      detail.slice(0, 500)
    );
    return res
      .status(502)
      .json({ success: false, error: 'Something went wrong. Please try again.' });
  } catch (error) {
    console.error('newsletter-subscribe: request to Klaviyo failed', error);
    return res
      .status(502)
      .json({ success: false, error: 'Something went wrong. Please try again.' });
  }
}

export default withRateLimitOnly(5, 60000)(handler);
