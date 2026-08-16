import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfFaqFragment`,
  entry: gql`
    fragment AcfFaqFragment on AcfFaq {
      faqBlock {
        groups {
          groupTitle
          footerLinks
          questions {
            question
            answer
          }
        }
      }
    }
  `,
};
