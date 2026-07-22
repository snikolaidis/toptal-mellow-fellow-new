<?php
/**
 * Plugin Name: Mellow Fellow - Collection Products REST Endpoint
 * Description: Returns paginated, filtered, sorted products for a collection
 *              using direct SQL. Replaces the slow WPGraphQL products query.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', function () {
    register_rest_route( 'mf/v1', '/collection-products', [
        'methods'             => 'GET',
        'callback'            => 'mf_get_collection_products',
        'permission_callback' => '__return_true',
        'args'                => [
            'slug'     => [ 'required' => true,  'type' => 'string',  'sanitize_callback' => 'sanitize_title' ],
            'page'     => [ 'required' => false, 'type' => 'integer', 'default' => 1,  'sanitize_callback' => 'absint' ],
            'per_page' => [ 'required' => false, 'type' => 'integer', 'default' => 24, 'sanitize_callback' => 'absint' ],
            'sort'     => [ 'required' => false, 'type' => 'string',  'default' => 'default', 'sanitize_callback' => 'sanitize_text_field' ],
        ],
    ] );
} );

function mf_get_collection_products( WP_REST_Request $request ) {
    $slug     = $request->get_param( 'slug' );
    $page     = max( 1, (int) $request->get_param( 'page' ) );
    $per_page = max( 1, min( 100, (int) $request->get_param( 'per_page' ) ) );
    $sort     = $request->get_param( 'sort' );
    $offset   = ( $page - 1 ) * $per_page;

    // Parse taxonomy filter params (same keys the frontend sends)
    $filter_map = [
        'productType'       => 'product-type',
        'strainType'        => 'strain-type',
        'blendType'         => 'blend-types',
        'cannabinoid'       => 'cannabinoid',
        'singleCannabinoid' => 'single-cannabinoid',
        'size'              => 'size',
        'mg'                => 'mg',
        'pieces'            => 'pieces',
    ];

    $active_filters = [];
    foreach ( $filter_map as $param_key => $taxonomy ) {
        $raw = $request->get_param( $param_key );
        if ( ! empty( $raw ) && is_string( $raw ) ) {
            $slugs = array_filter( array_map( 'sanitize_title', explode( ',', $raw ) ) );
            if ( ! empty( $slugs ) ) {
                $active_filters[ $taxonomy ] = $slugs;
            }
        }
    }

    // Build cache key from all parameters
    $cache_parts = [ 'mf_cp', $slug, $page, $per_page, $sort ];
    ksort( $active_filters );
    foreach ( $active_filters as $tax => $slugs ) {
        sort( $slugs );
        $cache_parts[] = $tax . ':' . implode( '|', $slugs );
    }
    $cache_key = substr( md5( implode( '_', $cache_parts ) ), 0, 32 );
    $transient_key = 'mf_cp_' . $cache_key;

    $cached = get_transient( $transient_key );
    if ( $cached !== false ) {
        return new WP_REST_Response( $cached, 200 );
    }

    global $wpdb;

    // -----------------------------------------------------------------------
    // 1. Build the product ID query
    // -----------------------------------------------------------------------
    $where_clauses = [
        "p.post_type = 'product'",
        "p.post_status = 'publish'",
        "tt_coll.taxonomy = 'collection'",
    ];
    $prepare_args = [ $slug ];

    // Collection slug
    $where_clauses[] = 't_coll.slug = %s';

    // Taxonomy filter EXISTS subqueries
    $filter_idx = 0;
    foreach ( $active_filters as $taxonomy => $slugs ) {
        $filter_idx++;
        $slug_placeholders = implode( ',', array_fill( 0, count( $slugs ), '%s' ) );
        $where_clauses[] = "EXISTS (
            SELECT 1 FROM {$wpdb->term_relationships} tr_f{$filter_idx}
            INNER JOIN {$wpdb->term_taxonomy} tt_f{$filter_idx}
                ON tr_f{$filter_idx}.term_taxonomy_id = tt_f{$filter_idx}.term_taxonomy_id
            INNER JOIN {$wpdb->terms} t_f{$filter_idx}
                ON tt_f{$filter_idx}.term_id = t_f{$filter_idx}.term_id
            WHERE tr_f{$filter_idx}.object_id = p.ID
              AND tt_f{$filter_idx}.taxonomy = %s
              AND t_f{$filter_idx}.slug IN ({$slug_placeholders})
        )";
        $prepare_args[] = $taxonomy;
        foreach ( $slugs as $s ) {
            $prepare_args[] = $s;
        }
    }

    $where_sql = implode( "\n  AND ", $where_clauses );

    // Sorting
    $sort_join = '';
    switch ( $sort ) {
        case 'price-low':
            $sort_join  = "LEFT JOIN {$wpdb->postmeta} pm_sort ON p.ID = pm_sort.post_id AND pm_sort.meta_key = '_price'";
            $order_sql  = 'CAST(pm_sort.meta_value AS DECIMAL(10,2)) ASC, p.post_title ASC';
            break;
        case 'price-high':
            $sort_join  = "LEFT JOIN {$wpdb->postmeta} pm_sort ON p.ID = pm_sort.post_id AND pm_sort.meta_key = '_price'";
            $order_sql  = 'CAST(pm_sort.meta_value AS DECIMAL(10,2)) DESC, p.post_title ASC';
            break;
        case 'newest':
            $order_sql = 'p.post_date DESC';
            break;
        case 'name-asc':
            $order_sql = 'p.post_title ASC';
            break;
        case 'name-desc':
            $order_sql = 'p.post_title DESC';
            break;
        default:
            $order_sql = 'p.menu_order ASC, p.post_title ASC';
            break;
    }

    // Count query (same filters, no pagination)
    $count_sql = $wpdb->prepare(
        "SELECT COUNT(DISTINCT p.ID)
         FROM {$wpdb->posts} p
         INNER JOIN {$wpdb->term_relationships} tr_coll ON p.ID = tr_coll.object_id
         INNER JOIN {$wpdb->term_taxonomy} tt_coll ON tr_coll.term_taxonomy_id = tt_coll.term_taxonomy_id
         INNER JOIN {$wpdb->terms} t_coll ON tt_coll.term_id = t_coll.term_id
         WHERE {$where_sql}",
        ...$prepare_args
    );
    $total = (int) $wpdb->get_var( $count_sql );

    if ( $total === 0 ) {
        $result = [
            'success'     => true,
            'products'    => [],
            'total'       => 0,
            'page'        => $page,
            'perPage'     => $per_page,
            'totalPages'  => 0,
            'hasNextPage' => false,
        ];
        set_transient( $transient_key, $result, 300 );
        return new WP_REST_Response( $result, 200 );
    }

    // Main query — get product IDs with pagination
    $main_prepare_args = array_merge( $prepare_args, [ $per_page, $offset ] );
    $main_sql = $wpdb->prepare(
        "SELECT DISTINCT p.ID, p.post_title, p.post_name, p.post_date, p.menu_order
         FROM {$wpdb->posts} p
         INNER JOIN {$wpdb->term_relationships} tr_coll ON p.ID = tr_coll.object_id
         INNER JOIN {$wpdb->term_taxonomy} tt_coll ON tr_coll.term_taxonomy_id = tt_coll.term_taxonomy_id
         INNER JOIN {$wpdb->terms} t_coll ON tt_coll.term_id = t_coll.term_id
         {$sort_join}
         WHERE {$where_sql}
         ORDER BY {$order_sql}
         LIMIT %d OFFSET %d",
        ...$main_prepare_args
    );
    $rows = $wpdb->get_results( $main_sql );

    if ( empty( $rows ) ) {
        $result = [
            'success'     => true,
            'products'    => [],
            'total'       => $total,
            'page'        => $page,
            'perPage'     => $per_page,
            'totalPages'  => (int) ceil( $total / $per_page ),
            'hasNextPage' => false,
        ];
        set_transient( $transient_key, $result, 300 );
        return new WP_REST_Response( $result, 200 );
    }

    $product_ids = array_map( function ( $r ) { return (int) $r->ID; }, $rows );
    $id_placeholders = implode( ',', array_fill( 0, count( $product_ids ), '%d' ) );

    // -----------------------------------------------------------------------
    // 2. Batch-fetch metadata
    // -----------------------------------------------------------------------
    $meta_keys = [
        '_price', '_regular_price', '_sale_price', '_stock_status',
        '_thumbnail_id', 'bb_linked_bundle_id', 'bb_from_price',
    ];
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
    // 3. Batch-fetch taxonomy terms (custom taxonomies + product_type)
    // -----------------------------------------------------------------------
    $tax_list = [
        'product_type',
        'product-type', 'strain-type', 'strain-name', 'blend-types',
        'product-line', 'size', 'cannabinoid', 'single-cannabinoid', 'mg', 'pieces',
    ];
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
    // 4. Batch-fetch featured images
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
    // 5. Assemble response in the shape the frontend expects
    // -----------------------------------------------------------------------
    $type_map = [
        'simple'   => [ 'SimpleProduct',   'SIMPLE' ],
        'variable' => [ 'VariableProduct',  'VARIABLE' ],
        'external' => [ 'ExternalProduct',  'EXTERNAL' ],
        'grouped'  => [ 'GroupProduct',     'GROUPED' ],
    ];

    $stock_status_map = [
        'instock'     => 'IN_STOCK',
        'outofstock'  => 'OUT_OF_STOCK',
        'onbackorder' => 'ON_BACKORDER',
    ];

    $tax_field_map = [
        'product-type'       => 'mfproductTypes',
        'strain-type'        => 'strainTypes',
        'strain-name'        => 'strainNames',
        'blend-types'        => 'blendTypes',
        'product-line'       => 'productLines',
        'size'               => 'size',
        'cannabinoid'        => 'cannabinoids',
        'single-cannabinoid' => 'singleCannabinoid',
        'mg'                 => 'mG',
        'pieces'             => 'pieces',
    ];

    $products = [];
    foreach ( $rows as $row ) {
        $pid = (int) $row->ID;
        $meta = $meta_map[ $pid ] ?? [];
        $taxes = $tax_map[ $pid ] ?? [];
        $image = $img_map[ $pid ] ?? null;

        // Product type
        $wc_type = $taxes['product_type'][0]['slug'] ?? 'simple';
        $type_info = $type_map[ $wc_type ] ?? $type_map['simple'];

        // Plain formatted prices (no HTML) — ProductCard renders as text content
        $price        = isset( $meta['_price'] )         ? '$' . number_format( (float) $meta['_price'], 2 )         : null;
        $regularPrice = isset( $meta['_regular_price'] ) ? '$' . number_format( (float) $meta['_regular_price'], 2 ) : null;
        $salePrice    = ! empty( $meta['_sale_price'] )  ? '$' . number_format( (float) $meta['_sale_price'], 2 )    : null;

        // Build taxonomy node arrays
        $tax_fields = [];
        foreach ( $tax_field_map as $taxonomy => $field_name ) {
            $terms = $taxes[ $taxonomy ] ?? [];
            $tax_fields[ $field_name ] = [ 'nodes' => $terms ];
        }

        $product = [
            '__typename'        => $type_info[0],
            'id'                => base64_encode( "product:{$pid}" ),
            'databaseId'        => $pid,
            'name'              => $row->post_title,
            'slug'              => $row->post_name,
            'type'              => $type_info[1],
            'price'             => $price,
            'regularPrice'      => $regularPrice,
            'salePrice'         => $salePrice,
            'stockStatus'       => $stock_status_map[ $meta['_stock_status'] ?? 'instock' ] ?? 'IN_STOCK',
            'image'             => $image ? [
                'id'        => $meta['_thumbnail_id'] ?? '',
                'sourceUrl' => $image['sourceUrl'],
                'altText'   => $image['altText'],
            ] : null,
            'bbLinkedBundleId'  => ! empty( $meta['bb_linked_bundle_id'] ) ? (int) $meta['bb_linked_bundle_id'] : null,
            'bbFromPrice'       => ! empty( $meta['bb_from_price'] ) ? (float) $meta['bb_from_price'] : null,
        ];

        $products[] = array_merge( $product, $tax_fields );
    }

    $total_pages = (int) ceil( $total / $per_page );
    $result = [
        'success'     => true,
        'products'    => $products,
        'total'       => $total,
        'page'        => $page,
        'perPage'     => $per_page,
        'totalPages'  => $total_pages,
        'hasNextPage' => $page < $total_pages,
    ];

    set_transient( $transient_key, $result, 300 );

    return new WP_REST_Response( $result, 200 );
}
