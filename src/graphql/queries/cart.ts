import { gql } from '@apollo/client';

export const CART_FIELDS = gql`
  fragment CartFields on Cart {
    contents {
      itemCount
      nodes {
        key
        quantity
        total
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
