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
  opaqueData?: {
    dataDescriptor: string;
    dataValue: string;
  };
  savedCard?: {
    customerProfileId: string;
    paymentProfileId: string;
  };
  saveCard?: boolean;
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
