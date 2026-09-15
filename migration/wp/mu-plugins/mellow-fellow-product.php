<?php
/**
 * Plugin Name: Mellow Fellow - Product REST Endpoint
 * Description: Returns a single product with all PDP data (ACF, SEO, variations,
 *              available options, nutrition, icon taxonomies, fixed bundle
 *              items) using direct SQL + WordPress functions.
 *              Replaces the slow WPGraphQL GET_PRODUCT_BY_SLUG query.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', function () {
    register_rest_route( 'mf/v1', '/product', [
        'methods'             => 'GET',
        'callback'            => 'mf_get_product',
        'permission_callback' => '__return_true',
        'args'                => [
            'slug' => [ 'required' => true, 'type' => 'string', 'validate_callback' => 'rest_validate_request_arg', 'sanitize_callback' => 'sanitize_title' ],
        ],
    ] );
} );

/**
 * Bust the 5-minute transient (see mf_get_product()) the moment a product
 * actually changes, instead of leaving admins to wait it out or manually
 * `wp transient delete` after every edit. Covers the normal product save
 * (price, stock and ACF fields, all part of the same wp-admin product edit
 * form) plus meta/taxonomy changes made outside that form (quick edit,
 * programmatic updates).
 */
add_action( 'save_post_product', 'mf_clear_product_cache' );
add_action( 'updated_postmeta', 'mf_clear_product_cache_on_meta_change', 10, 2 );
add_action( 'added_post_meta', 'mf_clear_product_cache_on_meta_change', 10, 2 );
add_action( 'deleted_post_meta', 'mf_clear_product_cache_on_meta_change', 10, 2 );
add_action( 'set_object_terms', 'mf_clear_product_cache_on_terms_change' );

function mf_clear_product_cache( $post_id ) {
    if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
        return;
    }
    $slug = get_post_field( 'post_name', $post_id );
    if ( $slug ) {
        delete_transient( 'mf_prod_' . md5( $slug ) );
    }
}

function mf_clear_product_cache_on_meta_change( $meta_id, $post_id ) {
    if ( 'product' === get_post_type( $post_id ) ) {
        mf_clear_product_cache( $post_id );
    }
}

function mf_clear_product_cache_on_terms_change( $post_id ) {
    if ( 'product' === get_post_type( $post_id ) ) {
        mf_clear_product_cache( $post_id );
    }
}

function mf_resolve_attachment( $attachment_id ) {
    if ( ! $attachment_id ) return null;
    $url = wp_get_attachment_url( (int) $attachment_id );
    if ( ! $url ) return null;
    $alt = get_post_meta( (int) $attachment_id, '_wp_attachment_image_alt', true );
    return [
        'id'        => (string) $attachment_id,
        'sourceUrl' => $url,
        'altText'   => $alt ?: '',
    ];
}

/**
 * return_format is "url" today, so this gets a plain string, but an array and an
 * attachment ID are the other two ACF can return and wp-admin leaves no trace.
 */
function mf_resolve_acf_icon( $icon_val ) {
    if ( ! $icon_val ) return null;

    if ( is_array( $icon_val ) && ! empty( $icon_val['url'] ) ) {
        return [ 'sourceUrl' => $icon_val['url'], 'altText' => $icon_val['alt'] ?? '' ];
    }

    if ( is_numeric( $icon_val ) ) {
        $url = wp_get_attachment_url( (int) $icon_val );
        if ( ! $url ) return null;
        return [
            'sourceUrl' => $url,
            'altText'   => get_post_meta( (int) $icon_val, '_wp_attachment_image_alt', true ) ?: '',
        ];
    }

    if ( is_string( $icon_val ) ) {
        $attachment_id = attachment_url_to_postid( $icon_val );
        return [
            'sourceUrl' => $icon_val,
            'altText'   => $attachment_id ? ( get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ) ?: '' ) : '',
        ];
    }

    return null;
}

function mf_get_product( WP_REST_Request $request ) {
    $slug = $request->get_param( 'slug' );

    $cache_key = 'mf_prod_' . md5( $slug );
    $cached    = get_transient( $cache_key );
    if ( $cached !== false ) {
        return new WP_REST_Response( $cached, 200 );
    }

    $posts = get_posts( [
        'name'        => $slug,
        'post_type'   => 'product',
        'post_status' => 'publish',
        'numberposts' => 1,
    ] );
    if ( empty( $posts ) ) {
        return new WP_REST_Response( [ 'success' => false, 'message' => 'Product not found' ], 404 );
    }

    $post = $posts[0];
    $pid  = $post->ID;

    global $wpdb;

    // -----------------------------------------------------------------------
    // 1. Batch-fetch all postmeta
    // -----------------------------------------------------------------------
    $meta_rows = $wpdb->get_results( $wpdb->prepare(
        "SELECT meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id = %d",
        $pid
    ) );
    $meta = [];
    foreach ( $meta_rows as $mr ) {
        $meta[ $mr->meta_key ] = $mr->meta_value;
    }

    // Product type
    $wc_types  = wp_get_post_terms( $pid, 'product_type', [ 'fields' => 'slugs' ] );
    $wc_type   = is_array( $wc_types ) && ! empty( $wc_types ) ? $wc_types[0] : 'simple';
    $type_map  = [
        'simple'   => [ 'SimpleProduct',   'SIMPLE' ],
        'variable' => [ 'VariableProduct',  'VARIABLE' ],
        'external' => [ 'ExternalProduct',  'EXTERNAL' ],
        'grouped'  => [ 'GroupProduct',     'GROUPED' ],
    ];
    $type_info = $type_map[ $wc_type ] ?? $type_map['simple'];

    $stock_status_map = [
        'instock'     => 'IN_STOCK',
        'outofstock'  => 'OUT_OF_STOCK',
        'onbackorder' => 'ON_BACKORDER',
    ];

    // -----------------------------------------------------------------------
    // 2. Prices (plain text, no wc_price HTML)
    // -----------------------------------------------------------------------
    $price        = isset( $meta['_price'] )         ? '$' . number_format( (float) $meta['_price'], 2 )         : null;
    $regularPrice = isset( $meta['_regular_price'] ) ? '$' . number_format( (float) $meta['_regular_price'], 2 ) : null;
    $salePrice    = ! empty( $meta['_sale_price'] )  ? '$' . number_format( (float) $meta['_sale_price'], 2 )    : null;

    // -----------------------------------------------------------------------
    // 3. Images
    // -----------------------------------------------------------------------
    $image = ! empty( $meta['_thumbnail_id'] )
        ? mf_resolve_attachment( (int) $meta['_thumbnail_id'] )
        : null;

    $gallery = [];
    if ( ! empty( $meta['_product_image_gallery'] ) ) {
        foreach ( array_filter( array_map( 'intval', explode( ',', $meta['_product_image_gallery'] ) ) ) as $gid ) {
            $g = mf_resolve_attachment( $gid );
            if ( $g ) $gallery[] = $g;
        }
    }

    // -----------------------------------------------------------------------
    // 4. Taxonomy terms (batch SQL)
    // -----------------------------------------------------------------------
    $tax_config = [
        'product_cat'        => 'productCategories',
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
        'collection'         => 'collections',
    ];
    $tax_slugs        = array_keys( $tax_config );
    $tax_placeholders = implode( ',', array_fill( 0, count( $tax_slugs ), '%s' ) );

    $tax_rows = $wpdb->get_results( $wpdb->prepare(
        "SELECT t.term_id, t.name, t.slug, tt.taxonomy, tt.count
         FROM {$wpdb->term_relationships} tr
         INNER JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
         INNER JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
         WHERE tr.object_id = %d
           AND tt.taxonomy IN ({$tax_placeholders})",
        $pid,
        ...$tax_slugs
    ) );

    $tax_fields = [];
    foreach ( $tax_config as $taxonomy => $field_name ) {
        $tax_fields[ $field_name ] = [ 'nodes' => [] ];
    }
    foreach ( $tax_rows as $tr ) {
        $field_name = $tax_config[ $tr->taxonomy ] ?? null;
        if ( ! $field_name ) continue;
        $node = [ 'name' => $tr->name, 'slug' => $tr->slug ];
        if ( $tr->taxonomy === 'product_cat' ) {
            $node['id'] = base64_encode( 'product_cat:' . $tr->term_id );
        }
        if ( $tr->taxonomy === 'collection' ) {
            $node['id']    = base64_encode( 'collection:' . $tr->term_id );
            $node['count'] = (int) $tr->count;
        }
        $tax_fields[ $field_name ]['nodes'][] = $node;
    }

    // -----------------------------------------------------------------------
    // 5. PDP taxonomies carrying a per-term ACF icon
    // -----------------------------------------------------------------------
    // Three of the four taxonomy slugs are singular where the GraphQL field is
    // plural, so deriving one from the other silently returns no terms.
    $icon_tax_config = [
        'flavor'  => 'flavors',
        'vibe'    => 'vibes',
        'effects' => 'effects',
        'setting' => 'settings',
    ];
    $icon_tax_slugs        = array_keys( $icon_tax_config );
    $icon_tax_placeholders = implode( ',', array_fill( 0, count( $icon_tax_slugs ), '%s' ) );

    // Its own query, not four more slugs on the batch above: that one is unordered
    // because Available Options and the breadcrumb read a collection out by position.
    $icon_tax_rows = $wpdb->get_results( $wpdb->prepare(
        "SELECT t.term_id, t.name, t.slug, tt.taxonomy
         FROM {$wpdb->term_relationships} tr
         INNER JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
         INNER JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
         WHERE tr.object_id = %d
           AND tt.taxonomy IN ({$icon_tax_placeholders})
         ORDER BY t.name ASC",
        $pid,
        ...$icon_tax_slugs
    ) );

    $taxonomies = [];
    foreach ( $icon_tax_config as $field_name ) {
        $taxonomies[ $field_name ] = [ 'nodes' => [] ];
    }
    foreach ( $icon_tax_rows as $itr ) {
        $field_name = $icon_tax_config[ $itr->taxonomy ] ?? null;
        if ( ! $field_name ) continue;

        $term_acf = function_exists( 'get_fields' )
            ? ( get_fields( $itr->taxonomy . '_' . $itr->term_id ) ?: [] )
            : [];
        // propIcon over GraphQL usually means an ACF field named prop_icon, but an
        // older copy of the group calls it icon_field. Missing it drops every icon.
        $icon = mf_resolve_acf_icon(
            $term_acf['prop_icon'] ?? $term_acf['propIcon'] ?? $term_acf['icon_field'] ?? null
        );

        $taxonomies[ $field_name ]['nodes'][] = [
            'id'                  => base64_encode( 'term:' . $itr->term_id ),
            'name'                => $itr->name,
            'slug'                => $itr->slug,
            'extraTaxonomyFields' => [ 'propIcon' => $icon ? [ 'node' => $icon ] : null ],
        ];
    }

    // -----------------------------------------------------------------------
    // 6. Unique selling props (with ACF icon)
    // -----------------------------------------------------------------------
    $usp_terms = wp_get_post_terms( $pid, 'unique-selling-props', [ 'fields' => 'all' ] );
    $usp_nodes = [];
    if ( ! is_wp_error( $usp_terms ) ) {
        foreach ( $usp_terms as $usp ) {
            $usp_acf = function_exists( 'get_fields' )
                ? ( get_fields( 'unique-selling-props_' . $usp->term_id ) ?: [] )
                : [];
            $icon = mf_resolve_acf_icon( $usp_acf['prop_icon'] ?? $usp_acf['propIcon'] ?? null );
            $usp_nodes[] = [
                'id'                 => base64_encode( 'unique-selling-prop:' . $usp->term_id ),
                'name'               => $usp->name,
                'uniqueSellingFields' => [
                    'propIcon' => $icon ? [ 'node' => $icon ] : null,
                ],
            ];
        }
    }

    // -----------------------------------------------------------------------
    // 7. ACF productDetails field group
    // -----------------------------------------------------------------------
    $acf = function_exists( 'get_fields' ) ? ( get_fields( $pid ) ?: [] ) : [];

    $detail_map = [
        'noidOrBlendDescriptionTitle' => [ 'noid_or_blend_description_title', 'noidOrBlendDescriptionTitle' ],
        'whatIsNoid'                  => [ 'what_is_noid', 'whatIsNoid' ],
        'directionsForUse'            => [ 'directions_for_use', 'directionsForUse' ],
        'deviceSpecifications'        => [ 'device_specifications', 'deviceSpecifications' ],
        'ingredientsV2'               => [ 'ingredients_v2', 'ingredientsV2' ],
        'servingSize'                 => [ 'serving_size', 'servingSize' ],
        'disclaimers'                 => [ 'disclaimers' ],
        'coaLink'                     => [ 'coa_link', 'coaLink' ],
    ];

    $pd = [];
    foreach ( $detail_map as $out => $keys ) {
        $pd[ $out ] = null;
        foreach ( $keys as $k ) {
            if ( isset( $acf[ $k ] ) && $acf[ $k ] !== '' && $acf[ $k ] !== false ) {
                $pd[ $out ] = $acf[ $k ];
                break;
            }
        }
    }

    $faqs_raw  = $acf['device_faqs_reference'] ?? $acf['deviceFaqsReference'] ?? [];
    $faq_nodes = [];
    if ( is_array( $faqs_raw ) ) {
        foreach ( $faqs_raw as $faq ) {
            if ( is_object( $faq ) ) {
                $faq_nodes[] = [
                    'id'      => base64_encode( 'post:' . $faq->ID ),
                    'title'   => $faq->post_title,
                    'content' => apply_filters( 'the_content', $faq->post_content ),
                ];
            } elseif ( is_numeric( $faq ) ) {
                $p = get_post( (int) $faq );
                if ( $p ) {
                    $faq_nodes[] = [
                        'id'      => base64_encode( 'post:' . $p->ID ),
                        'title'   => $p->post_title,
                        'content' => apply_filters( 'the_content', $p->post_content ),
                    ];
                }
            }
        }
    }
    $pd['deviceFaqsReference'] = [ 'nodes' => $faq_nodes ];

    // -----------------------------------------------------------------------
    // 8. Nutrition, top cannabinoids and allergens
    // -----------------------------------------------------------------------
    // Never empty(): a saved "0" is a real value and empty( "0" ) is true in
    // PHP. That is the bug mellow-fellow-nutrition-graphql-fix.php exists for.
    $nutrition = [];
    foreach ( [ 'calories', 'carbs', 'sugar' ] as $nutrition_key ) {
        $nutrition_val = $acf[ $nutrition_key ] ?? null;
        $nutrition[ $nutrition_key ] = ( isset( $nutrition_val ) && $nutrition_val !== false && $nutrition_val !== '' )
            ? (string) $nutrition_val
            : null;
    }

    $top_cannabinoids = [];
    foreach ( (array) ( $acf['top_3_cannabinoids'] ?? [] ) as $cannabinoid ) {
        if ( is_string( $cannabinoid ) && $cannabinoid !== '' ) {
            $top_cannabinoids[] = $cannabinoid;
        }
    }

    $allergens = ( isset( $acf['allergens'] ) && is_string( $acf['allergens'] ) && $acf['allergens'] !== '' )
        ? $acf['allergens']
        : null;

    // -----------------------------------------------------------------------
    // 9. Yoast SEO
    // -----------------------------------------------------------------------
    $seo_title    = get_post_meta( $pid, '_yoast_wpseo_title', true );
    $seo_desc     = get_post_meta( $pid, '_yoast_wpseo_metadesc', true );
    $og_title     = get_post_meta( $pid, '_yoast_wpseo_opengraph-title', true );
    $og_desc      = get_post_meta( $pid, '_yoast_wpseo_opengraph-description', true );
    $og_image_id  = get_post_meta( $pid, '_yoast_wpseo_opengraph-image-id', true );
    $og_image     = $og_image_id ? wp_get_attachment_url( (int) $og_image_id ) : null;
    if ( ! $og_image ) {
        $og_image = get_post_meta( $pid, '_yoast_wpseo_opengraph-image', true ) ?: null;
    }

    $seo = [
        'title'                => $seo_title ?: null,
        'metaDesc'             => $seo_desc ?: null,
        'schema'               => [ 'raw' => null ],
        'opengraphTitle'       => $og_title ?: null,
        'opengraphDescription' => $og_desc ?: null,
        'opengraphImage'       => $og_image ? [ 'sourceUrl' => $og_image ] : null,
    ];

    // -----------------------------------------------------------------------
    // 10. Variations (variable products only)
    // -----------------------------------------------------------------------
    $variations = [];
    if ( $wc_type === 'variable' ) {
        $var_posts = get_posts( [
            'post_parent'  => $pid,
            'post_type'    => 'product_variation',
            'post_status'  => 'publish',
            'numberposts'  => -1,
            'orderby'      => 'menu_order',
            'order'        => 'ASC',
        ] );

        if ( ! empty( $var_posts ) ) {
            $var_ids             = wp_list_pluck( $var_posts, 'ID' );
            $var_id_placeholders = implode( ',', array_fill( 0, count( $var_ids ), '%d' ) );

            $var_meta_rows = $wpdb->get_results( $wpdb->prepare(
                "SELECT post_id, meta_key, meta_value FROM {$wpdb->postmeta}
                 WHERE post_id IN ({$var_id_placeholders})
                   AND meta_key IN ('_price','_regular_price','_sale_price','_stock_status')",
                ...$var_ids
            ) );
            $var_meta = [];
            foreach ( $var_meta_rows as $vmr ) {
                $var_meta[ (int) $vmr->post_id ][ $vmr->meta_key ] = $vmr->meta_value;
            }

            $var_attr_rows = $wpdb->get_results( $wpdb->prepare(
                "SELECT post_id, meta_key, meta_value FROM {$wpdb->postmeta}
                 WHERE post_id IN ({$var_id_placeholders})
                   AND meta_key LIKE 'attribute_%%'",
                ...$var_ids
            ) );
            $var_attrs = [];
            foreach ( $var_attr_rows as $va ) {
                $var_attrs[ (int) $va->post_id ][] = [
                    'name'  => str_replace( 'attribute_', '', $va->meta_key ),
                    'value' => $va->meta_value,
                ];
            }

            foreach ( $var_posts as $vp ) {
                $vm   = $var_meta[ $vp->ID ] ?? [];
                $vp_p = isset( $vm['_price'] )         ? '$' . number_format( (float) $vm['_price'], 2 )         : null;
                $vp_r = isset( $vm['_regular_price'] ) ? '$' . number_format( (float) $vm['_regular_price'], 2 ) : null;
                $vp_s = ! empty( $vm['_sale_price'] )  ? '$' . number_format( (float) $vm['_sale_price'], 2 )    : null;

                $variations[] = [
                    'id'           => base64_encode( 'product_variation:' . $vp->ID ),
                    'databaseId'   => $vp->ID,
                    'name'         => $vp->post_title,
                    'price'        => $vp_p,
                    'regularPrice' => $vp_r,
                    'salePrice'    => $vp_s,
                    'stockStatus'  => $stock_status_map[ $vm['_stock_status'] ?? 'instock' ] ?? 'IN_STOCK',
                    'attributes'   => [ 'nodes' => $var_attrs[ $vp->ID ] ?? [] ],
                ];
            }
        }
    }

    // -----------------------------------------------------------------------
    // 11. Available Options (sibling products from best-matching collection)
    // -----------------------------------------------------------------------
    $collections_nodes = $tax_fields['collections']['nodes'] ?? [];

    $name_parts              = array_map( 'trim', explode( ' - ', $post->post_title ) );
    $available_options_base  = '';
    if ( count( $name_parts ) >= 3 ) {
        $available_options_base = implode( ' - ', array_slice( $name_parts, 1, -1 ) );
    } elseif ( count( $name_parts ) === 2 ) {
        $available_options_base = $name_parts[0];
    }

    $product_words = array_filter(
        array_map(
            function ( $w ) { return rtrim( strtolower( $w ), 's' ); },
            preg_split( '/[^a-z0-9]+/i', strtolower( $post->post_title ) )
        )
    );
    $word_set = array_flip( $product_words );

    $best_slug  = '';
    $best_score = -1;
    $best_count = PHP_INT_MAX;

    foreach ( $collections_nodes as $col ) {
        $cc = $col['count'] ?? 0;
        if ( $cc < 2 || $cc > 40 ) continue;
        $score = 0;
        foreach ( array_filter( explode( '-', $col['slug'] ) ) as $w ) {
            if ( isset( $word_set[ rtrim( $w, 's' ) ] ) || isset( $word_set[ $w ] ) ) $score++;
        }
        if ( $score > $best_score || ( $score === $best_score && $cc < $best_count ) ) {
            $best_score = $score;
            $best_count = $cc;
            $best_slug  = $col['slug'];
        }
    }

    $available_options = [];
    if ( $best_slug && $best_score >= 2 ) {
        $sibling_ids = $wpdb->get_col( $wpdb->prepare(
            "SELECT DISTINCT p.ID
             FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
             INNER JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
             INNER JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
             WHERE p.post_type = 'product'
               AND p.post_status = 'publish'
               AND tt.taxonomy = 'collection'
               AND t.slug = %s
             ORDER BY p.menu_order ASC, p.post_title ASC
             LIMIT 40",
            $best_slug
        ) );

        if ( count( $sibling_ids ) > 1 ) {
            $sib_placeholders = implode( ',', array_fill( 0, count( $sibling_ids ), '%d' ) );
            $sib_rows = $wpdb->get_results( $wpdb->prepare(
                "SELECT ID, post_title, post_name FROM {$wpdb->posts}
                 WHERE ID IN ({$sib_placeholders})
                 ORDER BY menu_order ASC, post_title ASC",
                ...$sibling_ids
            ) );

            $upload_dir  = wp_upload_dir();
            $upload_base = $upload_dir['baseurl'];
            $sib_img_rows = $wpdb->get_results( $wpdb->prepare(
                "SELECT pm.post_id,
                        CONCAT(%s, '/', ameta.meta_value) AS source_url,
                        COALESCE(altmeta.meta_value, '') AS alt_text
                 FROM {$wpdb->postmeta} pm
                 INNER JOIN {$wpdb->postmeta} ameta
                     ON pm.meta_value = ameta.post_id AND ameta.meta_key = '_wp_attached_file'
                 LEFT JOIN {$wpdb->postmeta} altmeta
                     ON pm.meta_value = altmeta.post_id AND altmeta.meta_key = '_wp_attachment_image_alt'
                 WHERE pm.post_id IN ({$sib_placeholders})
                   AND pm.meta_key = '_thumbnail_id'",
                $upload_base,
                ...$sibling_ids
            ) );
            $sib_img_map = [];
            foreach ( $sib_img_rows as $sir ) {
                $sib_img_map[ (int) $sir->post_id ] = [
                    'sourceUrl' => $sir->source_url,
                    'altText'   => $sir->alt_text,
                ];
            }

            foreach ( $sib_rows as $sr ) {
                $available_options[] = [
                    'id'         => base64_encode( 'product:' . $sr->ID ),
                    'databaseId' => (int) $sr->ID,
                    'name'       => $sr->post_title,
                    'slug'       => $sr->post_name,
                    'image'      => $sib_img_map[ (int) $sr->ID ] ?? null,
                ];
            }
        }
    }

    // -----------------------------------------------------------------------
    // 12. Collection name/slug (first collection for breadcrumb)
    // -----------------------------------------------------------------------
    $first_col       = ! empty( $collections_nodes ) ? $collections_nodes[0] : null;
    $collection_name = $first_col ? $first_col['name'] : null;
    $collection_slug = $first_col ? $first_col['slug'] : null;

    // -----------------------------------------------------------------------
    // 13. Fixed bundle items (admin-picked set, resolved to full products)
    // -----------------------------------------------------------------------
    // "mystery" is configured exactly like "fixed" but hides its contents from
    // non-admin viewers, and this response is public and cached. Do not include it.
    $fixed_bundle_items = [];
    if ( 'bb_bundle' === $wc_type
        && class_exists( 'BB_Helpers' )
        && method_exists( 'BB_Helpers', 'get_fixed_items' )
        && 'fixed' === BB_Helpers::get_bundle_mode( $pid ) ) {

        // GraphQL renames these to productId/quantity, so the helper's own key
        // spelling is read rather than assumed from the field names.
        $fixed_qty = [];
        foreach ( (array) BB_Helpers::get_fixed_items( $pid ) as $fixed_row ) {
            $fixed_row = (array) $fixed_row;
            $item_id   = (int) ( $fixed_row['product_id'] ?? $fixed_row['productId'] ?? 0 );
            $item_qty  = (int) ( $fixed_row['quantity'] ?? $fixed_row['qty'] ?? 0 );
            if ( $item_id > 0 ) {
                $fixed_qty[ $item_id ] = $item_qty > 0 ? $item_qty : 1;
            }
        }

        if ( ! empty( $fixed_qty ) ) {
            $item_ids          = array_keys( $fixed_qty );
            $item_placeholders = implode( ',', array_fill( 0, count( $item_ids ), '%d' ) );

            $item_rows = $wpdb->get_results( $wpdb->prepare(
                "SELECT ID, post_title, post_name FROM {$wpdb->posts}
                 WHERE ID IN ({$item_placeholders})
                   AND post_type = 'product'
                   AND post_status = 'publish'",
                ...$item_ids
            ) );

            $item_meta_rows = $wpdb->get_results( $wpdb->prepare(
                "SELECT post_id, meta_key, meta_value FROM {$wpdb->postmeta}
                 WHERE post_id IN ({$item_placeholders})
                   AND meta_key IN ('_price','_regular_price','_thumbnail_id')",
                ...$item_ids
            ) );
            $item_meta = [];
            foreach ( $item_meta_rows as $imr ) {
                $item_meta[ (int) $imr->post_id ][ $imr->meta_key ] = $imr->meta_value;
            }

            $item_products = [];
            foreach ( $item_rows as $ir ) {
                $item_pid = (int) $ir->ID;
                $im       = $item_meta[ $item_pid ] ?? [];
                $item_products[ $item_pid ] = [
                    'databaseId'   => $item_pid,
                    'name'         => $ir->post_title,
                    'slug'         => $ir->post_name,
                    'price'        => isset( $im['_price'] )         ? '$' . number_format( (float) $im['_price'], 2 )         : null,
                    'regularPrice' => isset( $im['_regular_price'] ) ? '$' . number_format( (float) $im['_regular_price'], 2 ) : null,
                    'image'        => ! empty( $im['_thumbnail_id'] ) ? mf_resolve_attachment( (int) $im['_thumbnail_id'] ) : null,
                ];
            }

            // The plugin's own item order, not the SQL's, is what
            // "What's included" lists top to bottom.
            foreach ( $fixed_qty as $item_id => $item_qty ) {
                $fixed_bundle_items[] = [
                    'productId' => $item_id,
                    'quantity'  => $item_qty,
                    'product'   => $item_products[ $item_id ] ?? null,
                ];
            }
        }
    }

    // -----------------------------------------------------------------------
    // 14. Assemble product
    // -----------------------------------------------------------------------
    $product = [
        '__typename'         => $type_info[0],
        'id'                 => base64_encode( 'product:' . $pid ),
        'databaseId'         => $pid,
        'name'               => $post->post_title,
        'slug'               => $post->post_name,
        'type'               => $type_info[1],
        'description'        => apply_filters( 'the_content', $post->post_content ),
        'shortDescription'   => $post->post_excerpt ? apply_filters( 'the_content', $post->post_excerpt ) : null,
        'sku'                => $meta['_sku'] ?? null,
        'price'              => $price,
        'regularPrice'       => $regularPrice,
        'salePrice'          => $salePrice,
        'stockStatus'        => $stock_status_map[ $meta['_stock_status'] ?? 'instock' ] ?? 'IN_STOCK',
        'stockQuantity'      => isset( $meta['_stock'] ) ? (int) $meta['_stock'] : null,
        'image'              => $image,
        'galleryImages'      => [ 'nodes' => $gallery ],
        'shopifyId'          => $meta['_shopify_id'] ?? null,
        'productDetails'     => $pd,
        'uniqueSellingProps'  => [ 'nodes' => $usp_nodes ],
        'seo'                => $seo,
    ];

    foreach ( $tax_fields as $key => $val ) {
        $product[ $key ] = $val;
    }

    if ( $wc_type === 'variable' ) {
        $product['variations'] = [ 'nodes' => $variations ];
    }
    if ( $wc_type === 'external' ) {
        $product['externalUrl'] = $meta['_product_url'] ?? null;
        $product['buttonText']  = $meta['_button_text'] ?? null;
    }

    // -----------------------------------------------------------------------
    // 15. Response
    // -----------------------------------------------------------------------
    $result = [
        'success'              => true,
        'product'              => $product,
        'collectionName'       => $collection_name,
        'collectionSlug'       => $collection_slug,
        'availableOptions'     => $available_options,
        'availableOptionsBase' => $available_options_base,
        'nutrition'            => $nutrition,
        'topCannabinoids'      => $top_cannabinoids,
        'allergens'            => $allergens,
        'taxonomies'           => $taxonomies,
        'fixedBundleItems'     => $fixed_bundle_items,
    ];

    set_transient( $cache_key, $result, 300 );

    return new WP_REST_Response( $result, 200 );
}
