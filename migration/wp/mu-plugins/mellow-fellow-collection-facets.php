<?php
/**
 * Plugin Name: Mellow Fellow - Collection Facets REST Endpoint
 * Description: Returns filter facet terms for a specific collection via a single
 *              SQL query. Used by the headless frontend to populate sidebar filters
 *              without the overhead of WPGraphQL product resolution.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', function() {
    register_rest_route( 'mf/v1', '/collection-facets', [
        'methods'             => 'GET',
        'callback'            => 'mf_get_collection_facets',
        'permission_callback' => '__return_true',
        'args'                => [
            'slug' => [
                'required'          => true,
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_title',
            ],
            // Deliberately no sanitize_callback. WP applies it to the raw value during
            // dispatch, so taxonomy[]=x hands an array to sanitize_title() and fatals
            // before mf_resolve_taxonomy_param() runs. No 'type' either: it would make
            // WP reject an array with a 400 rather than falling back, and falling back
            // is the contract. The allowlist is the control.
            'taxonomy' => [
                'required' => false,
                'default'  => 'collection',
            ],
        ],
    ] );
} );

function mf_get_collection_facets( WP_REST_Request $request ) {
    $slug = $request->get_param( 'slug' );
    $term_tax = function_exists( 'mf_resolve_taxonomy_param' ) ? mf_resolve_taxonomy_param( $request ) : 'collection';

    $cache_key = 'mf_coll_facets_' . $term_tax . '_' . $slug;
    $cached = get_transient( $cache_key );
    if ( $cached !== false ) {
        return new WP_REST_Response( $cached, 200 );
    }

    global $wpdb;

    $taxonomies = [
        'product-type'       => 'productType',
        'size'               => 'size',
        'strain-type'        => 'strainType',
        'blend-types'        => 'blendType',
        'cannabinoid'        => 'cannabinoid',
        'single-cannabinoid' => 'singleCannabinoid',
        'mg'                 => 'mg',
        'pieces'             => 'pieces',
    ];

    $tax_slugs = array_keys( $taxonomies );
    $placeholders = implode( ',', array_fill( 0, count( $tax_slugs ), '%s' ) );

    $sql = $wpdb->prepare(
        "SELECT t.name AS term_name, t.slug AS term_slug, tt.taxonomy, COUNT(DISTINCT p.ID) AS product_count
         FROM {$wpdb->posts} p
         INNER JOIN {$wpdb->term_relationships} tr_coll
             ON p.ID = tr_coll.object_id
         INNER JOIN {$wpdb->term_taxonomy} tt_coll
             ON tr_coll.term_taxonomy_id = tt_coll.term_taxonomy_id
         INNER JOIN {$wpdb->terms} t_coll
             ON tt_coll.term_id = t_coll.term_id
         INNER JOIN {$wpdb->term_relationships} tr
             ON p.ID = tr.object_id
         INNER JOIN {$wpdb->term_taxonomy} tt
             ON tr.term_taxonomy_id = tt.term_taxonomy_id
         INNER JOIN {$wpdb->terms} t
             ON tt.term_id = t.term_id
         WHERE p.post_type = 'product'
           AND p.post_status = 'publish'
           AND tt_coll.taxonomy = %s
           AND t_coll.slug = %s
           AND tt.taxonomy IN ($placeholders)
         GROUP BY t.slug, t.name, tt.taxonomy
         ORDER BY tt.taxonomy, product_count DESC, t.name",
        $term_tax,
        $slug,
        ...$tax_slugs
    );

    $rows = $wpdb->get_results( $sql );

    $terms = [];
    $total_products = 0;

    foreach ( $rows as $row ) {
        $filter_key = $taxonomies[ $row->taxonomy ] ?? null;
        if ( ! $filter_key ) continue;

        if ( ! isset( $terms[ $filter_key ] ) ) {
            $terms[ $filter_key ] = [];
        }

        $terms[ $filter_key ][] = [
            'name'  => $row->term_name,
            'slug'  => $row->term_slug,
            'count' => (int) $row->product_count,
        ];
    }

    // Count distinct products in this collection.
    // This query needs its own taxonomy condition. It is a separate statement from
    // the facet query above and uses the alias tt rather than tt_coll, so removing
    // it as a duplicate silently returns totalProducts = 0 for any non-collection.
    $count_sql = $wpdb->prepare(
        "SELECT COUNT(DISTINCT p.ID)
         FROM {$wpdb->posts} p
         INNER JOIN {$wpdb->term_relationships} tr
             ON p.ID = tr.object_id
         INNER JOIN {$wpdb->term_taxonomy} tt
             ON tr.term_taxonomy_id = tt.term_taxonomy_id
         INNER JOIN {$wpdb->terms} t
             ON tt.term_id = t.term_id
         WHERE p.post_type = 'product'
           AND p.post_status = 'publish'
           AND tt.taxonomy = %s
           AND t.slug = %s",
        $term_tax,
        $slug
    );

    $total_products = (int) $wpdb->get_var( $count_sql );

    $result = [
        'success'       => true,
        'terms'         => $terms,
        'totalProducts' => $total_products,
    ];

    set_transient( $cache_key, $result, 300 );

    return new WP_REST_Response( $result, 200 );
}
