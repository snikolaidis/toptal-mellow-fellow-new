<?php
/**
 * Plugin Name: Mellow Fellow - GraphQL Query Limits
 * Description: Raises WPGraphQL max query amount from 100 to 500 for client-side filtering.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_filter( 'graphql_connection_max_query_amount', function() {
    return 500;
});

add_filter( 'graphql_max_query_depth', function() {
    return 20;
});
