<?php
/**
 * Plugin Name: Mellow Fellow - BOGO Collection Restrictions
 * Description: Extends WT Smart Coupon Pro's BOGO product validation to support
 *              the custom "collection" taxonomy. Injects collection picker into
 *              the BOGO Step 2 (Trigger) admin UI and resolves collection slugs
 *              to product IDs at validation time.
 * Version: 2.1.0
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

    $slugs = array_filter(array_map('trim', explode(',', $collections_raw)));
    if (empty($slugs)) {
        return $product_ids;
    }

    return array_unique(array_merge($product_ids, mf_get_products_in_collections($slugs)));
}, 10, 2);

add_filter('wbte_sc_alter_bogo_exclude_product_ids', function ($product_ids, $coupon_id) {
    $collections_raw = get_post_meta($coupon_id, '_mf_bogo_exclude_collections', true);
    if (empty($collections_raw)) {
        return $product_ids;
    }

    $slugs = array_filter(array_map('trim', explode(',', $collections_raw)));
    if (empty($slugs)) {
        return $product_ids;
    }

    return array_unique(array_merge($product_ids, mf_get_products_in_collections($slugs)));
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
                    <label for="mf_bogo_collections" style="font-weight:500;">Include collections</label>
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
                    <p style="color:#757575;font-size:12px;margin:4px 0 0;">Only products in these collections qualify for the BOGO deal.</p>
                </td>
            </tr>
            <tr>
                <td style="padding:8px 12px 8px 0;vertical-align:top;">
                    <label for="mf_bogo_exclude_collections" style="font-weight:500;">Exclude collections</label>
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
                    <p style="color:#757575;font-size:12px;margin:4px 0 0;">Products in these collections are excluded even if they match above.</p>
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
// WT Smart Coupon Pro's adjust_same_in_cart_giveaway_count bails out when
// called from woocommerce_cart_item_removed because the removed item's key
// can't be looked up. This leaves stale free-item quantities. We fix it by
// removing and re-applying each BOGO coupon after the plugin's own hooks
// have run, which triggers the full add_free_product_into_cart flow.

add_action('woocommerce_cart_item_removed', 'mf_force_bogo_recalc', 200, 2);
add_action('woocommerce_after_cart_item_quantity_update', 'mf_force_bogo_recalc_on_update', 200, 4);

function mf_force_bogo_recalc($cart_item_key, $cart) {
    if (!empty($GLOBALS['_mf_bogo_recalc_running'])) {
        return;
    }
    $GLOBALS['_mf_bogo_recalc_running'] = true;

    mf_reapply_bogo_coupons($cart);

    unset($GLOBALS['_mf_bogo_recalc_running']);
}

function mf_force_bogo_recalc_on_update($cart_item_key, $quantity, $old_quantity, $cart) {
    if (!empty($GLOBALS['_mf_bogo_recalc_running'])) {
        return;
    }
    if ($quantity === $old_quantity) {
        return;
    }
    if (!$cart || !is_object($cart)) {
        $cart = WC()->cart;
    }
    $item = isset($cart->cart_contents[$cart_item_key]) ? $cart->cart_contents[$cart_item_key] : null;
    if ($item && !empty($item['wbte_sc_free_gift_coupon'])) {
        return;
    }
    $GLOBALS['_mf_bogo_recalc_running'] = true;

    mf_reapply_bogo_coupons($cart);

    unset($GLOBALS['_mf_bogo_recalc_running']);
}

function mf_reapply_bogo_coupons($cart) {
    if (!$cart || !is_object($cart)) {
        $cart = WC()->cart;
    }
    if (!$cart) {
        return;
    }

    $bogo_codes = [];
    foreach ($cart->get_applied_coupons() as $code) {
        $coupon = new WC_Coupon($code);
        if ('wbte_sc_bogo' === $coupon->get_discount_type()) {
            $bogo_codes[] = $code;
        }
    }

    if (empty($bogo_codes)) {
        return;
    }

    // Collect free item keys first to avoid modifying cart during iteration
    $free_keys = [];
    foreach ($cart->get_cart() as $key => $item) {
        if (!empty($item['wbte_sc_free_gift_coupon'])) {
            $free_keys[] = $key;
        }
    }
    foreach ($free_keys as $key) {
        $cart->remove_cart_item($key);
    }

    // Clear BOGO sessions
    if (!is_null(WC()->session)) {
        WC()->session->set('wbte_sc_bogo_eligible', []);
        WC()->session->set('wbte_sc_cheap_exp_checked_products', []);
    }

    // Re-apply each BOGO coupon to trigger full recalculation
    foreach ($bogo_codes as $code) {
        $cart->remove_coupon($code);
        $cart->apply_coupon($code);
    }
}

// ─── Runtime fix: correct discount total for Store API ──────────────────────
//
// The BOGO plugin applies free-item discounts by directly modifying the cart
// total (discounted_calculated_total at priority 999) instead of using WC's
// standard coupon discount tracking. The Store API reads discount_total which
// misses the BOGO discount. We correct it at priority 1000 (after the plugin)
// by adding the BOGO free-item value to both the overall and per-coupon
// discount totals. This doesn't affect the actual total (already correct).

add_action('woocommerce_after_calculate_totals', 'mf_fix_bogo_discount_total', 1000);

function mf_fix_bogo_discount_total($cart) {
    $bogo_by_coupon = [];

    foreach ($cart->get_cart() as $item) {
        if (empty($item['wbte_sc_free_gift_coupon'])) {
            continue;
        }

        $coupon_code = wc_format_coupon_code($item['wbte_sc_free_gift_coupon']);
        $item_id = $item['variation_id'] > 0 ? $item['variation_id'] : $item['product_id'];
        $product = wc_get_product($item_id);
        if (!$product) {
            continue;
        }

        $discount_per = isset($item['wbte_sc_bogo_discount'])
            ? (float) $item['wbte_sc_bogo_discount']
            : (float) $product->get_price();

        if ($discount_per <= 0) {
            continue;
        }

        if (!isset($bogo_by_coupon[$coupon_code])) {
            $bogo_by_coupon[$coupon_code] = 0;
        }
        $bogo_by_coupon[$coupon_code] += $discount_per * $item['quantity'];
    }

    if (empty($bogo_by_coupon)) {
        return;
    }

    $total_bogo_discount = array_sum($bogo_by_coupon);
    $cart->set_discount_total($cart->get_discount_total() + $total_bogo_discount);

    $coupon_totals = $cart->get_coupon_discount_totals();
    foreach ($bogo_by_coupon as $code => $amount) {
        $coupon_totals[$code] = ($coupon_totals[$code] ?? 0) + $amount;
    }
    $cart->set_coupon_discount_totals($coupon_totals);
}
