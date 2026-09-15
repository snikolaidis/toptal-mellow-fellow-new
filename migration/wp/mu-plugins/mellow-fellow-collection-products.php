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
            'slug'     => [ 'required' => true,  'type' => 'string',  'validate_callback' => 'rest_validate_request_arg', 'sanitize_callback' => 'sanitize_title' ],
            // No sanitize_callback or validate_callback on purpose: an unrecognised
            // taxonomy must fall back to `collection`, per mf_resolve_taxonomy_param().
            'taxonomy' => [ 'required' => false, 'default' => 'collection' ],
            'page'     => [ 'required' => false, 'type' => 'integer', 'default' => 1,  'sanitize_callback' => 'absint' ],
            'per_page' => [ 'required' => false, 'type' => 'integer', 'default' => 24, 'sanitize_callback' => 'absint' ],
            'sort'     => [ 'required' => false, 'type' => 'string',  'default' => 'default', 'sanitize_callback' => 'sanitize_text_field' ],
            // Price range (BugHerd #433). Cast and validated in the handler
            // (strictly positive), so no sanitize_callback here.
            'min_price' => [ 'required' => false ],
            'max_price' => [ 'required' => false ],
        ],
    ] );
} );

function mf_get_collection_products( WP_REST_Request $request ) {
    $slug     = $request->get_param( 'slug' );
    $term_tax = function_exists( 'mf_resolve_taxonomy_param' ) ? mf_resolve_taxonomy_param( $request ) : 'collection';
    $page     = max( 1, (int) $request->get_param( 'page' ) );
    $per_page = max( 1, min( 100, (int) $request->get_param( 'per_page' ) ) );
    $sort     = $request->get_param( 'sort' );
    $offset   = ( $page - 1 ) * $per_page;

    // Price range (BugHerd #433). Strictly positive; a 0 or non-numeric bound is
    // treated as "no bound" so it never narrows or breaks the query.
    $min_price_raw = $request->get_param( 'min_price' );
    $max_price_raw = $request->get_param( 'max_price' );
    $min_price = is_numeric( $min_price_raw ) && (float) $min_price_raw > 0 ? (float) $min_price_raw : null;
    $max_price = is_numeric( $max_price_raw ) && (float) $max_price_raw > 0 ? (float) $max_price_raw : null;
    // A backwards range would return nothing; treat the bounds either way round.
    if ( $min_price !== null && $max_price !== null && $min_price > $max_price ) {
        [ $min_price, $max_price ] = [ $max_price, $min_price ];
    }

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

    // Build cache key from all parameters. Price bounds MUST be included or a
    // filtered response could be served for a different range (or the unfiltered
    // list served for a filtered request).
    $cache_parts = [ 'mf_cp', $term_tax, $slug, $page, $per_page, $sort, 'min:' . ( $min_price ?? '' ), 'max:' . ( $max_price ?? '' ) ];
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
        'tt_coll.taxonomy = %s',
    ];
    // $prepare_args must stay in the same order as the placeholders appear in
    // $where_clauses, which is imploded far below and passed to prepare() positionally.
    // Reordering or dropping an entry here binds slug to taxonomy and vice versa,
    // which returns zero rows as a successful empty result rather than an error.
    // $term_tax is deliberately not named $tax: the cache loop above reuses $tax as
    // its foreach key, so a variable named $tax here would be overwritten by the last
    // active filter before this line runs.
    $prepare_args = [ $term_tax, $slug ];

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

    // Price range (BugHerd #433). EXISTS against the indexed wc_product_meta_lookup
    // table (product_id is its primary key; min_price/max_price are indexed), so
    // this is the same fast path WooCommerce's own price filter uses and handles
    // variable products via their aggregated min/max. Kept as a correlated EXISTS
    // so it needs no extra FROM join in either the count or the main query.
    // Appended AFTER the taxonomy filters so its placeholders stay in step with
    // $prepare_args (positional).
    if ( $min_price !== null || $max_price !== null ) {
        $price_conds = [];
        if ( $min_price !== null ) { $price_conds[] = 'mf_pl.max_price >= %f'; }
        if ( $max_price !== null ) { $price_conds[] = 'mf_pl.min_price <= %f'; }
        $where_clauses[] = "EXISTS (
            SELECT 1 FROM {$wpdb->prefix}wc_product_meta_lookup mf_pl
            WHERE mf_pl.product_id = p.ID
              AND " . implode( "\n              AND ", $price_conds ) . "
        )";
        if ( $min_price !== null ) { $prepare_args[] = $min_price; }
        if ( $max_price !== null ) { $prepare_args[] = $max_price; }
    }

    $where_sql = implode( "\n  AND ", $where_clauses );

    // Sorting
    $sort_join = '';
    switch ( $sort ) {
        case 'best-sellers':
            $sort_join  = "LEFT JOIN {$wpdb->postmeta} pm_sort ON p.ID = pm_sort.post_id AND pm_sort.meta_key = 'total_sales'";
            $order_sql  = 'CAST(COALESCE(pm_sort.meta_value, 0) AS UNSIGNED) DESC, p.post_title ASC';
            break;
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
        '_stock', '_manage_stock',
        '_thumbnail_id',
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
        'product-lines', 'size', 'cannabinoid', 'single-cannabinoid', 'mg', 'pieces',
        'unique-selling-props',
    ];
    $tax_placeholders = implode( ',', array_fill( 0, count( $tax_list ), '%s' ) );

    $tax_sql = $wpdb->prepare(
        "SELECT tr.object_id AS product_id, t.term_id AS term_id, t.name AS term_name, t.slug AS term_slug, tt.taxonomy
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
            'term_id' => (int) $tr->term_id,
            'name'    => $tr->term_name,
            'slug'    => $tr->term_slug,
        ];
    }

    // Unique selling props carry an ACF icon per *term*, not per product, so
    // resolve it once per distinct term (usually a handful) rather than once
    // per product — same approach as mf_get_product()'s USP block.
    $usp_icon_map = [];
    if ( function_exists( 'get_fields' ) ) {
        $usp_term_ids = [];
        foreach ( $tax_map as $pid_taxes ) {
            foreach ( $pid_taxes['unique-selling-props'] ?? [] as $term ) {
                $usp_term_ids[ $term['term_id'] ] = true;
            }
        }
        foreach ( array_keys( $usp_term_ids ) as $term_id ) {
            $usp_acf  = get_fields( 'unique-selling-props_' . $term_id ) ?: [];
            $icon_val = $usp_acf['prop_icon'] ?? $usp_acf['propIcon'] ?? null;
            if ( ! $icon_val ) continue;
            if ( is_array( $icon_val ) && ! empty( $icon_val['url'] ) ) {
                $usp_icon_map[ $term_id ] = [ 'sourceUrl' => $icon_val['url'], 'altText' => $icon_val['alt'] ?? '' ];
            } elseif ( is_numeric( $icon_val ) ) {
                $iu = wp_get_attachment_url( (int) $icon_val );
                if ( $iu ) {
                    $usp_icon_map[ $term_id ] = [
                        'sourceUrl' => $iu,
                        'altText'   => get_post_meta( (int) $icon_val, '_wp_attachment_image_alt', true ) ?: '',
                    ];
                }
            } elseif ( is_string( $icon_val ) ) {
                // The "Prop Icon" ACF field's return_format is "url", so get_fields()
                // hands back a plain URL string rather than an array or attachment ID.
                $attachment_id = attachment_url_to_postid( $icon_val );
                $usp_icon_map[ $term_id ] = [
                    'sourceUrl' => $icon_val,
                    'altText'   => $attachment_id ? ( get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ) ?: '' ) : '',
                ];
            }
        }
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
        'product-lines'       => 'productLines',
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

        // Bundle Builder products keep their whole config on the product
        // itself (BB_Helpers::get_bundle_mode/is_price_shown/etc.) — there's
        // no separate "linked bundle" post to look up. $wc_type above is the
        // product_type taxonomy slug, and the plugin's own product type for
        // a bundle is literally 'bb_bundle', so that's the reliable signal
        // for "is this a bundle at all" (BB_GraphQL maps it to SimpleProduct
        // for GraphQL clients, same as $type_map falls back to here).
        $is_bundle = ( 'bb_bundle' === $wc_type ) && class_exists( 'BB_Helpers' );
        $bb_bundle_mode = null;
        $bb_show_price = null;
        $bb_from_price = null;
        $bb_fixed_price = null;
        $bb_fixed_original_price = null;

        if ( $is_bundle ) {
            $bb_bundle_mode = BB_Helpers::get_bundle_mode( $pid );

            if ( 'fixed' === $bb_bundle_mode ) {
                $fixed_price   = BB_Helpers::get_fixed_effective_price( $pid );
                $fixed_regular = BB_Helpers::get_fixed_regular_price( $pid );
                $bb_fixed_price          = $fixed_price > 0 ? (float) $fixed_price : null;
                $bb_fixed_original_price = $fixed_regular > 0 ? (float) $fixed_regular : null;
            } else {
                $bb_show_price = BB_Helpers::is_price_shown( $pid );
                $bb_from_price = $bb_show_price ? ( BB_Helpers::get_bundle_min_price( $pid ) ?: null ) : null;
                $bb_from_price = $bb_from_price > 0 ? (float) $bb_from_price : null;
            }
        }

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
            // Null when the product does not manage stock, matching what
            // WPGraphQL returns, so the frontend can tell "no data" apart from
            // a real zero.
            'stockQuantity'     => ( ( $meta['_manage_stock'] ?? 'no' ) === 'yes' && ( $meta['_stock'] ?? '' ) !== '' )
                ? (int) $meta['_stock']
                : null,
            'image'             => $image ? [
                'id'        => $meta['_thumbnail_id'] ?? '',
                'sourceUrl' => $image['sourceUrl'],
                'altText'   => $image['altText'],
            ] : null,
            'bbBundleMode'          => $bb_bundle_mode,
            'bbShowPrice'           => $bb_show_price,
            'bbFromPrice'           => $bb_from_price,
            'bbFixedPrice'          => $bb_fixed_price,
            'bbFixedOriginalPrice'  => $bb_fixed_original_price,
            'uniqueSellingProps' => [
                'nodes' => array_map( function ( $term ) use ( $usp_icon_map ) {
                    $icon = $usp_icon_map[ $term['term_id'] ] ?? null;
                    return [
                        'id'                  => base64_encode( 'unique-selling-prop:' . $term['term_id'] ),
                        'name'                => $term['name'],
                        'uniqueSellingFields' => [ 'propIcon' => $icon ? [ 'node' => $icon ] : null ],
                    ];
                }, $taxes['unique-selling-props'] ?? [] ),
            ],
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
