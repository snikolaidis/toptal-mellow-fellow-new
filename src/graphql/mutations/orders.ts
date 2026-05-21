import { gql } from '@apollo/client';

export const CREATE_ORDER = gql`
  mutation CreateOrder(
    $billing: CustomerAddressInput!
    $shipping: CustomerAddressInput!
    $paymentMethod: String!
    $transactionId: String
    $lineItems: [LineItemInput!]!
  ) {
    createOrder(
      input: {
        billing: $billing
        shipping: $shipping
        paymentMethod: $paymentMethod
        transactionId: $transactionId
        lineItems: $lineItems
        isPaid: true
      }
    ) {
      orderId
      order {
        id
        databaseId
        orderNumber
        status
        total
      }
    }
  }
`;

/**
 * Create a pending order (status = 'pending', isPaid = false)
 * Used in the new checkout flow: create order first, then process payment
 */
export const CREATE_PENDING_ORDER = gql`
  mutation CreatePendingOrder($input: CreateOrderInput!) {
    createOrder(input: $input) {
      orderId
      order {
        id
        databaseId
        orderNumber
        status
        total
      }
    }
  }
`;

/**
 * Update order status after successful payment
 * Changes status from 'pending' to 'processing' and marks as paid
 */
export const UPDATE_ORDER = gql`
  mutation UpdateOrder($input: UpdateOrderInput!) {
    updateOrder(input: $input) {
      order {
        id
        databaseId
        orderNumber
        status
        paymentMethod
        transactionId
      }
    }
  }
`;

/**
 * Get order by ID for payment verification
 * Used to verify order exists and get current status before payment
 */
export const GET_ORDER_FOR_PAYMENT = gql`
  query GetOrderForPayment($id: ID!) {
    order(id: $id, idType: DATABASE_ID) {
      id
      databaseId
      orderNumber
      status
      total
      billing {
        email
        firstName
        lastName
      }
    }
  }
`;

export const GET_ORDER = gql`
  query GetOrder($id: ID!) {
    order(id: $id, idType: DATABASE_ID) {
      id
      databaseId
      orderNumber
      status
      date
      total
      subtotal
      shippingTotal
      discountTotal
      billing {
        firstName
        lastName
        email
        phone
        address1
        address2
        city
        state
        postcode
        country
      }
      shipping {
        firstName
        lastName
        address1
        address2
        city
        state
        postcode
        country
      }
      lineItems {
        nodes {
          quantity
          total
          product {
            node {
              name
              image {
                sourceUrl
              }
            }
          }
        }
      }
    }
  }
`;
