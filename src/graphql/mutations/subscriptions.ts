import { gql } from '@apollo/client';

/**
 * Cancels a subscription (WooGraphQL Pro). Requires an authenticated client —
 * the resolver reads the logged-in user to enforce ownership. `id` accepts a
 * global (Relay) ID or a database ID; we pass the database ID, since neither
 * `id` nor `databaseId` resolves on Subscription nodes in the customer
 * connection (selecting the non-null `id` there fails the whole query).
 *
 * Note this runs WooCommerce Subscriptions' `cancel_order()`, so a subscription
 * with a paid-up period left lands on `PENDING_CANCEL` rather than `CANCELLED`.
 */
export const CANCEL_SUBSCRIPTION = gql`
  mutation CancelSubscription($id: ID!) {
    cancelSubscription(input: { id: $id }) {
      subscription {
        status
      }
    }
  }
`;
