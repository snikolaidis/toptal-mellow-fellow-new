<?php
/**
 * Plugin Name: Mellow Fellow - Taxonomy Param Resolver
 * Description: Shared allowlist resolver for the `taxonomy` REST param accepted by
 *              the collection-meta, collection-facets and collection-products
 *              endpoints. Anything absent, empty or unrecognised resolves to
 *              'collection', so existing callers are unaffected.
 * Version: 1.1.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'MF_TAXONOMY_PARAM_ALLOWLIST', [ 'collection', 'mood', 'product_cat' ] );

function mf_resolve_taxonomy_param( WP_REST_Request $request ) {
    $raw = $request->get_param( 'taxonomy' );

    if ( ! is_string( $raw ) ) {
        return 'collection';
    }

    return in_array( $raw, MF_TAXONOMY_PARAM_ALLOWLIST, true ) ? $raw : 'collection';
}
