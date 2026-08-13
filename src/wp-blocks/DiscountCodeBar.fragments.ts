import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfDiscountCodeBarFragment`,
  entry: gql`
    fragment AcfDiscountCodeBarFragment on AcfDiscountCodeBar {
      discountCodeBar {
        text
        discountCode
        textColor
        highlightColor
        backgroundColor
        buttonBackgroundColor
        buttonTextColor
      }
    }
  `,
};
