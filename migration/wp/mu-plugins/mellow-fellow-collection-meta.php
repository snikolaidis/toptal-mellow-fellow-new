<?php
/**
 * Plugin Name: Mellow Fellow - Collection Meta REST Endpoint
 * Description: Returns collection metadata (ACF fields, SEO, related posts)
 *              using direct WordPress function calls instead of WPGraphQL.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', function () {
    register_rest_route( 'mf/v1', '/collection-meta', [
        'methods'             => 'GET',
        'callback'            => 'mf_get_collection_meta',
        'permission_callback' => '__return_true',
        'args'                => [
            'slug' => [ 'required' => true, 'type' => 'string', 'sanitize_callback' => 'sanitize_title' ],
        ],
    ] );
} );

function mf_resolve_image( $value ) {
    if ( empty( $value ) ) return null;

    if ( is_array( $value ) && ! empty( $value['url'] ) ) {
        return [ 'sourceUrl' => $value['url'], 'altText' => $value['alt'] ?? '' ];
    }

    if ( is_numeric( $value ) ) {
        $url = wp_get_attachment_url( (int) $value );
        if ( ! $url ) return null;
        $alt = get_post_meta( (int) $value, '_wp_attachment_image_alt', true );
        return [ 'sourceUrl' => $url, 'altText' => $alt ?: '' ];
    }

    if ( is_string( $value ) && str_starts_with( $value, 'http' ) ) {
        return [ 'sourceUrl' => $value, 'altText' => '' ];
    }

    return null;
}

function mf_acf_get( $fields, $keys ) {
    foreach ( $keys as $key ) {
        if ( isset( $fields[ $key ] ) && $fields[ $key ] !== '' && $fields[ $key ] !== false ) {
            return $fields[ $key ];
        }
    }
    return null;
}

function mf_get_collection_meta( WP_REST_Request $request ) {
    $slug = $request->get_param( 'slug' );

    $cache_key = 'mf_cmeta_' . md5( $slug );
    $cached = get_transient( $cache_key );
    if ( $cached !== false ) {
        return new WP_REST_Response( $cached, 200 );
    }

    $term = get_term_by( 'slug', $slug, 'collection' );
    if ( ! $term || is_wp_error( $term ) ) {
        return new WP_REST_Response( [ 'success' => false, 'message' => 'Collection not found' ], 404 );
    }

    $tid = $term->term_id;
    $acf = function_exists( 'get_fields' ) ? ( get_fields( 'collection_' . $tid ) ?: [] ) : [];

    // -----------------------------------------------------------------------
    // Hero images
    // -----------------------------------------------------------------------
    $hero_desktop = mf_resolve_image( mf_acf_get( $acf, [ 'collection_hero_desktop', 'collectionHeroDesktop' ] ) );
    $hero_mobile  = mf_resolve_image( mf_acf_get( $acf, [ 'collection_hero_mobile', 'collectionHeroMobile' ] ) );

    // -----------------------------------------------------------------------
    // Text fields
    // -----------------------------------------------------------------------
    $warning   = mf_acf_get( $acf, [ 'warning_message', 'warningMessage' ] );
    $faq_title = mf_acf_get( $acf, [ 'faq_section_title', 'faqSectionTitle' ] );
    $rel_title = mf_acf_get( $acf, [ 'related_collection_title', 'relatedCollectionTitle' ] );

    // -----------------------------------------------------------------------
    // Thumbnail image (used when this collection appears as a related collection)
    // -----------------------------------------------------------------------
    $thumbnail = mf_resolve_image( mf_acf_get( $acf, [ 'thumbnail_image', 'thumbnailImage' ] ) );

    // -----------------------------------------------------------------------
    // FAQs (relationship to FAQ CPT)
    // -----------------------------------------------------------------------
    $faqs_raw = mf_acf_get( $acf, [ 'faqs' ] ) ?: [];
    $faqs = [];
    foreach ( $faqs_raw as $faq ) {
        if ( is_object( $faq ) ) {
            $faqs[] = [
                'id'      => base64_encode( 'post:' . $faq->ID ),
                'title'   => $faq->post_title,
                'content' => apply_filters( 'the_content', $faq->post_content ),
            ];
        } elseif ( is_numeric( $faq ) ) {
            $p = get_post( (int) $faq );
            if ( $p ) {
                $faqs[] = [
                    'id'      => base64_encode( 'post:' . $p->ID ),
                    'title'   => $p->post_title,
                    'content' => apply_filters( 'the_content', $p->post_content ),
                ];
            }
        }
    }

    // -----------------------------------------------------------------------
    // Related collections (relationship to other collection terms)
    // -----------------------------------------------------------------------
    $rel_raw = mf_acf_get( $acf, [ 'related_collections', 'relatedCollections' ] ) ?: [];
    $related_collections = [];
    foreach ( $rel_raw as $rc ) {
        $rc_tid  = is_object( $rc ) ? $rc->term_id : ( is_numeric( $rc ) ? (int) $rc : 0 );
        if ( ! $rc_tid ) continue;
        $rc_term = is_object( $rc ) ? $rc : get_term( $rc_tid, 'collection' );
        if ( ! $rc_term || is_wp_error( $rc_term ) ) continue;

        $rc_acf  = function_exists( 'get_fields' ) ? ( get_fields( 'collection_' . $rc_tid ) ?: [] ) : [];
        $rc_thumb = mf_resolve_image( mf_acf_get( $rc_acf, [ 'thumbnail_image', 'thumbnailImage' ] ) );

        $related_collections[] = [
            'id'               => base64_encode( 'collection:' . $rc_tid ),
            'name'             => $rc_term->name,
            'slug'             => $rc_term->slug,
            'collectionFields' => [
                'thumbnailImage' => $rc_thumb ? [ 'node' => $rc_thumb ] : null,
            ],
        ];
    }

    // -----------------------------------------------------------------------
    // Related posts (reuses function from mellow-fellow-related-posts.php)
    // -----------------------------------------------------------------------
    $related_posts = [];
    if ( function_exists( 'mf_related_posts_resolve' ) ) {
        $rp_raw = mf_related_posts_resolve( $term->name, 12 );
        foreach ( $rp_raw as $rp ) {
            $thumb_id  = get_post_thumbnail_id( $rp->ID );
            $thumb_img = $thumb_id ? mf_resolve_image( $thumb_id ) : null;
            $related_posts[] = [
                'id'            => base64_encode( 'post:' . $rp->ID ),
                'databaseId'    => $rp->ID,
                'title'         => $rp->post_title,
                'slug'          => $rp->post_name,
                'date'          => $rp->post_date,
                'excerpt'       => get_the_excerpt( $rp ),
                'featuredImage' => $thumb_img ? [ 'node' => $thumb_img ] : null,
            ];
        }
    }

    // -----------------------------------------------------------------------
    // Yoast SEO
    // -----------------------------------------------------------------------
    $seo_title   = get_term_meta( $tid, '_yoast_wpseo_title', true );
    $seo_desc    = get_term_meta( $tid, '_yoast_wpseo_metadesc', true );
    $og_title    = get_term_meta( $tid, '_yoast_wpseo_opengraph-title', true );
    $og_desc     = get_term_meta( $tid, '_yoast_wpseo_opengraph-description', true );
    $og_image_id = get_term_meta( $tid, '_yoast_wpseo_opengraph-image-id', true );
    $og_image    = $og_image_id ? wp_get_attachment_url( (int) $og_image_id ) : null;
    if ( ! $og_image ) {
        $og_image = get_term_meta( $tid, '_yoast_wpseo_opengraph-image', true ) ?: null;
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
    // Assemble
    // -----------------------------------------------------------------------
    $result = [
        'success'    => true,
        'collection' => [
            'id'               => base64_encode( 'collection:' . $tid ),
            'databaseId'       => $tid,
            'name'             => $term->name,
            'slug'             => $term->slug,
            'description'      => term_description( $tid, 'collection' ),
            'count'            => (int) $term->count,
            'collectionFields' => [
                'collectionHeroDesktop'    => $hero_desktop ? [ 'node' => $hero_desktop ] : null,
                'collectionHeroMobile'     => $hero_mobile ? [ 'node' => $hero_mobile ] : null,
                'warningMessage'           => $warning ?: null,
                'faqSectionTitle'          => $faq_title ?: null,
                'faqs'                     => [ 'nodes' => $faqs ],
                'relatedCollectionTitle'   => $rel_title ?: null,
                'relatedCollections'       => [ 'nodes' => $related_collections ],
                'thumbnailImage'           => $thumbnail ? [ 'node' => $thumbnail ] : null,
            ],
            'relatedPosts' => $related_posts,
            'seo'          => $seo,
        ],
    ];

    set_transient( $cache_key, $result, 300 );

    return new WP_REST_Response( $result, 200 );
}
