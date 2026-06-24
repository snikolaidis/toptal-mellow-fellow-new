import { gql } from '@apollo/client';

/**
 * Submit the WP "Press Contact" Gravity Form (wp-graphql-gravity-forms).
 * Field values are built in the component and passed as $fieldValues — the
 * Email field goes in as `emailValues { value }`, the text fields as `value`.
 */
export const SUBMIT_CONTACT_FORM = gql`
  mutation SubmitContactForm($formId: ID!, $fieldValues: [FormFieldValuesInput!]!) {
    submitGfForm(input: { id: $formId, fieldValues: $fieldValues }) {
      errors {
        id
        message
      }
      confirmation {
        message
      }
      entry {
        id
      }
    }
  }
`;