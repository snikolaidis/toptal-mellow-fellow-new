<?php
/**
 * REST endpoint: GET /mf/v1/recs-products
 *
 * Fetches products for the recommendations system using direct SQL.
 * Replaces the GraphQL queries in the recommendations API route.
 *
 * Params:
 *   types    — comma-separated mf_product_type (product-type taxonomy) slugs
 *   slugs    — comma-separated product slugs (for specific products like terp-pens)
 *   exclude  — comma-separated product IDs to exclude
 *   limit    — max products to return (default 8, max 20)
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', function () {
    register_rest_route( 'mf/v1', '/recs-products', [
        'methods'             => 'GET',
        'callback'            => 'mf_recs_products_handler',
        'permission_callback' => '__return_true',
    ] );
} );

function mf_recs_products_handler( WP_REST_Request $request ) {
    $types_raw   = $request->get_param( 'types' );
    $slugs_raw   = $request->get_param( 'slugs' );
    $exclude_raw = $request->get_param( 'exclude' );
    $limit       = max( 1, min( 20, absint( $request->get_param( 'limit' ) ?: 8 ) ) );

    $type_slugs   = ! empty( $types_raw )   ? array_filter( array_map( 'sanitize_title', explode( ',', $types_raw ) ) )   : [];
    $product_slugs = ! empty( $slugs_raw )   ? array_filter( array_map( 'sanitize_title', explode( ',', $slugs_raw ) ) )   : [];
    $exclude_ids  = ! empty( $exclude_raw ) ? array_filter( array_map( 'absint', explode( ',', $exclude_raw ) ) )       : [];

    if ( empty( $type_slugs ) && empty( $product_slugs ) ) {
        return new WP_REST_Response( [ 'success' => true, 'products' => [] ], 200 );
    }

    $cache_key = 'mf_rp_' . md5( implode( '|', $type_slugs ) . '_' . implode( '|', $product_slugs ) . '_' . implode( '|', $exclude_ids ) . '_' . $limit );
    $cached = get_transient( $cache_key );
    if ( $cached !== false ) {
        return new WP_REST_Response( $cached, 200 );
    }

    global $wpdb;

    // -----------------------------------------------------------------------
    // 1. Build product ID query
    // -----------------------------------------------------------------------
    $product_ids = [];

    // Fetch by product slugs (for specific products like terp-pens)
    // Uses prefix matching so import-appended SKU suffixes don't break lookups
    // (e.g. "terp-pens" matches "terp-pens-ab00000015")
    if ( ! empty( $product_slugs ) ) {
        $like_clauses = [];
        $like_args    = [];
        foreach ( $product_slugs as $s ) {
            $like_clauses[] = 'post_name LIKE %s';
            $like_args[]    = $wpdb->esc_like( $s ) . '%';
        }
        $slug_sql = $wpdb->prepare(
            "SELECT ID FROM {$wpdb->posts}
             WHERE (" . implode( ' OR ', $like_clauses ) . ")
               AND post_type = 'product'
               AND post_status = 'publish'",
            ...$like_args
        );
        $slug_ids = array_map( 'intval', $wpdb->get_col( $slug_sql ) );
        $product_ids = array_merge( $product_ids, $slug_ids );
    }

    // Fetch by product-type taxonomy (only in-stock products)
    if ( ! empty( $type_slugs ) ) {
        $type_placeholders = implode( ',', array_fill( 0, count( $type_slugs ), '%s' ) );

        $exclude_clause = '';
        $prepare_args = $type_slugs;
        if ( ! empty( $exclude_ids ) || ! empty( $product_ids ) ) {
            $all_exclude = array_unique( array_merge( $exclude_ids, $product_ids ) );
            $excl_placeholders = implode( ',', array_fill( 0, count( $all_exclude ), '%d' ) );
            $exclude_clause = "AND p.ID NOT IN ({$excl_placeholders})";
            $prepare_args = array_merge( $prepare_args, $all_exclude );
        }

        $prepare_args[] = $limit;

        $type_sql = $wpdb->prepare(
            "SELECT DISTINCT p.ID
             FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
             INNER JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
             INNER JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
             INNER JOIN {$wpdb->postmeta} stock ON p.ID = stock.post_id AND stock.meta_key = '_stock_status'
             WHERE p.post_type = 'product'
               AND p.post_status = 'publish'
               AND tt.taxonomy = 'product-type'
               AND t.slug IN ({$type_placeholders})
               AND stock.meta_value != 'outofstock'
               {$exclude_clause}
             ORDER BY p.post_date DESC
             LIMIT %d",
            ...$prepare_args
        );
        $type_ids = array_map( 'intval', $wpdb->get_col( $type_sql ) );
        $product_ids = array_merge( $product_ids, $type_ids );
    }

    // Remove excluded and deduplicate
    $product_ids = array_values( array_unique( array_diff( $product_ids, $exclude_ids ) ) );

    if ( empty( $product_ids ) ) {
        $result = [ 'success' => true, 'products' => [] ];
        set_transient( $cache_key, $result, 300 );
        return new WP_REST_Response( $result, 200 );
    }

    $id_placeholders = implode( ',', array_fill( 0, count( $product_ids ), '%d' ) );

    // -----------------------------------------------------------------------
    // 2. Batch-fetch post data
    // -----------------------------------------------------------------------
    $posts_sql = $wpdb->prepare(
        "SELECT ID, post_title, post_name FROM {$wpdb->posts} WHERE ID IN ({$id_placeholders})",
        ...$product_ids
    );
    $post_rows = $wpdb->get_results( $posts_sql );
    $post_map = [];
    foreach ( $post_rows as $pr ) {
        $post_map[ (int) $pr->ID ] = $pr;
    }

    // -----------------------------------------------------------------------
    // 3. Batch-fetch metadata
    // -----------------------------------------------------------------------
    $meta_keys = [ '_price', '_regular_price', '_sale_price', '_stock_status' ];
    $meta_key_placeholders = implode( ',', array_fill( 0, count( $meta_keys ), '%s' ) );

    $meta_sql = $wpdb->prepare(
        "SELECT post_id, meta_key, meta_value
         FROM {$wpdb->postmeta}
         WHERE post_id IN ({$id_placeholders})
           AND meta_key IN ({$meta_key_placeholders})",
        ...array_merge( $product_ids, $meta_keys )
    );
    $meta_rows = $wpdb->get_results( $meta_sql );

    $meta_map = [];
    foreach ( $meta_rows as $mr ) {
        $meta_map[ (int) $mr->post_id ][ $mr->meta_key ] = $mr->meta_value;
    }

    // -----------------------------------------------------------------------
    // 4. Batch-fetch taxonomy terms
    // -----------------------------------------------------------------------
    $tax_list = [ 'product-type', 'product-line', 'cannabinoid' ];
    $tax_placeholders = implode( ',', array_fill( 0, count( $tax_list ), '%s' ) );

    $tax_sql = $wpdb->prepare(
        "SELECT tr.object_id AS product_id, t.name AS term_name, t.slug AS term_slug, tt.taxonomy
         FROM {$wpdb->term_relationships} tr
         INNER JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
         INNER JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
         WHERE tr.object_id IN ({$id_placeholders})
           AND tt.taxonomy IN ({$tax_placeholders})",
        ...array_merge( $product_ids, $tax_list )
    );
    $tax_rows = $wpdb->get_results( $tax_sql );

    $tax_map = [];
    foreach ( $tax_rows as $tr ) {
        $pid = (int) $tr->product_id;
        $tax_map[ $pid ][ $tr->taxonomy ][] = [
            'name' => $tr->term_name,
            'slug' => $tr->term_slug,
        ];
    }

    // -----------------------------------------------------------------------
    // 5. Batch-fetch featured images
    // -----------------------------------------------------------------------
    $upload_dir = wp_upload_dir();
    $upload_base = $upload_dir['baseurl'];

    $img_sql = $wpdb->prepare(
        "SELECT pm.post_id AS product_id,
                CONCAT(%s, '/', ameta.meta_value) AS source_url,
                COALESCE(altmeta.meta_value, '') AS alt_text
         FROM {$wpdb->postmeta} pm
         INNER JOIN {$wpdb->postmeta} ameta
             ON pm.meta_value = ameta.post_id AND ameta.meta_key = '_wp_attached_file'
         LEFT JOIN {$wpdb->postmeta} altmeta
             ON pm.meta_value = altmeta.post_id AND altmeta.meta_key = '_wp_attachment_image_alt'
         WHERE pm.post_id IN ({$id_placeholders})
           AND pm.meta_key = '_thumbnail_id'",
        $upload_base,
        ...$product_ids
    );
    $img_rows = $wpdb->get_results( $img_sql );

    $img_map = [];
    foreach ( $img_rows as $ir ) {
        $img_map[ (int) $ir->product_id ] = [
            'sourceUrl' => $ir->source_url,
            'altText'   => $ir->alt_text,
        ];
    }

    // -----------------------------------------------------------------------
    // 6. Build response
    // -----------------------------------------------------------------------
    $products = [];
    foreach ( $product_ids as $pid ) {
        if ( ! isset( $post_map[ $pid ] ) ) continue;
        $post = $post_map[ $pid ];
        $m    = $meta_map[ $pid ] ?? [];
        $t    = $tax_map[ $pid ] ?? [];

        $stock_raw = $m['_stock_status'] ?? 'instock';
        if ( $stock_raw === 'outofstock' ) continue;

        $stock_map = [ 'instock' => 'IN_STOCK', 'outofstock' => 'OUT_OF_STOCK', 'onbackorder' => 'ON_BACKORDER' ];
        $stock_status = $stock_map[ $stock_raw ] ?? 'IN_STOCK';

        $price         = isset( $m['_price'] )         ? '$' . number_format( (float) $m['_price'], 2 )         : null;
        $regular_price = isset( $m['_regular_price'] ) ? '$' . number_format( (float) $m['_regular_price'], 2 ) : null;
        $sale_price    = isset( $m['_sale_price'] ) && $m['_sale_price'] !== ''
                         ? '$' . number_format( (float) $m['_sale_price'], 2 )
                         : null;

        $type_terms   = $t['product-type'] ?? [];
        $line_terms   = $t['product-line'] ?? [];
        $cannab_terms = $t['cannabinoid'] ?? [];

        $type_label = ! empty( $type_terms ) ? $type_terms[0]['name'] : '';
        $subtitle   = ! empty( $line_terms )
                      ? $line_terms[0]['name']
                      : implode( ' + ', array_map( function ( $c ) { return $c['name']; }, $cannab_terms ) );

        $products[] = [
            'id'            => base64_encode( 'product:' . $pid ),
            'databaseId'    => $pid,
            'name'          => $post->post_title,
            'slug'          => $post->post_name,
            'price'         => $price,
            'regularPrice'  => $regular_price,
            'salePrice'     => $sale_price,
            'stockStatus'   => $stock_status,
            'image'         => $img_map[ $pid ] ?? null,
            'typeLabel'     => $type_label,
            'subtitle'      => $subtitle,
            'mfproductTypes' => [ 'nodes' => $type_terms ],
        ];
    }

    $result = [ 'success' => true, 'products' => $products ];
    set_transient( $cache_key, $result, 300 );
    return new WP_REST_Response( $result, 200 );
}
