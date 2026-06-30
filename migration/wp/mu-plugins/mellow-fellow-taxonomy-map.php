<?php
/**
 * Plugin Name: Mellow Fellow - Taxonomy Map REST Endpoint
 * Description: Lightweight REST endpoint that returns a product→taxonomy index
 *              for client-side filtering. Single SQL query, O(P+T) complexity.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', function() {
    register_rest_route( 'mf/v1', '/taxonomy-map', [
        'methods'             => 'GET',
        'callback'            => 'mf_get_taxonomy_map',
        'permission_callback' => '__return_true',
    ] );
} );

function mf_get_taxonomy_map() {
    // Check transient cache (2 minutes)
    $cached = get_transient( 'mf_taxonomy_map' );
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

    // Single query: get all term↔product relationships for published products
    // across all 8 taxonomies. O(rows) where rows ≈ P×avg_terms_per_product.
    $sql = $wpdb->prepare(
        "SELECT p.ID as product_id, t.name as term_name, t.slug as term_slug, tt.taxonomy
         FROM {$wpdb->posts} p
         INNER JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
         INNER JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
         INNER JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
         WHERE p.post_type = 'product'
           AND p.post_status = 'publish'
           AND tt.taxonomy IN ($placeholders)
         ORDER BY tt.taxonomy, t.name",
        ...$tax_slugs
    );

    $rows = $wpdb->get_results( $sql );

    // Build the index
    $terms = [];         // { filterKey: [{ name, slug, count, productIds }] }
    $product_index = []; // { productId: { filterKey: [slugs] } }
    $term_map = [];      // temp: { taxonomy-slug: { name, slug, productIds[] } }

    foreach ( $rows as $row ) {
        $filter_key = $taxonomies[ $row->taxonomy ] ?? null;
        if ( ! $filter_key ) continue;

        $pid = (int) $row->product_id;
        $tslug = $row->term_slug;

        // Build term map
        if ( ! isset( $term_map[ $filter_key ][ $tslug ] ) ) {
            $term_map[ $filter_key ][ $tslug ] = [
                'name'       => $row->term_name,
                'slug'       => $tslug,
                'count'      => 0,
                'productIds' => [],
            ];
        }
        $term_map[ $filter_key ][ $tslug ]['count']++;
        $term_map[ $filter_key ][ $tslug ]['productIds'][] = $pid;

        // Build product index
        if ( ! isset( $product_index[ $pid ] ) ) {
            $product_index[ $pid ] = [];
        }
        if ( ! isset( $product_index[ $pid ][ $filter_key ] ) ) {
            $product_index[ $pid ][ $filter_key ] = [];
        }
        if ( ! in_array( $tslug, $product_index[ $pid ][ $filter_key ], true ) ) {
            $product_index[ $pid ][ $filter_key ][] = $tslug;
        }
    }

    // Flatten term_map into terms array
    foreach ( $term_map as $filter_key => $slugs ) {
        $terms[ $filter_key ] = array_values( $slugs );
    }

    $result = [
        'success'      => true,
        'terms'        => $terms,
        'productIndex' => (object) $product_index, // Force JSON object
    ];

    set_transient( 'mf_taxonomy_map', $result, 120 );

    return new WP_REST_Response( $result, 200 );
}
