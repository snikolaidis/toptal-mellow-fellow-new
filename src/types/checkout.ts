export interface AddressData {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
}

export interface CheckoutFormData {
  billing: AddressData;
  shipping?: AddressData;
  sameAsBilling: boolean;
}

export interface PaymentData {
  // Which gateway this submission is for — 'authorize_net' (default) charges
  // a card via opaqueData/savedCard below; 'sezzle' carries neither and
  // redirects off-site instead. See handlePayment in checkout.tsx.
  method: string;
  opaqueData?: {
    dataDescriptor: string;
    dataValue: string;
  };
  savedCard?: {
    customerProfileId: string;
    paymentProfileId: string;
  };
  saveCard?: boolean;
  // The shopper's Real ID remember-me pick, carried from PaymentForm up to
  // handlePayment so it's only ever applied after a purchase actually succeeds.
  rememberOption?: string;
}

// A payment method checkout can offer, sourced from GET /api/checkout/payment-methods
// (the built-in card flow plus whatever's enabled in WooCommerce > Settings > Payments).
export interface CheckoutPaymentMethod {
  id: string;
  title: string;
  description: string;
  // Gateway-configured minimum order amount (e.g. Sezzle's own "Minimum
  // Checkout Amount" setting) below which this method shouldn't be offered.
  // Absent/0 means no minimum.
  minAmount?: number;
}

export interface SavedCardInfo {
  paymentProfileId: string;
  last4: string;
  cardType: string;
  expDate: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  authCode?: string;
  message?: string;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  orderDatabaseId?: number;
  message?: string;
}

export interface ShippingRate {
  id: string;
  instanceId: number;
  methodId: string;
  label: string;
  cost: string;
}

export interface ShippingPackage {
  packageDetails: string;
  supportsShippingCalculator: boolean;
  rates: ShippingRate[];
}

export interface AppliedCoupon {
  code: string;
  discountAmount: string;
  discountTax: string;
}
