<?php
/**
 * REST endpoint: GET /mf/v1/search-collections
 *
 * Fast SQL-based collection search, replacing the WPGraphQL query.
 *
 * Params:
 *   q     — search query (min 2 chars)
 *   first — max results to return (default 4, max 12)
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', function () {
    register_rest_route( 'mf/v1', '/search-collections', [
        'methods'             => 'GET',
        'callback'            => 'mf_search_collections_handler',
        'permission_callback' => '__return_true',
    ] );
} );

function mf_search_collections_handler( WP_REST_Request $request ) {
    $q = sanitize_text_field( $request->get_param( 'q' ) ?: '' );

    if ( strlen( $q ) < 2 ) {
        return new WP_REST_Response( [ 'success' => true, 'collections' => [] ], 200 );
    }

    $first = max( 1, min( 12, absint( $request->get_param( 'first' ) ?: 4 ) ) );

    $cache_key = 'mf_sc_' . md5( $q . '_' . $first );
    $cached = get_transient( $cache_key );
    if ( $cached !== false ) {
        return new WP_REST_Response( $cached, 200 );
    }

    global $wpdb;

    $like = '%' . $wpdb->esc_like( $q ) . '%';

    $sql = $wpdb->prepare(
        "SELECT t.name, t.slug, tt.count
         FROM {$wpdb->terms} t
         INNER JOIN {$wpdb->term_taxonomy} tt ON t.term_id = tt.term_id
         WHERE tt.taxonomy = 'collection'
           AND t.name LIKE %s
           AND tt.count > 0
         ORDER BY tt.count DESC
         LIMIT %d",
        $like,
        $first * 3
    );

    $rows = $wpdb->get_results( $sql );

    $collections = [];
    foreach ( $rows as $row ) {
        if ( count( $collections ) >= $first ) break;
        if ( ! preg_match( '/\s/', $row->name ) && strpos( $row->name, '-' ) !== false ) continue;
        $collections[] = [
            'name'  => $row->name,
            'slug'  => $row->slug,
            'count' => (int) $row->count,
        ];
    }

    $result = [ 'success' => true, 'collections' => $collections ];
    set_transient( $cache_key, $result, 300 );
    return new WP_REST_Response( $result, 200 );
}
