import { gql } from '@apollo/client';

// Get current logged-in user/customer data
export const GET_VIEWER = gql`
  query GetViewer {
    viewer {
      id
      databaseId
      name
      firstName
      lastName
      email
      username
    }
  }
`;

export const GET_LOYALTY_IDENTITY = gql`
  query GetLoyaltyIdentity {
    loyaltyIdentity {
      authenticated
      email
      id
      token
      tags
    }
  }
`;

export const GET_LOYALTY_REDEMPTION = gql`
  query GetLoyaltyRedemption {
    loyaltyRedemption {
      authenticated
      pointsBalance
      options {
        id
        name
        points
        costText
      }
    }
  }
`;

export const REDEEM_LOYALTY_OPTION = gql`
  mutation RedeemLoyaltyOption($optionId: Int!) {
    redeemLoyaltyOption(input: { optionId: $optionId }) {
      success
      code
      message
    }
  }
`;

// Get customer data with billing/shipping and orders
export const GET_CUSTOMER = gql`
  query GetCustomer {
    customer {
      id
      databaseId
      email
      firstName
      lastName
      displayName
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
      orders(first: 10) {
        nodes {
          id
          databaseId
          orderNumber
          date
          status
          total
          lineItems {
            nodes {
              product {
                node {
                  name
                  slug
                }
              }
              quantity
              total
            }
          }
        }
      }
    }
  }
`;

// Register a new customer (WooGraphQL mutation)
export const REGISTER_CUSTOMER = gql`
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

// Update customer data
export const UPDATE_CUSTOMER = gql`
  mutation UpdateCustomer($input: UpdateCustomerInput!) {
    updateCustomer(input: $input) {
      customer {
        id
        databaseId
        email
        firstName
        lastName
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
      }
    }
  }
`;
