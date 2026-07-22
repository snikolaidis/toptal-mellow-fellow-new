import { setConfig } from '@faustwp/core';
import templates from './src/templates';
import possibleTypes from './possibleTypes.json';

/**
 * Faust defaults its GraphQL endpoint to `${wpUrl}/index.php?graphql`, which our
 * WP Engine host 503s for server-side (Node) requests. Point Faust's Apollo
 * client at the pretty-permalink `/graphql` endpoint (the same one the project's
 * own Apollo client uses successfully) via the `graphqlEndpoint` filter.
 */
class GraphqlEndpointPlugin {
  apply(hooks) {
    hooks.addFilter(
      'graphqlEndpoint',
      'faust-woocommerce-store',
      (_endpoint, { wpUrl }) => `${wpUrl}/graphql`,
    );
  }
}

/**
 * @type {import('@faustwp/core').FaustConfig}
 */
export default setConfig({
  templates,
  plugins: [new GraphqlEndpointPlugin()],
  possibleTypes,
  usePersistedQueries: true,
  useGETForQueries: true,
});
