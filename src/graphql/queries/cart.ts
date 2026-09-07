import { gql } from '@apollo/client';

export const CART_FIELDS = gql`
  fragment CartFields on Cart {
    contents {
      itemCount
      nodes {
        key
        quantity
        total
        bbBundleId
        bbGroupKey
        bbLocked
        bbUnitPrice
        product {
          node {
            id
            databaseId
            name
            slug
            ... on SimpleProduct {
              price
            }
            ... on VariableProduct {
              price
            }
            image {
              sourceUrl
              altText
            }
            ... on SimpleProduct {
              mfproductTypes {
                nodes {
                  name
                  slug
                }
              }
            }
          }
        }
        variation {
          node {
            id
            databaseId
            name
            price
          }
        }
      }
    }
    subtotal
    total
    discountTotal
    shippingTotal
    isEmpty
    appliedCoupons {
      code
      discountAmount
      discountTax
    }
    availableShippingMethods {
      packageDetails
      supportsShippingCalculator
      rates {
        id
        instanceId
        methodId
        label
        cost
      }
    }
    chosenShippingMethods
  }
`;

export const CART_FIELDS_LITE = gql`
  fragment CartFieldsLite on Cart {
    contents {
      itemCount
      nodes {
        key
        quantity
        total
        bbBundleId
        bbGroupKey
        bbLocked
        bbUnitPrice
        product {
          node {
            id
            databaseId
            name
            slug
            ... on SimpleProduct {
              price
            }
            ... on VariableProduct {
              price
            }
            image {
              sourceUrl
              altText
            }
            ... on SimpleProduct {
              mfproductTypes {
                nodes {
                  name
                  slug
                }
              }
            }
          }
        }
        variation {
          node {
            id
            databaseId
            name
            price
          }
        }
      }
    }
    subtotal
    total
    discountTotal
    shippingTotal
    isEmpty
    appliedCoupons {
      code
      discountAmount
      discountTax
    }
  }
`;

export const GET_CART_LITE = gql`
  ${CART_FIELDS_LITE}
  query GetCartLite {
    cart {
      ...CartFieldsLite
    }
  }
`;

export const GET_CART = gql`
  ${CART_FIELDS}
  query GetCart {
    cart {
      ...CartFields
    }
  }
`;

export const ADD_TO_CART = gql`
  ${CART_FIELDS}
  mutation AddToCart($productId: Int!, $quantity: Int = 1, $variationId: Int) {
    addToCart(
      input: { productId: $productId, quantity: $quantity, variationId: $variationId }
    ) {
      cart {
        ...CartFields
      }
    }
  }
`;

// "byob" bundle mode — config (min/max items, discount rules) lives on the
// product itself now, so adding to cart just needs that product's own ID
// (the bundle "identity") plus whichever items the shopper picked.
export const ADD_BUNDLE_TO_CART = gql`
  mutation AddBundleToCart($productId: Int!, $productIds: [Int!]!) {
    addBundleToCart(input: { productId: $productId, productIds: $productIds }) {
      success
      message
      groupKey
      addedItemKeys
    }
  }
`;

// "Fixed" bundle mode (bbBundleMode: "fixed") — the admin has already picked
// the exact items/quantities on the product itself (bbFixedItems), so adding
// to cart only needs the product's own ID and how many sets to add.
export const ADD_FIXED_BUNDLE_TO_CART = gql`
  mutation AddFixedBundleToCart($productId: Int!, $quantity: Int) {
    addFixedBundleToCart(input: { productId: $productId, quantity: $quantity }) {
      success
      message
      groupKey
      addedItemKeys
    }
  }
`;

export const REMOVE_BUNDLE_FROM_CART = gql`
  mutation RemoveBundleFromCart($groupKey: String!) {
    removeBundleFromCart(input: { groupKey: $groupKey }) {
      success
      removedCount
      cartItemCount
      cartSubtotal
      cartTotal
    }
  }
`;

export const UPDATE_CART_ITEM_QUANTITY = gql`
  ${CART_FIELDS}
  mutation UpdateCartItemQuantity($key: ID!, $quantity: Int!) {
    updateItemQuantities(input: { items: [{ key: $key, quantity: $quantity }] }) {
      cart {
        ...CartFields
      }
    }
  }
`;

export const REMOVE_FROM_CART = gql`
  ${CART_FIELDS}
  mutation RemoveFromCart($keys: [ID!]!) {
    removeItemsFromCart(input: { keys: $keys }) {
      cart {
        ...CartFields
      }
    }
  }
`;

export const CLEAR_CART = gql`
  ${CART_FIELDS}
  mutation ClearCart {
    emptyCart(input: {}) {
      cart {
        ...CartFields
      }
    }
  }
`;

export const APPLY_COUPON = gql`
  ${CART_FIELDS}
  mutation ApplyCoupon($code: String!) {
    applyCoupon(input: { code: $code }) {
      cart {
        ...CartFields
      }
    }
  }
`;

export const REMOVE_COUPON = gql`
  ${CART_FIELDS}
  mutation RemoveCoupon($code: String!) {
    removeCoupons(input: { codes: [$code] }) {
      cart {
        ...CartFields
      }
    }
  }
`;

export const ADD_TO_CART_LITE = gql`
  ${CART_FIELDS_LITE}
  mutation AddToCartLite($productId: Int!, $quantity: Int = 1, $variationId: Int) {
    addToCart(
      input: { productId: $productId, quantity: $quantity, variationId: $variationId }
    ) {
      cart {
        ...CartFieldsLite
      }
    }
  }
`;

export const UPDATE_CART_ITEM_QUANTITY_LITE = gql`
  ${CART_FIELDS_LITE}
  mutation UpdateCartItemQuantityLite($key: ID!, $quantity: Int!) {
    updateItemQuantities(input: { items: [{ key: $key, quantity: $quantity }] }) {
      cart {
        ...CartFieldsLite
      }
    }
  }
`;

export const REMOVE_FROM_CART_LITE = gql`
  ${CART_FIELDS_LITE}
  mutation RemoveFromCartLite($keys: [ID!]!) {
    removeItemsFromCart(input: { keys: $keys }) {
      cart {
        ...CartFieldsLite
      }
    }
  }
`;

export const CLEAR_CART_LITE = gql`
  ${CART_FIELDS_LITE}
  mutation ClearCartLite {
    emptyCart(input: {}) {
      cart {
        ...CartFieldsLite
      }
    }
  }
`;

export const APPLY_COUPON_LITE = gql`
  ${CART_FIELDS_LITE}
  mutation ApplyCouponLite($code: String!) {
    applyCoupon(input: { code: $code }) {
      cart {
        ...CartFieldsLite
      }
    }
  }
`;

export const REMOVE_COUPON_LITE = gql`
  ${CART_FIELDS_LITE}
  mutation RemoveCouponLite($code: String!) {
    removeCoupons(input: { codes: [$code] }) {
      cart {
        ...CartFieldsLite
      }
    }
  }
`;

export const UPDATE_SHIPPING_METHOD = gql`
  ${CART_FIELDS}
  mutation UpdateShippingMethod($shippingMethods: [String]!) {
    updateShippingMethod(input: { shippingMethods: $shippingMethods }) {
      cart {
        ...CartFields
      }
    }
  }
`;
