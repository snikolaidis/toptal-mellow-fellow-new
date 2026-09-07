<?php
/**
 * Plugin Name: Mellow Fellow - Quiz Recommendations REST Endpoint
 * Description: Scores published products against the taxonomy terms mapped to a
 *              quiz's selected answers, returning the scored matches (topMatches)
 *              plus a best-seller cross-sell set (alsoLike), both hydrated to the
 *              same JSON shape as the collection-products endpoint.
 * Version: 1.1.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

// Answer mapping sub-field name => the taxonomy its term IDs belong to. The
// frontend never sees these fields; they are read here via get_field().
const MF_QUIZ_MAP_FIELDS = [
    'map_moods'         => 'mood',
    'map_product_types' => 'product-type',
    'map_cannabinoids'  => 'cannabinoid',
    'map_strain_types'  => 'strain-type',
];

// Per-taxonomy score multipliers keyed by the taxonomy each mapping resolves to.
// Mood dominates the score so the quiz leads with how the customer wants to feel;
// strain type is the lightest signal. An answer's weight is multiplied by these
// before it is summed into the term score.
const MF_QUIZ_TAXONOMY_FACTORS = [
    'mood'         => 3.0,
    'product-type' => 2.0,
    'cannabinoid'  => 2.0,
    'strain-type'  => 1.0,
];

// How many cross-sell products the alsoLike set is filled up to.
const MF_QUIZ_ALSO_LIKE_COUNT = 6;

// Bump when the response shape or scoring changes so cached transients from an
// older shape (e.g. without topMatches/alsoLike) are never served.
const MF_QUIZ_CACHE_VERSION = 'v2';

add_action( 'rest_api_init', function () {
    register_rest_route( 'mf/v1', '/quiz-recommendations', [
        'methods'             => 'POST',
        'callback'            => 'mf_quiz_recommendations_handler',
        'permission_callback' => '__return_true',
    ] );
} );

function mf_quiz_recommendations_handler( WP_REST_Request $request ) {
    $params = $request->get_json_params();
    if ( ! is_array( $params ) ) {
        $params = $request->get_params();
    }

    $quiz_ref   = $params['quiz'] ?? $params['quizSlug'] ?? '';
    $selections = ( isset( $params['selections'] ) && is_array( $params['selections'] ) ) ? $params['selections'] : [];

    $quiz_post = mf_quiz_resolve_post( $quiz_ref );
    if ( ! $quiz_post ) {
        return new WP_REST_Response( [ 'success' => false, 'topMatches' => [], 'alsoLike' => [], 'products' => [], 'count' => 0 ], 404 );
    }
    $quiz_id = (int) $quiz_post->ID;

    $result_count = function_exists( 'get_field' ) ? (int) get_field( 'result_count', $quiz_id ) : 0;
    if ( $result_count < 1 ) {
        $result_count = 8;
    }
    $result_count = min( 24, $result_count );

    // Normalise selections (dedupe + sort) so the cache key is stable regardless
    // of the order the client happened to send answers in.
    $norm = [];
    foreach ( $selections as $sel ) {
        if ( ! isset( $sel['q'] ) ) continue;
        $q = (int) $sel['q'];
        $a = ( isset( $sel['a'] ) && is_array( $sel['a'] ) )
            ? array_values( array_unique( array_map( 'intval', $sel['a'] ) ) )
            : [];
        sort( $a );
        $norm[ $q ] = $a;
    }
    ksort( $norm );

    $cache_key = 'mf_quiz_' . md5( MF_QUIZ_CACHE_VERSION . '_' . $quiz_id . '_' . wp_json_encode( $norm ) );
    $cached = get_transient( $cache_key );
    if ( $cached !== false ) {
        return new WP_REST_Response( $cached, 200 );
    }

    // -----------------------------------------------------------------------
    // 1. Collect weighted term IDs from the selected answers
    // -----------------------------------------------------------------------
    $questions = function_exists( 'get_field' ) ? get_field( 'questions', $quiz_id ) : [];
    if ( ! is_array( $questions ) ) {
        $questions = [];
    }

    // taxonomy => [ term_id => summed weight ]
    $term_weights = [];
    foreach ( $norm as $q => $answer_indices ) {
        $answers = $questions[ $q ]['answers'] ?? null;
        if ( ! is_array( $answers ) ) continue;

        foreach ( $answer_indices as $a ) {
            if ( ! isset( $answers[ $a ] ) ) continue;
            $answer = $answers[ $a ];
            $weight = ( isset( $answer['weight'] ) && $answer['weight'] !== '' ) ? (float) $answer['weight'] : 1.0;

            foreach ( MF_QUIZ_MAP_FIELDS as $field => $taxonomy ) {
                $term_ids = $answer[ $field ] ?? [];
                if ( empty( $term_ids ) ) continue;

                // Weight the answer more heavily for decisive taxonomies (mood > type
                // = cannabinoid > strain type) so mood drives the final ranking.
                $factor = MF_QUIZ_TAXONOMY_FACTORS[ $taxonomy ] ?? 1.0;

                foreach ( (array) $term_ids as $term_id ) {
                    // The taxonomy field returns term IDs, but a term object slips
                    // through when the field's return format is left as object.
                    $tid = (int) ( is_array( $term_id ) ? ( $term_id['term_id'] ?? 0 ) : $term_id );
                    if ( $tid <= 0 ) continue;
                    $term_weights[ $taxonomy ][ $tid ] = ( $term_weights[ $taxonomy ][ $tid ] ?? 0.0 ) + ( $weight * $factor );
                }
            }
        }
    }

    global $wpdb;

    // -----------------------------------------------------------------------
    // 2. Resolve (taxonomy, term_id) pairs to term_taxonomy_ids
    // -----------------------------------------------------------------------
    $ttid_weights = [];
    $all_term_ids = [];
    foreach ( $term_weights as $tids ) {
        foreach ( $tids as $tid => $w ) {
            $all_term_ids[] = $tid;
        }
    }
    $all_term_ids = array_values( array_unique( $all_term_ids ) );

    if ( ! empty( $all_term_ids ) ) {
        $used_taxonomies = array_keys( $term_weights );
        $tid_placeholders = implode( ',', array_fill( 0, count( $all_term_ids ), '%d' ) );
        $tax_placeholders = implode( ',', array_fill( 0, count( $used_taxonomies ), '%s' ) );

        $ttid_sql = $wpdb->prepare(
            "SELECT term_id, taxonomy, term_taxonomy_id
             FROM {$wpdb->term_taxonomy}
             WHERE term_id IN ({$tid_placeholders})
               AND taxonomy IN ({$tax_placeholders})",
            ...array_merge( $all_term_ids, $used_taxonomies )
        );
        $ttid_rows = $wpdb->get_results( $ttid_sql );

        foreach ( $ttid_rows as $row ) {
            $tax = $row->taxonomy;
            $tid = (int) $row->term_id;
            if ( isset( $term_weights[ $tax ][ $tid ] ) ) {
                $ttid = (int) $row->term_taxonomy_id;
                $ttid_weights[ $ttid ] = ( $ttid_weights[ $ttid ] ?? 0.0 ) + $term_weights[ $tax ][ $tid ];
            }
        }
    }

    // -----------------------------------------------------------------------
    // 3. Score products in one grouped query, highest score first
    // -----------------------------------------------------------------------
    $scored_ids = [];
    if ( ! empty( $ttid_weights ) ) {
        $ttids      = array_keys( $ttid_weights );
        $case_parts = [];
        $case_args  = [];
        foreach ( $ttid_weights as $ttid => $w ) {
            $case_parts[] = 'WHEN %d THEN %f';
            $case_args[]  = $ttid;
            $case_args[]  = $w;
        }
        $ttid_placeholders = implode( ',', array_fill( 0, count( $ttids ), '%d' ) );

        $score_sql = $wpdb->prepare(
            "SELECT p.ID,
                    SUM(CASE tr.term_taxonomy_id " . implode( ' ', $case_parts ) . " ELSE 0 END) AS score
             FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
             INNER JOIN {$wpdb->postmeta} stock ON p.ID = stock.post_id AND stock.meta_key = '_stock_status'
             LEFT JOIN {$wpdb->postmeta} sales ON p.ID = sales.post_id AND sales.meta_key = 'total_sales'
             WHERE p.post_type = 'product'
               AND p.post_status = 'publish'
               AND stock.meta_value != 'outofstock'
               AND tr.term_taxonomy_id IN ({$ttid_placeholders})
             GROUP BY p.ID
             HAVING score > 0
             ORDER BY score DESC, CAST(COALESCE(MAX(sales.meta_value), 0) AS UNSIGNED) DESC, p.post_title ASC
             LIMIT %d",
            ...array_merge( $case_args, $ttids, [ $result_count ] )
        );
        $score_rows = $wpdb->get_results( $score_sql );
        foreach ( $score_rows as $r ) {
            $scored_ids[] = (int) $r->ID;
        }
    }

    // -----------------------------------------------------------------------
    // 4. Cross-sell: best sellers (in-stock, published) that are NOT already a
    //    scored match, filling the alsoLike set up to MF_QUIZ_ALSO_LIKE_COUNT.
    // -----------------------------------------------------------------------
    $top_ids  = $scored_ids;
    $exclude  = ! empty( $top_ids ) ? $top_ids : [ 0 ];
    $excl_placeholders = implode( ',', array_fill( 0, count( $exclude ), '%d' ) );

    $also_sql = $wpdb->prepare(
        "SELECT p.ID
         FROM {$wpdb->posts} p
         INNER JOIN {$wpdb->postmeta} stock ON p.ID = stock.post_id AND stock.meta_key = '_stock_status'
         LEFT JOIN {$wpdb->postmeta} sales ON p.ID = sales.post_id AND sales.meta_key = 'total_sales'
         WHERE p.post_type = 'product'
           AND p.post_status = 'publish'
           AND stock.meta_value != 'outofstock'
           AND p.ID NOT IN ({$excl_placeholders})
         ORDER BY CAST(COALESCE(sales.meta_value, 0) AS UNSIGNED) DESC, p.menu_order ASC, p.post_title ASC
         LIMIT %d",
        ...array_merge( $exclude, [ MF_QUIZ_ALSO_LIKE_COUNT ] )
    );
    $also_ids = array_map( 'intval', $wpdb->get_col( $also_sql ) );

    // -----------------------------------------------------------------------
    // 5. Hydrate both sets to the collection-products JSON shape
    // -----------------------------------------------------------------------
    $top_matches = mf_quiz_hydrate_products( $top_ids );
    $also_like   = mf_quiz_hydrate_products( $also_ids );

    $result = [
        'success'    => true,
        'topMatches' => $top_matches,
        'alsoLike'   => $also_like,
        // Backward-compat: products mirrors topMatches for clients built to the
        // old shape. count reflects the scored matches (topMatches).
        'products'   => $top_matches,
        'count'      => count( $top_matches ),
    ];
    set_transient( $cache_key, $result, 300 );

    return new WP_REST_Response( $result, 200 );
}

function mf_quiz_resolve_post( $ref ) {
    if ( is_numeric( $ref ) ) {
        $post = get_post( (int) $ref );
        return ( $post && $post->post_type === 'quiz' && $post->post_status === 'publish' ) ? $post : null;
    }

    $slug = sanitize_title( (string) $ref );
    if ( $slug === '' ) {
        return null;
    }

    $post = get_page_by_path( $slug, OBJECT, 'quiz' );
    return ( $post && $post->post_status === 'publish' ) ? $post : null;
}

/**
 * Batch-hydrate the given product IDs into the exact shape the frontend
 * ProductCard reads, preserving the incoming order. Mirrors the hydration in
 * mellow-fellow-collection-products.php so quiz results match collection results.
 */
function mf_quiz_hydrate_products( array $product_ids ) {
    $product_ids = array_values( array_unique( array_filter( array_map( 'intval', $product_ids ) ) ) );
    if ( empty( $product_ids ) ) {
        return [];
    }

    global $wpdb;
    $id_placeholders = implode( ',', array_fill( 0, count( $product_ids ), '%d' ) );

    // Post rows (title/slug) keyed by ID.
    $posts_sql = $wpdb->prepare(
        "SELECT ID, post_title, post_name FROM {$wpdb->posts} WHERE ID IN ({$id_placeholders})",
        ...$product_ids
    );
    $post_rows = $wpdb->get_results( $posts_sql );
    $post_map  = [];
    foreach ( $post_rows as $pr ) {
        $post_map[ (int) $pr->ID ] = $pr;
    }

    // Metadata.
    $meta_keys = [
        '_price', '_regular_price', '_sale_price', '_stock_status',
        '_stock', '_manage_stock',
        '_thumbnail_id', '_bb_linked_bundle_id', '_bb_show_from_price',
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

    // Taxonomy terms (custom taxonomies + product_type).
    $tax_list = [
        'product_type',
        'product-type', 'strain-type', 'strain-name', 'blend-types',
        'product-lines', 'size', 'cannabinoid', 'single-cannabinoid', 'mg', 'pieces',
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

    // Featured images.
    $upload_dir  = wp_upload_dir();
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
        'product-lines'      => 'productLines',
        'size'               => 'size',
        'cannabinoid'        => 'cannabinoids',
        'single-cannabinoid' => 'singleCannabinoid',
        'mg'                 => 'mG',
        'pieces'             => 'pieces',
    ];

    // Assemble in the incoming order so scored products precede fallbacks.
    $products = [];
    foreach ( $product_ids as $pid ) {
        if ( ! isset( $post_map[ $pid ] ) ) continue;
        $post  = $post_map[ $pid ];
        $meta  = $meta_map[ $pid ] ?? [];
        $taxes = $tax_map[ $pid ] ?? [];
        $image = $img_map[ $pid ] ?? null;

        $wc_type   = $taxes['product_type'][0]['slug'] ?? 'simple';
        $type_info = $type_map[ $wc_type ] ?? $type_map['simple'];

        // wc-bundle-builder never persists a "from price"; it is computed live and
        // only surfaced when the "Show 'From' price" checkbox is on. Mirror that
        // gate rather than reading a bb_from_price meta key that doesn't exist.
        $bb_id = ! empty( $meta['_bb_linked_bundle_id'] ) ? (int) $meta['_bb_linked_bundle_id'] : 0;
        $bb_from_price = ( $bb_id && ( $meta['_bb_show_from_price'] ?? '' ) === 'yes' && class_exists( 'BB_Helpers' ) )
            ? BB_Helpers::get_bundle_min_price( $bb_id )
            : 0.0;

        $price        = isset( $meta['_price'] )         ? '$' . number_format( (float) $meta['_price'], 2 )         : null;
        $regularPrice = isset( $meta['_regular_price'] ) ? '$' . number_format( (float) $meta['_regular_price'], 2 ) : null;
        $salePrice    = ! empty( $meta['_sale_price'] )  ? '$' . number_format( (float) $meta['_sale_price'], 2 )    : null;

        $tax_fields = [];
        foreach ( $tax_field_map as $taxonomy => $field_name ) {
            $tax_fields[ $field_name ] = [ 'nodes' => $taxes[ $taxonomy ] ?? [] ];
        }

        $product = [
            '__typename'       => $type_info[0],
            'id'               => base64_encode( "product:{$pid}" ),
            'databaseId'       => $pid,
            'name'             => $post->post_title,
            'slug'             => $post->post_name,
            'type'             => $type_info[1],
            'price'            => $price,
            'regularPrice'     => $regularPrice,
            'salePrice'        => $salePrice,
            'stockStatus'      => $stock_status_map[ $meta['_stock_status'] ?? 'instock' ] ?? 'IN_STOCK',
            // Null when the product does not manage stock, matching WPGraphQL, so
            // the frontend can tell "no data" apart from a real zero.
            'stockQuantity'    => ( ( $meta['_manage_stock'] ?? 'no' ) === 'yes' && ( $meta['_stock'] ?? '' ) !== '' )
                ? (int) $meta['_stock']
                : null,
            'image'            => $image ? [
                'id'        => $meta['_thumbnail_id'] ?? '',
                'sourceUrl' => $image['sourceUrl'],
                'altText'   => $image['altText'],
            ] : null,
            'bbLinkedBundleId' => $bb_id ?: null,
            'bbFromPrice'      => $bb_from_price > 0 ? (float) $bb_from_price : null,
        ];

        $products[] = array_merge( $product, $tax_fields );
    }

    return $products;
}
