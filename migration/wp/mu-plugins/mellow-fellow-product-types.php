<?php
/**
 * REST endpoint: GET /mf/v1/product-types?ids=1,2,3
 *
 * Returns mf_product_type taxonomy slugs for the given product IDs.
 * Used by the recommendations API to resolve product types from cart items,
 * since the WooCommerce Store API doesn't return custom taxonomy data.
 */

add_action('rest_api_init', function () {
    register_rest_route('mf/v1', '/product-types', [
        'methods'             => 'GET',
        'callback'            => 'mf_product_types_handler',
        'permission_callback' => '__return_true',
    ]);
});

function mf_product_types_handler(WP_REST_Request $request) {
    $ids_raw = $request->get_param('ids');
    if (empty($ids_raw)) {
        return new WP_REST_Response(['success' => true, 'types' => []], 200);
    }

    $ids = array_filter(array_map('absint', explode(',', $ids_raw)));
    if (empty($ids)) {
        return new WP_REST_Response(['success' => true, 'types' => []], 200);
    }

    $ids = array_slice($ids, 0, 50);

    global $wpdb;

    $placeholders = implode(',', array_fill(0, count($ids), '%d'));
    $sql = $wpdb->prepare(
        "SELECT tr.object_id, t.slug
         FROM {$wpdb->term_relationships} tr
         JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
         JOIN {$wpdb->terms} t ON t.term_id = tt.term_id
         WHERE tt.taxonomy = 'mf_product_type'
           AND tr.object_id IN ($placeholders)",
        ...$ids
    );

    $rows = $wpdb->get_results($sql);

    $types = [];
    foreach ($rows as $row) {
        $pid = (int) $row->object_id;
        if (!isset($types[$pid])) {
            $types[$pid] = [];
        }
        $types[$pid][] = $row->slug;
    }

    return new WP_REST_Response(['success' => true, 'types' => $types], 200);
}
