/**
 * Authorize.net Accept.js Integration
 *
 * This module handles secure card tokenization using Authorize.net's Accept.js library.
 * Card data is tokenized client-side and NEVER touches your server, ensuring PCI compliance.
 *
 * Security features:
 * - Card numbers are tokenized before transmission
 * - Raw card data never reaches your server
 * - Uses Authorize.net's hosted payment data collection
 * - Supports both sandbox and production environments
 */

declare global {
  interface Window {
    Accept: {
      dispatchData: (
        secureData: AuthorizeNetSecureData,
        responseHandler: (response: AuthorizeNetResponse) => void
      ) => void;
    };
  }
}

interface AuthorizeNetSecureData {
  authData: {
    clientKey: string;
    apiLoginID: string;
  };
  cardData: {
    cardNumber: string;
    month: string;
    year: string;
    cardCode: string;
  };
}

interface AuthorizeNetResponse {
  opaqueData?: {
    dataDescriptor: string;
    dataValue: string;
  };
  messages: {
    resultCode: 'Ok' | 'Error';
    message: Array<{
      code: string;
      text: string;
    }>;
  };
}

export interface CardData {
  cardNumber: string;
  expirationMonth: string;
  expirationYear: string;
  cvv: string;
}

export interface OpaqueData {
  dataDescriptor: string;
  dataValue: string;
}

/**
 * Tokenize card data using Accept.js
 *
 * This function securely tokenizes the card data client-side.
 * The resulting token (opaqueData) can be safely sent to your server
 * for processing without exposing the actual card details.
 */
export async function processPayment(cardData: CardData): Promise<OpaqueData> {
  return new Promise((resolve, reject) => {
    // Verify Accept.js is loaded
    if (typeof window === 'undefined' || !window.Accept) {
      reject(new Error('Accept.js is not loaded. Please refresh the page.'));
      return;
    }

    const apiLoginId = process.env.NEXT_PUBLIC_AUTHORIZE_API_LOGIN_ID;
    const clientKey = process.env.NEXT_PUBLIC_AUTHORIZE_CLIENT_KEY;

    if (!apiLoginId || !clientKey) {
      reject(new Error('Authorize.net credentials are not configured.'));
      return;
    }

    const secureData: AuthorizeNetSecureData = {
      authData: {
        clientKey: clientKey,
        apiLoginID: apiLoginId,
      },
      cardData: {
        cardNumber: cardData.cardNumber,
        month: cardData.expirationMonth,
        year: cardData.expirationYear,
        cardCode: cardData.cvv,
      },
    };

    window.Accept.dispatchData(secureData, (response: AuthorizeNetResponse) => {
      if (response.messages.resultCode === 'Error') {
        const errorMessage = response.messages.message
          .map((msg) => msg.text)
          .join(', ');
        reject(new Error(errorMessage));
        return;
      }

      if (response.opaqueData) {
        resolve({
          dataDescriptor: response.opaqueData.dataDescriptor,
          dataValue: response.opaqueData.dataValue,
        });
      } else {
        reject(new Error('No payment token received. Please try again.'));
      }
    });
  });
}

/**
 * Validate card number using Luhn algorithm
 */
export function isValidCardNumber(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');

  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Detect card type from card number
 */
export function getCardType(cardNumber: string): string {
  const cleanNumber = cardNumber.replace(/\D/g, '');

  const patterns: Record<string, RegExp> = {
    visa: /^4/,
    mastercard: /^5[1-5]|^2[2-7]/,
    amex: /^3[47]/,
    discover: /^6(?:011|5)/,
    diners: /^3(?:0[0-5]|[68])/,
    jcb: /^35/,
  };

  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(cleanNumber)) {
      return type;
    }
  }

  return 'unknown';
}

/**
 * Format card number for display
 */
export function formatCardNumber(cardNumber: string): string {
  const cleanNumber = cardNumber.replace(/\D/g, '');
  const cardType = getCardType(cleanNumber);

  // American Express uses different formatting (4-6-5)
  if (cardType === 'amex') {
    return cleanNumber.replace(/(\d{4})(\d{6})(\d{5})/, '$1 $2 $3').trim();
  }

  // All other cards use 4-4-4-4 formatting
  return cleanNumber.replace(/(\d{4})/g, '$1 ').trim();
}

/**
 * Validate expiration date
 */
export function isValidExpiration(month: string, year: string): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const expMonth = parseInt(month, 10);
  const expYear = parseInt(year.length === 2 ? `20${year}` : year, 10);

  if (expYear < currentYear) {
    return false;
  }

  if (expYear === currentYear && expMonth < currentMonth) {
    return false;
  }

  return expMonth >= 1 && expMonth <= 12;
}

/**
 * Validate CVV
 */
export function isValidCvv(cvv: string, cardType: string): boolean {
  const cleanCvv = cvv.replace(/\D/g, '');

  // American Express uses 4-digit CVV
  if (cardType === 'amex') {
    return cleanCvv.length === 4;
  }

  // All other cards use 3-digit CVV
  return cleanCvv.length === 3;
}
