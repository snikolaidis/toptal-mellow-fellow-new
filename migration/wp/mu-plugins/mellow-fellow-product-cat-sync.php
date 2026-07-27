<?php
/**
 * Plugin Name: Mellow Fellow - Product Category Sync
 * Description: Mirrors the custom "product-type" taxonomy into WooCommerce's
 *              native "product_cat" so that plugins relying on product_cat
 *              (coupon restrictions, BOGO rules, analytics) see the same
 *              category assignments. The product-type taxonomy remains the
 *              source of truth; product_cat is kept in lockstep automatically.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * When a product's "product-type" terms change, mirror them to product_cat.
 *
 * Fires on set_object_terms which covers wp_set_object_terms(),
 * wp_set_post_terms(), and bulk/quick-edit in WP Admin.
 */
add_action('set_object_terms', function ($object_id, $terms, $tt_ids, $taxonomy, $append, $old_tt_ids) {
    if ('product-type' !== $taxonomy) {
        return;
    }

    if ('product' !== get_post_type($object_id)) {
        return;
    }

    $product_type_terms = wp_get_object_terms($object_id, 'product-type', ['fields' => 'slugs']);
    if (is_wp_error($product_type_terms)) {
        return;
    }

    $cat_term_ids = [];
    foreach ($product_type_terms as $slug) {
        $cat_term_ids[] = mf_get_or_create_synced_cat($slug);
    }

    $cat_term_ids = array_filter($cat_term_ids);

    // Replace only the synced categories (those with our marker meta).
    // Preserve any manually-assigned product_cat terms.
    $existing_cats = wp_get_object_terms($object_id, 'product_cat', ['fields' => 'term_id']);
    if (is_wp_error($existing_cats)) {
        $existing_cats = [];
    }

    $manual_cats = array_filter($existing_cats, function ($term_id) {
        return !get_term_meta($term_id, '_mf_synced_from_product_type', true);
    });

    wp_set_object_terms($object_id, array_merge($manual_cats, $cat_term_ids), 'product_cat');
}, 10, 6);

/**
 * Get or create a product_cat term that mirrors a product-type slug.
 * Synced terms are tagged with _mf_synced_from_product_type meta so we
 * can distinguish them from manually-created categories.
 */
function mf_get_or_create_synced_cat($product_type_slug) {
    static $cache = [];

    if (isset($cache[$product_type_slug])) {
        return $cache[$product_type_slug];
    }

    // Look for an existing synced cat.
    global $wpdb;
    $term_id = $wpdb->get_var($wpdb->prepare(
        "SELECT tm.term_id FROM {$wpdb->termmeta} tm
         JOIN {$wpdb->term_taxonomy} tt ON tt.term_id = tm.term_id
         WHERE tm.meta_key = '_mf_synced_from_product_type'
           AND tm.meta_value = %s
           AND tt.taxonomy = 'product_cat'
         LIMIT 1",
        $product_type_slug
    ));

    if ($term_id) {
        $cache[$product_type_slug] = (int) $term_id;
        return (int) $term_id;
    }

    // Get the display name from the source taxonomy.
    $source_term = get_term_by('slug', $product_type_slug, 'product-type');
    $name = $source_term ? $source_term->name : ucwords(str_replace('-', ' ', $product_type_slug));

    $result = wp_insert_term($name, 'product_cat', ['slug' => $product_type_slug]);

    if (is_wp_error($result)) {
        // Term with this slug may already exist (created manually).
        $existing = get_term_by('slug', $product_type_slug, 'product_cat');
        if ($existing) {
            $term_id = $existing->term_id;
        } else {
            return 0;
        }
    } else {
        $term_id = $result['term_id'];
    }

    update_term_meta($term_id, '_mf_synced_from_product_type', $product_type_slug);
    $cache[$product_type_slug] = (int) $term_id;

    return (int) $term_id;
}

/**
 * WP-CLI command to backfill all existing products.
 * Usage: wp eval 'mf_backfill_product_cat_sync();'
 */
function mf_backfill_product_cat_sync() {
    $products = get_posts([
        'post_type'      => 'product',
        'post_status'    => 'publish',
        'posts_per_page' => -1,
        'fields'         => 'ids',
    ]);

    $count = 0;
    foreach ($products as $product_id) {
        $product_type_terms = wp_get_object_terms($product_id, 'product-type', ['fields' => 'slugs']);
        if (is_wp_error($product_type_terms) || empty($product_type_terms)) {
            continue;
        }

        $cat_term_ids = [];
        foreach ($product_type_terms as $slug) {
            $cat_term_ids[] = mf_get_or_create_synced_cat($slug);
        }
        $cat_term_ids = array_filter($cat_term_ids);

        if (!empty($cat_term_ids)) {
            $existing_cats = wp_get_object_terms($product_id, 'product_cat', ['fields' => 'term_id']);
            if (is_wp_error($existing_cats)) {
                $existing_cats = [];
            }
            $manual_cats = array_filter($existing_cats, function ($term_id) {
                return !get_term_meta($term_id, '_mf_synced_from_product_type', true);
            });
            wp_set_object_terms($product_id, array_merge($manual_cats, $cat_term_ids), 'product_cat');
            $count++;
        }
    }

    if (defined('WP_CLI') && WP_CLI) {
        WP_CLI::success("Synced product_cat for {$count} products.");
    }

    return $count;
}

/**
 * REST endpoint to trigger the backfill from the headless admin.
 * POST /mf/v1/product-cat-sync/backfill
 */
add_action('rest_api_init', function () {
    register_rest_route('mf/v1', '/product-cat-sync/backfill', [
        'methods'             => 'POST',
        'callback'            => function () {
            $count = mf_backfill_product_cat_sync();
            return new WP_REST_Response(['success' => true, 'synced' => $count], 200);
        },
        'permission_callback' => function () {
            return current_user_can('manage_woocommerce');
        },
    ]);
});
