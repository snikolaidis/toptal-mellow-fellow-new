<?php
/**
 * Plugin Name: Mellow Fellow - BOGO Collection Restrictions
 * Description: Extends WT Smart Coupon Pro's BOGO product validation to support
 *              the custom "collection" taxonomy. Reads collection slugs from
 *              coupon meta (_mf_bogo_collections) and resolves them to product
 *              IDs at validation time via the wbte_sc_alter_bogo_product_ids
 *              filter (available since WT SC Pro 3.4.0).
 * Version: 1.1.0
 */

if (!defined('ABSPATH')) {
    exit;
}

// ─── Runtime: resolve collections to product IDs during BOGO validation ─────

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

add_action('set_object_terms', function ($object_id, $terms, $tt_ids, $taxonomy) {
    if ('collection' !== $taxonomy) {
        return;
    }
    if ('product' !== get_post_type($object_id)) {
        return;
    }

    global $wpdb;
    $wpdb->query(
        "DELETE FROM {$wpdb->options}
         WHERE option_name LIKE '_transient_mf_bogo_coll_%'
            OR option_name LIKE '_transient_timeout_mf_bogo_coll_%'"
    );
}, 10, 4);

// ─── Admin: collection fields + warning banner on coupon edit screen ─────────

add_action('add_meta_boxes', function () {
    add_meta_box(
        'mf_bogo_collections_box',
        'Collection Restrictions (BOGO)',
        'mf_bogo_collections_meta_box_html',
        'shop_coupon',
        'normal',
        'high'
    );
});

function mf_bogo_collections_meta_box_html($post) {
    $discount_type = get_post_meta($post->ID, 'discount_type', true);
    if ('wbte_sc_bogo' !== $discount_type) {
        echo '<p style="color:#666;">This section only applies to BOGO coupons. Change the discount type to BOGO to use collection restrictions.</p>';
        return;
    }

    $collections = get_post_meta($post->ID, '_mf_bogo_collections', true);
    $exclude     = get_post_meta($post->ID, '_mf_bogo_exclude_collections', true);

    $has_native_products   = !empty(get_post_meta($post->ID, 'wbte_sc_bogo_product_ids', true));
    $has_native_categories = !empty(get_post_meta($post->ID, 'wbte_sc_bogo_product_categories', true));
    $has_collections       = !empty($collections);
    $has_any_restriction   = $has_native_products || $has_native_categories || $has_collections;

    wp_nonce_field('mf_bogo_collections_save', '_mf_bogo_collections_nonce');

    if (!$has_any_restriction && 'publish' === $post->post_status) {
        ?>
        <div style="background:#fcf0f0;border:1px solid #d63638;border-radius:4px;padding:12px 16px;margin-bottom:16px;">
            <strong style="color:#d63638;">Warning: This BOGO coupon has no product restrictions.</strong><br>
            It will apply to <em>any</em> products in the cart. Set collection restrictions below, or configure product/category restrictions in the BOGO settings above.
        </div>
        <?php
    }

    $all_collections = get_terms([
        'taxonomy'   => 'collection',
        'hide_empty' => true,
        'orderby'    => 'name',
        'number'     => 200,
    ]);
    $collection_options = [];
    if (!is_wp_error($all_collections)) {
        foreach ($all_collections as $term) {
            $collection_options[] = $term;
        }
    }

    $selected_slugs  = array_filter(array_map('trim', explode(',', $collections)));
    $excluded_slugs  = array_filter(array_map('trim', explode(',', $exclude)));
    ?>
    <table class="form-table" style="margin:0;">
        <tr>
            <th scope="row" style="padding:10px 10px 10px 0;width:180px;">
                <label for="mf_bogo_collections"><strong>Include collections</strong></label>
            </th>
            <td style="padding:10px 0;">
                <select id="mf_bogo_collections" name="_mf_bogo_collections_select[]"
                        multiple="multiple" style="width:100%;min-width:300px;"
                        class="wc-enhanced-select"
                        data-placeholder="Select collections...">
                    <?php foreach ($collection_options as $term) : ?>
                        <option value="<?php echo esc_attr($term->slug); ?>"
                            <?php echo in_array($term->slug, $selected_slugs, true) ? 'selected' : ''; ?>>
                            <?php echo esc_html($term->name); ?> (<?php echo esc_html($term->count); ?> products)
                        </option>
                    <?php endforeach; ?>
                </select>
                <p class="description">Only products in these collections qualify for the BOGO deal.</p>
                <input type="hidden" name="_mf_bogo_collections" id="mf_bogo_collections_hidden"
                       value="<?php echo esc_attr($collections); ?>">
            </td>
        </tr>
        <tr>
            <th scope="row" style="padding:10px 10px 10px 0;">
                <label for="mf_bogo_exclude_collections"><strong>Exclude collections</strong></label>
            </th>
            <td style="padding:10px 0;">
                <select id="mf_bogo_exclude_collections" name="_mf_bogo_exclude_collections_select[]"
                        multiple="multiple" style="width:100%;min-width:300px;"
                        class="wc-enhanced-select"
                        data-placeholder="Select collections to exclude...">
                    <?php foreach ($collection_options as $term) : ?>
                        <option value="<?php echo esc_attr($term->slug); ?>"
                            <?php echo in_array($term->slug, $excluded_slugs, true) ? 'selected' : ''; ?>>
                            <?php echo esc_html($term->name); ?> (<?php echo esc_html($term->count); ?> products)
                        </option>
                    <?php endforeach; ?>
                </select>
                <p class="description">Products in these collections are excluded even if they match the include list.</p>
                <input type="hidden" name="_mf_bogo_exclude_collections" id="mf_bogo_exclude_collections_hidden"
                       value="<?php echo esc_attr($exclude); ?>">
            </td>
        </tr>
    </table>

    <?php if ($has_collections) : ?>
        <div style="background:#f0f6fc;border:1px solid #72aee6;border-radius:4px;padding:10px 14px;margin-top:12px;">
            <strong>Active restriction:</strong>
            <?php echo esc_html(implode(', ', $selected_slugs)); ?>
            <?php
            $total = 0;
            foreach ($selected_slugs as $s) {
                $ids = mf_get_products_in_collections([$s]);
                $total += count($ids);
            }
            ?>
            (<?php echo esc_html($total); ?> products qualify)
        </div>
    <?php endif; ?>

    <script>
    jQuery(function($) {
        function syncHidden(selectId, hiddenId) {
            var vals = $(selectId).val() || [];
            $(hiddenId).val(vals.join(','));
        }
        $('#mf_bogo_collections').on('change', function() {
            syncHidden('#mf_bogo_collections', '#mf_bogo_collections_hidden');
        });
        $('#mf_bogo_exclude_collections').on('change', function() {
            syncHidden('#mf_bogo_exclude_collections', '#mf_bogo_exclude_collections_hidden');
        });
        // Sync on form submit
        $('form#post').on('submit', function() {
            syncHidden('#mf_bogo_collections', '#mf_bogo_collections_hidden');
            syncHidden('#mf_bogo_exclude_collections', '#mf_bogo_exclude_collections_hidden');
        });
    });
    </script>
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
