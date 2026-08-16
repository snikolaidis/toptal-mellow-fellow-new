import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfValuePropsSetFragment`,
  entry: gql`
    fragment AcfValuePropsSetFragment on AcfValuePropsSet {
      __typename
    }
  `,
};
