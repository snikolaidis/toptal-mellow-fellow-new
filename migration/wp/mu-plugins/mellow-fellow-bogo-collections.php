<?php
/**
 * Plugin Name: Mellow Fellow - BOGO Collection Restrictions
 * Description: Extends WT Smart Coupon Pro's BOGO product validation to support
 *              the custom "collection" taxonomy. Injects collection picker into
 *              the BOGO Step 2 (Trigger) admin UI and resolves collection slugs
 *              to product IDs at validation time.
 * Version: 3.1.0
 */

if (!defined('ABSPATH')) {
    exit;
}

// ─── Runtime: filter cart items by collection before BOGO validation ────────
//
// The plugin's wbte_sc_alter_bogo_product_ids filter only fires when the
// native wbte_sc_bogo_product_ids meta is non-empty. Since we store
// collection restrictions in our own meta (_mf_bogo_collections), the filter
// never fires and the restriction is bypassed. Instead we use
// wbte_sc_alter_items_to_validate which runs for every BOGO calculation
// and lets us remove non-qualifying items from the cart before the plugin
// decides which items to discount.

add_filter('wbte_sc_alter_items_to_validate', function ($items, $coupon_id) {
    $include_raw = get_post_meta($coupon_id, '_mf_bogo_collections', true);
    $exclude_raw = get_post_meta($coupon_id, '_mf_bogo_exclude_collections', true);

    $include_slugs = !empty($include_raw) ? array_filter(array_map('trim', explode(',', $include_raw))) : [];
    $exclude_slugs = !empty($exclude_raw) ? array_filter(array_map('trim', explode(',', $exclude_raw))) : [];

    if (empty($include_slugs) && empty($exclude_slugs)) {
        return $items;
    }

    $include_ids = !empty($include_slugs) ? mf_get_products_in_collections($include_slugs) : [];
    $exclude_ids = !empty($exclude_slugs) ? mf_get_products_in_collections($exclude_slugs) : [];

    return array_filter($items, function ($item) use ($include_ids, $exclude_ids) {
        $product_id = $item['product_id'];
        $parent_id = isset($item['variation_id']) && $item['variation_id'] > 0
            ? $item['product_id']
            : 0;

        if (!empty($exclude_ids)) {
            if (in_array($product_id, $exclude_ids) || ($parent_id && in_array($parent_id, $exclude_ids))) {
                return false;
            }
        }

        if (!empty($include_ids)) {
            return in_array($product_id, $include_ids) || ($parent_id && in_array($parent_id, $include_ids));
        }

        return true;
    });
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
    if ('collection' !== $taxonomy || 'product' !== get_post_type($object_id)) {
        return;
    }
    global $wpdb;
    $wpdb->query(
        "DELETE FROM {$wpdb->options}
         WHERE option_name LIKE '_transient_mf_bogo_coll_%'
            OR option_name LIKE '_transient_timeout_mf_bogo_coll_%'"
    );
}, 10, 4);

// ─── Admin: inject collection fields into BOGO Step 2 (Trigger) ─────────────

add_action('wbte_sc_bogo_edit_step2_content', function ($coupon_id) {
    $collections = get_post_meta($coupon_id, '_mf_bogo_collections', true);
    $exclude     = get_post_meta($coupon_id, '_mf_bogo_exclude_collections', true);

    $selected_slugs = array_filter(array_map('trim', explode(',', $collections ?: '')));
    $excluded_slugs = array_filter(array_map('trim', explode(',', $exclude ?: '')));

    $has_native_products   = !empty(get_post_meta($coupon_id, 'wbte_sc_bogo_product_ids', true));
    $has_native_categories = !empty(get_post_meta($coupon_id, 'wbte_sc_bogo_product_categories', true));
    $has_collections       = !empty($selected_slugs);
    $has_any_restriction   = $has_native_products || $has_native_categories || $has_collections;

    $all_collections = get_terms([
        'taxonomy'   => 'collection',
        'hide_empty' => true,
        'orderby'    => 'name',
        'number'     => 300,
    ]);
    if (is_wp_error($all_collections)) {
        $all_collections = [];
    }
    ?>
    <div class="wbte_sc_bogo_edit_step_content" style="padding:20px;border-top:1px solid #e2e4e7;">

        <?php if (!$has_any_restriction) : ?>
        <div style="background:#fcf0f0;border:1px solid #d63638;border-radius:4px;padding:12px 16px;margin-bottom:16px;">
            <strong style="color:#d63638;">&#9888; No product restrictions set.</strong>
            This BOGO will apply to <em>any</em> products in the cart. Select collections below or set product/category restrictions above.
        </div>
        <?php endif; ?>

        <h4 style="margin:0 0 12px;font-size:14px;font-weight:600;">Collection Restrictions</h4>

        <table style="width:100%;border-collapse:collapse;">
            <tr>
                <td style="padding:8px 12px 8px 0;width:180px;vertical-align:top;">
                    <label for="mf_bogo_collections" style="font-weight:500;">Qualifying collections</label>
                </td>
                <td style="padding:8px 0;">
                    <select id="mf_bogo_collections" name="_mf_bogo_collections_arr[]"
                            multiple="multiple" style="width:100%;min-width:300px;">
                        <?php foreach ($all_collections as $term) : ?>
                            <option value="<?php echo esc_attr($term->slug); ?>"
                                <?php echo in_array($term->slug, $selected_slugs, true) ? 'selected' : ''; ?>>
                                <?php echo esc_html($term->name); ?> (<?php echo (int) $term->count; ?>)
                            </option>
                        <?php endforeach; ?>
                    </select>
                    <p style="color:#757575;font-size:12px;margin:4px 0 0;">Only products in these collections can trigger and receive this BOGO deal.</p>
                </td>
            </tr>
            <tr>
                <td style="padding:8px 12px 8px 0;vertical-align:top;">
                    <label for="mf_bogo_exclude_collections" style="font-weight:500;">Excluded collections</label>
                </td>
                <td style="padding:8px 0;">
                    <select id="mf_bogo_exclude_collections" name="_mf_bogo_exclude_collections_arr[]"
                            multiple="multiple" style="width:100%;min-width:300px;">
                        <?php foreach ($all_collections as $term) : ?>
                            <option value="<?php echo esc_attr($term->slug); ?>"
                                <?php echo in_array($term->slug, $excluded_slugs, true) ? 'selected' : ''; ?>>
                                <?php echo esc_html($term->name); ?> (<?php echo (int) $term->count; ?>)
                            </option>
                        <?php endforeach; ?>
                    </select>
                    <p style="color:#757575;font-size:12px;margin:4px 0 0;">Products in these collections are blocked from this deal, even if they match above.</p>
                </td>
            </tr>
        </table>

        <?php if ($has_collections) : ?>
        <div style="background:#f0f6fc;border:1px solid #72aee6;border-radius:4px;padding:10px 14px;margin-top:12px;">
            <strong>Active:</strong>
            <?php echo esc_html(implode(', ', $selected_slugs)); ?>
            <?php
            $total_products = count(mf_get_products_in_collections($selected_slugs));
            ?>
            &mdash; <?php echo (int) $total_products; ?> products qualify
        </div>
        <?php endif; ?>
    </div>

    <script>
    jQuery(function($) {
        $('#mf_bogo_collections, #mf_bogo_exclude_collections').select2({
            placeholder: 'Search collections...',
            allowClear: true,
            width: '100%'
        });
    });
    </script>
    <?php
}, 20);

// ─── Admin: save collection meta from the BOGO form ─────────────────────────

add_action('wt_sc_before_bogo_coupon_save', function ($coupon_id, $data) {
    $collections = '';
    if (!empty($_POST['_mf_bogo_collections_arr']) && is_array($_POST['_mf_bogo_collections_arr'])) {
        $collections = implode(',', array_map('sanitize_text_field', $_POST['_mf_bogo_collections_arr']));
    }

    $exclude = '';
    if (!empty($_POST['_mf_bogo_exclude_collections_arr']) && is_array($_POST['_mf_bogo_exclude_collections_arr'])) {
        $exclude = implode(',', array_map('sanitize_text_field', $_POST['_mf_bogo_exclude_collections_arr']));
    }

    update_post_meta($coupon_id, '_mf_bogo_collections', $collections);
    update_post_meta($coupon_id, '_mf_bogo_exclude_collections', $exclude);
}, 10, 2);

// ─── Runtime fix: force BOGO recalculation on cart changes ──────────────────
//
// WT Smart Coupon Pro caches BOGO discount calculations in static properties
// (bogo_cheap_exp_coupon_data, bogo_cheap_exp_checked_products, bogo_discounts)
// during woocommerce_coupon_get_discount_amount. These persist for the entire
// PHP request, so when calculate_totals() runs again after a cart mutation
// (item added, removed, or quantity changed), the plugin sees the stale cache
// and skips recalculation — returning wrong discount amounts.
//
// Clearing these static caches before each calculate_totals() call forces the
// plugin to recalculate from the current cart state every time.

add_action('woocommerce_before_calculate_totals', 'mf_clear_bogo_static_cache', 1);

function mf_clear_bogo_static_cache($cart) {
    if (!class_exists('Wbte_Smart_Coupon_Bogo_Public')) {
        return;
    }

    $has_bogo = false;
    foreach ($cart->get_applied_coupons() as $code) {
        $coupon = new WC_Coupon($code);
        if ('wbte_sc_bogo' === $coupon->get_discount_type()) {
            $has_bogo = true;
            break;
        }
    }
    if (!$has_bogo) {
        return;
    }

    Wbte_Smart_Coupon_Bogo_Public::$bogo_cheap_exp_checked_products = [];
    Wbte_Smart_Coupon_Bogo_Public::$bogo_cheap_exp_coupon_data = [];
    Wbte_Smart_Coupon_Bogo_Public::$bogo_discounts = [];
}

// ─── Runtime fix: correct discount total for Store API ──────────────────────
//
// When the "apply tax on discounted price" setting is disabled, the plugin
// bypasses WC's standard coupon discount tracking and directly modifies the
// cart total via discounted_calculated_total_cheap_exp at priority 999. The
// Store API reads discount_total which then shows $0. We correct it at
// priority 1000 by reading from the plugin's $bogo_discounts static property.
//
// When "apply tax on discounted price" IS enabled (current production config),
// the plugin returns the actual discount via woocommerce_coupon_get_discount_amount
// and WC tracks it normally — this hook returns early and does nothing.

add_action('woocommerce_after_calculate_totals', 'mf_fix_bogo_discount_total', 1000);

function mf_fix_bogo_discount_total($cart) {
    if (!class_exists('Wbte_Smart_Coupon_Bogo_Common')) {
        return;
    }
    if (Wbte_Smart_Coupon_Bogo_Common::is_apply_tax_on_discounted_price()) {
        return;
    }
    if (!class_exists('Wbte_Smart_Coupon_Bogo_Public')) {
        return;
    }
    if (empty(Wbte_Smart_Coupon_Bogo_Public::$bogo_discounts)) {
        return;
    }

    $total_bogo_discount = array_sum(Wbte_Smart_Coupon_Bogo_Public::$bogo_discounts);
    if ($total_bogo_discount <= 0) {
        return;
    }

    $cart->set_discount_total($cart->get_discount_total() + $total_bogo_discount);

    $coupon_totals = $cart->get_coupon_discount_totals();
    foreach (Wbte_Smart_Coupon_Bogo_Public::$bogo_discounts as $code => $amount) {
        $code = wc_format_coupon_code($code);
        $coupon_totals[$code] = ($coupon_totals[$code] ?? 0) + $amount;
    }
    $cart->set_coupon_discount_totals($coupon_totals);
}
