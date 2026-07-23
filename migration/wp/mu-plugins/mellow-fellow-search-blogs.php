<?php
/**
 * REST endpoint: GET /mf/v1/search-blogs
 *
 * Fast SQL-based blog post search, replacing the WPGraphQL query.
 *
 * Params:
 *   q     — search query (min 2 chars)
 *   first — max results to return (default 4, max 12)
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', function () {
    register_rest_route( 'mf/v1', '/search-blogs', [
        'methods'             => 'GET',
        'callback'            => 'mf_search_blogs_handler',
        'permission_callback' => '__return_true',
    ] );
} );

function mf_search_blogs_handler( WP_REST_Request $request ) {
    $q = sanitize_text_field( $request->get_param( 'q' ) ?: '' );

    if ( strlen( $q ) < 2 ) {
        return new WP_REST_Response( [ 'success' => true, 'posts' => [] ], 200 );
    }

    $first = max( 1, min( 12, absint( $request->get_param( 'first' ) ?: 4 ) ) );

    $cache_key = 'mf_sb_' . md5( $q . '_' . $first );
    $cached = get_transient( $cache_key );
    if ( $cached !== false ) {
        return new WP_REST_Response( $cached, 200 );
    }

    global $wpdb;

    $like = '%' . $wpdb->esc_like( $q ) . '%';

    $sql = $wpdb->prepare(
        "SELECT p.ID, p.post_title, p.post_name, p.post_date, p.post_excerpt
         FROM {$wpdb->posts} p
         WHERE p.post_type = 'post'
           AND p.post_status = 'publish'
           AND (p.post_title LIKE %s OR p.post_content LIKE %s)
         ORDER BY
           CASE WHEN p.post_title LIKE %s THEN 0 ELSE 1 END,
           p.post_date DESC
         LIMIT %d",
        $like,
        $like,
        $like,
        $first
    );

    $rows = $wpdb->get_results( $sql );

    if ( empty( $rows ) ) {
        $result = [ 'success' => true, 'posts' => [] ];
        set_transient( $cache_key, $result, 300 );
        return new WP_REST_Response( $result, 200 );
    }

    $post_ids = array_map( function ( $r ) { return (int) $r->ID; }, $rows );
    $id_placeholders = implode( ',', array_fill( 0, count( $post_ids ), '%d' ) );

    $upload_dir  = wp_upload_dir();
    $upload_base = $upload_dir['baseurl'];

    $img_sql = $wpdb->prepare(
        "SELECT pm.post_id,
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
        ...$post_ids
    );

    $img_rows = $wpdb->get_results( $img_sql );
    $img_map  = [];
    foreach ( $img_rows as $ir ) {
        $img_map[ (int) $ir->post_id ] = [
            'sourceUrl' => $ir->source_url,
            'altText'   => $ir->alt_text,
        ];
    }

    $posts = [];
    foreach ( $rows as $row ) {
        $pid = (int) $row->ID;
        $posts[] = [
            'id'            => (string) $pid,
            'title'         => $row->post_title,
            'slug'          => $row->post_name,
            'date'          => $row->post_date,
            'excerpt'       => $row->post_excerpt ?: '',
            'featuredImage' => $img_map[ $pid ] ?? null,
        ];
    }

    $result = [ 'success' => true, 'posts' => $posts ];
    set_transient( $cache_key, $result, 300 );
    return new WP_REST_Response( $result, 200 );
}
