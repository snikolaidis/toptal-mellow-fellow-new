import type { NextApiRequest, NextApiResponse } from 'next';
import { withRateLimitOnly } from '@/lib/middleware';

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Verifies a typed address is real and deliverable via Google Address Validation.
// Fails open (deliverable: true) whenever we cannot get a clear negative, so a
// misconfiguration or Google outage never blocks checkout.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ deliverable: true, skipped: true });
  }
  if (!GOOGLE_KEY) {
    return res.status(200).json({ deliverable: true, skipped: true });
  }

  const { address1, address2, city, state, postcode, country } = req.body || {};
  if (!address1 || !city || !state || !postcode) {
    return res.status(200).json({ deliverable: true, skipped: true });
  }

  try {
    const body = {
      address: {
        regionCode: country || 'US',
        administrativeArea: state,
        locality: city,
        postalCode: postcode,
        addressLines: [address1].filter(Boolean),
      },
    };
    const r = await fetch(
      `https://addressvalidation.googleapis.com/v1:validateAddress?key=${GOOGLE_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    if (!r.ok) {
      throw new Error('address validation request failed');
    }
    const data = await r.json();
    const verdict = data?.result?.verdict || {};
    // Deliverable = Google localized it to a specific building (PREMISE/SUB_PREMISE)
    // with no components it could not confirm and no spell correction. We validate the
    // street line only, so a missing or unconfirmable apartment is fine; a spell-corrected
    // address means the customer typed it wrong and Google guessed, so make them fix it.
    const granularity = verdict.validationGranularity;
    const deliverable =
      (granularity === 'PREMISE' || granularity === 'SUB_PREMISE') &&
      verdict.hasUnconfirmedComponents !== true &&
      verdict.hasSpellCorrectedComponents !== true;
    return res.status(200).json({
      deliverable,
      formatted: data?.result?.address?.formattedAddress || '',
    });
  } catch {
    console.error('[Address Validate] request failed');
    return res.status(200).json({ deliverable: true, skipped: true });
  }
}

export default withRateLimitOnly(30, 60000)(handler);
