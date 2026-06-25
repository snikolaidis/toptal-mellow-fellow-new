import { gql } from '@apollo/client';

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