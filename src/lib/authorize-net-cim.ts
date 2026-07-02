/**
 * Authorize.net CIM (Customer Information Manager) — Server-Side Only
 *
 * Manages customer payment profiles for saved cards and subscription renewals.
 * Uses the Authorize.net XML API (same endpoint as transaction processing).
 *
 * Key flows:
 * - createProfileFromTransaction: After a successful charge, saves the card
 *   as a reusable CIM profile (no raw card data handled).
 * - chargeProfile: Charges a saved card by profile ID.
 * - getProfile: Retrieves saved card details (masked numbers).
 * - deletePaymentProfile: Removes a saved card.
 */

export interface CimProfile {
  customerProfileId: string;
  paymentProfileId: string;
}

export interface SavedCard {
  paymentProfileId: string;
  last4: string;
  cardType: string;
  expDate: string;
}

export interface ChargeResult {
  transactionId: string;
  authCode: string;
}

function getApiUrl(): string {
  const env = process.env.NEXT_PUBLIC_AUTHORIZE_ENVIRONMENT || 'sandbox';
  return env === 'production'
    ? 'https://api.authorize.net/xml/v1/request.api'
    : 'https://apitest.authorize.net/xml/v1/request.api';
}

function getMerchantAuth() {
  const name = process.env.NEXT_PUBLIC_AUTHORIZE_API_LOGIN_ID;
  const transactionKey = process.env.AUTHORIZE_TRANSACTION_KEY;
  if (!name || !transactionKey) {
    throw new Error('Authorize.net credentials not configured');
  }
  return { name, transactionKey };
}

async function callApi(payload: Record<string, any>): Promise<any> {
  const response = await fetch(getApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

/**
 * Create a CIM customer profile from a completed transaction.
 * This reuses the card data already on file at Authorize.net — no raw
 * card data is handled. PCI-compliant by design.
 *
 * Handles E00039 (duplicate profile) by parsing the existing profile ID
 * from the error message and returning it.
 */
export async function createProfileFromTransaction(
  transactionId: string,
  merchantCustomerId: string,
  email: string
): Promise<CimProfile> {
  const result = await callApi({
    createCustomerProfileFromTransactionRequest: {
      merchantAuthentication: getMerchantAuth(),
      transId: transactionId,
      customer: {
        merchantCustomerId,
        email,
      },
    },
  });

  // Success
  if (result.messages?.resultCode === 'Ok') {
    const profileId = result.customerProfileId;
    const paymentProfileId =
      result.customerPaymentProfileIdList?.numericString?.[0] ||
      result.customerPaymentProfileIdList?.[0];

    console.log(`[CIM] Created profile ${profileId}, payment profile ${paymentProfileId}`);

    return {
      customerProfileId: profileId,
      paymentProfileId: paymentProfileId || '',
    };
  }

  // E00039: Duplicate profile — parse existing profile ID from error message
  const errorCode = result.messages?.message?.[0]?.code;
  const errorText = result.messages?.message?.[0]?.text || '';

  if (errorCode === 'E00039') {
    // Error text format: "A duplicate record with ID {id} already exists."
    const match = errorText.match(/ID\s+(\d+)/i);
    if (match) {
      const existingProfileId = match[1];
      console.log(`[CIM] Profile already exists: ${existingProfileId}, adding payment profile`);

      // The transaction's payment method was auto-added to the existing profile.
      // Fetch the profile to get the latest payment profile ID.
      const profile = await getProfile(existingProfileId);
      const latestPaymentProfile = profile?.paymentProfiles?.at(-1);

      return {
        customerProfileId: existingProfileId,
        paymentProfileId: latestPaymentProfile?.paymentProfileId || '',
      };
    }
  }

  console.error(`[CIM] Profile creation failed: ${errorCode} - ${errorText}`);
  throw new Error(`CIM profile creation failed: ${errorText}`);
}

/**
 * Charge a saved card using CIM profile IDs.
 * Used for both saved-card checkout and subscription renewals.
 */
export async function chargeProfile(
  customerProfileId: string,
  paymentProfileId: string,
  amount: string,
  refId?: string
): Promise<ChargeResult> {
  const result = await callApi({
    createTransactionRequest: {
      merchantAuthentication: getMerchantAuth(),
      refId: (refId || `cim_${Date.now()}`).substring(0, 20),
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount,
        profile: {
          customerProfileId,
          paymentProfile: {
            paymentProfileId,
          },
        },
      },
    },
  });

  if (
    result.messages?.resultCode !== 'Ok' ||
    result.transactionResponse?.responseCode !== '1'
  ) {
    const errorMessage =
      result.transactionResponse?.errors?.[0]?.errorText ||
      result.messages?.message?.[0]?.text ||
      'Saved card charge failed';

    console.error(`[CIM] Charge failed: ${errorMessage}`);
    throw new Error(errorMessage);
  }

  console.log(`[CIM] Charge successful: ${result.transactionResponse.transId}`);

  return {
    transactionId: result.transactionResponse.transId,
    authCode: result.transactionResponse.authCode,
  };
}

/**
 * Get a customer profile with all payment profiles (masked card data).
 */
export async function getProfile(customerProfileId: string): Promise<any> {
  const result = await callApi({
    getCustomerProfileRequest: {
      merchantAuthentication: getMerchantAuth(),
      customerProfileId,
      includeIssuerInfo: 'true',
    },
  });

  if (result.messages?.resultCode !== 'Ok') {
    console.error(`[CIM] Get profile failed: ${result.messages?.message?.[0]?.text}`);
    return null;
  }

  return result.profile || null;
}

/**
 * Get saved cards for a customer profile, formatted for the frontend.
 */
export async function getSavedCards(customerProfileId: string): Promise<SavedCard[]> {
  const profile = await getProfile(customerProfileId);
  if (!profile?.paymentProfiles) return [];

  const profiles = Array.isArray(profile.paymentProfiles)
    ? profile.paymentProfiles
    : [profile.paymentProfiles];

  return profiles.map((pp: any) => {
    const card = pp.payment?.creditCard || {};
    return {
      paymentProfileId: pp.customerPaymentProfileId,
      last4: (card.cardNumber || '').slice(-4),
      cardType: card.cardType || 'Unknown',
      expDate: card.expirationDate || '',
    };
  });
}

/**
 * Delete a specific payment profile from a customer profile.
 */
export async function deletePaymentProfile(
  customerProfileId: string,
  paymentProfileId: string
): Promise<boolean> {
  const result = await callApi({
    deleteCustomerPaymentProfileRequest: {
      merchantAuthentication: getMerchantAuth(),
      customerProfileId,
      customerPaymentProfileId: paymentProfileId,
    },
  });

  if (result.messages?.resultCode === 'Ok') {
    console.log(`[CIM] Deleted payment profile ${paymentProfileId}`);
    return true;
  }

  console.error(`[CIM] Delete failed: ${result.messages?.message?.[0]?.text}`);
  return false;
}
