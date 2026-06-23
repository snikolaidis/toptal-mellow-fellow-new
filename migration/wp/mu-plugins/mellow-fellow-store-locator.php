<?php
/**
 * Plugin Name: Mellow Fellow Store Locator API
 * Description: Public REST endpoint that exposes Stockist (mipl) store data as clean JSON
 *              for the headless front-end map. The Stockist CPT is not REST-exposed, so we
 *              read the mipl_sl_stores CPT, its post meta, the store-category taxonomy and the
 *              custom lat/lng table, and return a normalized list the Next.js map can consume.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Resolve a store's coordinates: prefer post meta, fall back to the custom
 * wp_mipl_store_locator table that the plugin keeps keyed by post_id.
 */
function mellow_fellow_store_coords($post_id) {
    $lat = get_post_meta($post_id, '_mipl_sl_latitude', true);
    $lng = get_post_meta($post_id, '_mipl_sl_longitude', true);

    if ($lat === '' || $lng === '') {
        global $wpdb;
        $table = $wpdb->prefix . 'mipl_store_locator';
        $row = $wpdb->get_row(
            $wpdb->prepare("SELECT latitude, longitude FROM {$table} WHERE post_id = %d LIMIT 1", $post_id)
        );
        if ($row) {
            if ($lat === '') {
                $lat = $row->latitude;
            }
            if ($lng === '') {
                $lng = $row->longitude;
            }
        }
    }

    if ($lat === '' || $lng === '' || !is_numeric($lat) || !is_numeric($lng)) {
        return null;
    }

    return array('lat' => (float) $lat, 'lng' => (float) $lng);
}

function mellow_fellow_store_categories($post_id) {
    $terms = wp_get_post_terms($post_id, 'mipl_sl_store_category', array('fields' => 'names'));
    if (is_wp_error($terms)) {
        return array();
    }
    return array_values($terms);
}

function mellow_fellow_store_image($post_id) {
    $thumb = get_the_post_thumbnail_url($post_id, 'medium');
    if ($thumb) {
        return $thumb;
    }
    $img = get_post_meta($post_id, '_mipl_sl_store_img', true);
    return $img ? $img : null;
}

function mellow_fellow_store_to_array($post) {
    $coords = mellow_fellow_store_coords($post->ID);
    if (!$coords) {
        return null; // a store with no coordinates cannot be mapped
    }

    return array(
        'id'         => (int) $post->ID,
        'name'       => html_entity_decode(get_the_title($post), ENT_QUOTES | ENT_HTML5),
        'lat'        => $coords['lat'],
        'lng'        => $coords['lng'],
        'address'    => get_post_meta($post->ID, '_mipl_sl_address', true) ?: '',
        'city'       => get_post_meta($post->ID, '_mipl_sl_city', true) ?: '',
        'state'      => get_post_meta($post->ID, '_mipl_sl_state', true) ?: '',
        'country'    => get_post_meta($post->ID, '_mipl_sl_country', true) ?: '',
        'postCode'   => get_post_meta($post->ID, '_mipl_sl_post_code', true) ?: '',
        'phone'      => get_post_meta($post->ID, '_mipl_sl_telephone', true) ?: '',
        'email'      => get_post_meta($post->ID, '_mipl_sl_email', true) ?: '',
        'website'    => get_post_meta($post->ID, '_mipl_sl_website', true) ?: '',
        'hours'      => get_post_meta($post->ID, '_mipl_sl_opening_hours', true) ?: '',
        'image'      => mellow_fellow_store_image($post->ID),
        'categories' => mellow_fellow_store_categories($post->ID),
    );
}

add_action('rest_api_init', function () {
    register_rest_route('mellow-fellow/v1', '/stores', array(
        'methods'             => 'GET',
        'permission_callback' => '__return_true',
        'callback'            => function (WP_REST_Request $request) {
            $query = new WP_Query(array(
                'post_type'      => 'mipl_sl_stores',
                'post_status'    => 'publish',
                'posts_per_page' => -1,
                'orderby'        => 'title',
                'order'          => 'ASC',
                'no_found_rows'  => true,
            ));

            $stores = array();
            foreach ($query->posts as $post) {
                $store = mellow_fellow_store_to_array($post);
                if ($store) {
                    $stores[] = $store;
                }
            }
            wp_reset_postdata();

            return new WP_REST_Response(array(
                'count'  => count($stores),
                'stores' => $stores,
            ), 200);
        },
    ));
});
