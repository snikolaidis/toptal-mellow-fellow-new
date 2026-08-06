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

/**
 * Pauses (suspends) a subscription. There is no dedicated pause mutation, so
 * this goes through the generic `updateSubscription`, which ultimately calls
 * WooCommerce Subscriptions' own `update_status()`.
 *
 * Before applying any status change, `update_status()` calls its own
 * `can_be_updated_to($new_status)` check, which encodes WooCommerce
 * Subscriptions' business rules for that transition (e.g. an on-hold
 * subscription can't go back to active once its end date has passed — see
 * the `isPastEndDate` check in subscriptions.tsx, which pre-empts that one
 * case). If the check fails, `update_status()` throws a PHP exception
 * instead of changing anything. WPGraphQL catches that exception inside the
 * mutation resolver and turns it into a GraphQL error rather than a hard
 * 500, so it shows up in the response's `errors` array — that's what
 * surfaces as the `window.alert` message in the UI. Because this reuses the
 * generic mutation, a Pause or Resume call can be rejected for reasons that
 * have nothing to do with our own logic — it's WooCommerce Subscriptions'
 * internal rulebook, not something this frontend controls.
 */
export const PAUSE_SUBSCRIPTION = gql`
  mutation PauseSubscription($id: ID!) {
    updateSubscription(input: { id: $id, status: ON_HOLD }) {
      subscription {
        status
      }
    }
  }
`;

/** Resumes an on-hold subscription. */
export const RESUME_SUBSCRIPTION = gql`
  mutation ResumeSubscription($id: ID!) {
    reactivateSubscription(input: { id: $id }) {
      subscription {
        status
      }
    }
  }
`;
