<?php
/**
 * Plugin Name: Mellow Fellow - BOGO Collection Restrictions
 * Description: Extends WT Smart Coupon Pro's BOGO product validation to support
 *              the custom "collection" taxonomy. Reads collection slugs from
 *              coupon meta (_mf_bogo_collections) and resolves them to product
 *              IDs at validation time via the wbte_sc_alter_bogo_product_ids
 *              filter (available since WT SC Pro 3.4.0).
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Inject collection-based product IDs into the BOGO product restriction list.
 *
 * When a BOGO coupon has _mf_bogo_collections meta set (comma-separated
 * collection slugs), this filter resolves those collections to product IDs
 * and merges them with any explicitly-set product IDs from the plugin's UI.
 *
 * The result is cached in a transient (1 hour) keyed by the collection slugs,
 * and invalidated when products are added/removed from collections.
 */
add_filter('wbte_sc_alter_bogo_product_ids', function ($product_ids, $coupon_id) {
    $collections_raw = get_post_meta($coupon_id, '_mf_bogo_collections', true);
    if (empty($collections_raw)) {
        return $product_ids;
    }

    $slugs = array_map('trim', explode(',', $collections_raw));
    $slugs = array_filter($slugs);
    if (empty($slugs)) {
        return $product_ids;
    }

    $collection_product_ids = mf_get_products_in_collections($slugs);

    return array_unique(array_merge($product_ids, $collection_product_ids));
}, 10, 2);

/**
 * Same filter for excluded products — reads _mf_bogo_exclude_collections.
 */
add_filter('wbte_sc_alter_bogo_exclude_product_ids', function ($product_ids, $coupon_id) {
    $collections_raw = get_post_meta($coupon_id, '_mf_bogo_exclude_collections', true);
    if (empty($collections_raw)) {
        return $product_ids;
    }

    $slugs = array_map('trim', explode(',', $collections_raw));
    $slugs = array_filter($slugs);
    if (empty($slugs)) {
        return $product_ids;
    }

    $collection_product_ids = mf_get_products_in_collections($slugs);

    return array_unique(array_merge($product_ids, $collection_product_ids));
}, 10, 2);

/**
 * Query product IDs belonging to given collection slugs.
 * Results are cached in a transient for 1 hour.
 */
function mf_get_products_in_collections(array $slugs) {
    sort($slugs);
    $cache_key = 'mf_bogo_coll_' . md5(implode(',', $slugs));

    $cached = get_transient($cache_key);
    if (false !== $cached) {
        return $cached;
    }

    $term_ids = [];
    foreach ($slugs as $slug) {
        $term = get_term_by('slug', $slug, 'collection');
        if ($term && !is_wp_error($term)) {
            $term_ids[] = $term->term_id;
        }
    }

    if (empty($term_ids)) {
        set_transient($cache_key, [], HOUR_IN_SECONDS);
        return [];
    }

    global $wpdb;

    $placeholders = implode(',', array_fill(0, count($term_ids), '%d'));
    $product_ids = $wpdb->get_col($wpdb->prepare(
        "SELECT DISTINCT p.ID
         FROM {$wpdb->posts} p
         JOIN {$wpdb->term_relationships} tr ON tr.object_id = p.ID
         JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
         WHERE tt.term_id IN ($placeholders)
           AND tt.taxonomy = 'collection'
           AND p.post_type = 'product'
           AND p.post_status = 'publish'",
        ...$term_ids
    ));

    $product_ids = array_map('absint', $product_ids);
    set_transient($cache_key, $product_ids, HOUR_IN_SECONDS);

    return $product_ids;
}

/**
 * Invalidate collection caches when products are assigned to/removed from collections.
 */
add_action('set_object_terms', function ($object_id, $terms, $tt_ids, $taxonomy) {
    if ('collection' !== $taxonomy) {
        return;
    }
    if ('product' !== get_post_type($object_id)) {
        return;
    }

    // Delete all mf_bogo_coll_ transients.
    // WordPress doesn't support wildcard transient deletion, so we use the DB.
    global $wpdb;
    $wpdb->query(
        "DELETE FROM {$wpdb->options}
         WHERE option_name LIKE '_transient_mf_bogo_coll_%'
            OR option_name LIKE '_transient_timeout_mf_bogo_coll_%'"
    );
}, 10, 4);

/**
 * Add a meta box on the coupon edit screen for collection restrictions.
 */
add_action('add_meta_boxes', function () {
    add_meta_box(
        'mf_bogo_collections_box',
        'BOGO Collection Restrictions',
        'mf_bogo_collections_meta_box_html',
        'shop_coupon',
        'side',
        'default'
    );
});

function mf_bogo_collections_meta_box_html($post) {
    $collections = get_post_meta($post->ID, '_mf_bogo_collections', true);
    $exclude     = get_post_meta($post->ID, '_mf_bogo_exclude_collections', true);
    wp_nonce_field('mf_bogo_collections_save', '_mf_bogo_collections_nonce');
    ?>
    <p>
        <label for="mf_bogo_collections"><strong>Include collections</strong></label><br>
        <input type="text" id="mf_bogo_collections" name="_mf_bogo_collections"
               value="<?php echo esc_attr($collections); ?>" style="width:100%"
               placeholder="e.g. cannabogo, cannabogo-edibles">
        <span class="description">Comma-separated collection slugs. Products in these collections qualify for the BOGO deal.</span>
    </p>
    <p>
        <label for="mf_bogo_exclude_collections"><strong>Exclude collections</strong></label><br>
        <input type="text" id="mf_bogo_exclude_collections" name="_mf_bogo_exclude_collections"
               value="<?php echo esc_attr($exclude); ?>" style="width:100%"
               placeholder="e.g. cannabogo-edibles">
        <span class="description">Products in these collections are excluded from the BOGO deal.</span>
    </p>
    <?php
}

add_action('save_post_shop_coupon', function ($post_id) {
    if (!isset($_POST['_mf_bogo_collections_nonce']) ||
        !wp_verify_nonce($_POST['_mf_bogo_collections_nonce'], 'mf_bogo_collections_save')) {
        return;
    }

    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
        return;
    }

    if (!current_user_can('edit_post', $post_id)) {
        return;
    }

    $collections = isset($_POST['_mf_bogo_collections'])
        ? sanitize_text_field($_POST['_mf_bogo_collections'])
        : '';
    $exclude = isset($_POST['_mf_bogo_exclude_collections'])
        ? sanitize_text_field($_POST['_mf_bogo_exclude_collections'])
        : '';

    update_post_meta($post_id, '_mf_bogo_collections', $collections);
    update_post_meta($post_id, '_mf_bogo_exclude_collections', $exclude);
});
