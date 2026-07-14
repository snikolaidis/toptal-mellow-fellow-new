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
        isVariable
        rateCents
        isFreeProduct
        productId
        imageUrl
      }
    }
  }
`;

export const REDEEM_LOYALTY_OPTION = gql`
  mutation RedeemLoyaltyOption($optionId: Int!, $pointsToRedeem: Int) {
    redeemLoyaltyOption(input: { optionId: $optionId, pointsToRedeem: $pointsToRedeem }) {
      success
      code
      message
      productId
    }
  }
`;

export const GET_LOYALTY_PROGRAM = gql`
  query GetLoyaltyProgram {
    loyaltyProgram {
      authenticated
      firstName
      pointsBalance
      currentTier
      totalSpentCents
      vipTiers {
        name
        rangeText
        spendCents
        multiplier
        isBase
      }
      earnRules {
        title
        rewardText
        ctaText
      }
      referral {
        link
        rewardText
        shareText
      }
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
        company
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
        company
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
          subtotal
          shippingTotal
          discountTotal
          totalTax
          paymentMethodTitle
          billing {
            firstName
            lastName
            company
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
            company
            address1
            address2
            city
            state
            postcode
            country
          }
          couponLines {
            nodes {
              code
              discount
            }
          }
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

export const GET_CUSTOMER_BILLING = gql`
  query GetCustomerBilling {
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
        company
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
        company
        address1
        address2
        city
        state
        postcode
        country
      }
    }
  }
`;

export const GET_CUSTOMER_ORDERS = gql`
  query GetCustomerOrders {
    customer {
      id
      databaseId
      email
      firstName
      lastName
      displayName
      billing {
        address1
        country
      }
      shipping {
        address1
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
          company
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
          company
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

export const SEND_PASSWORD_RESET_EMAIL = gql`
  mutation SendPasswordResetEmail($username: String!) {
    sendPasswordResetEmail(input: { username: $username }) {
      success
    }
  }
`;

export const RESET_USER_PASSWORD = gql`
  mutation ResetUserPassword($key: String!, $login: String!, $password: String!) {
    resetUserPassword(input: { key: $key, login: $login, password: $password }) {
      user {
        databaseId
      }
    }
  }
`;
