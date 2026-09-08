<?php
/**
 * Plugin Name: Mellow Fellow - Coupon Collection Restrictions
 * Description: Adds "collection" taxonomy support to WooCommerce coupons.
 *              Standard coupons get collection fields on the Usage Restriction tab.
 *              BOGO coupons get collection fields on the Smart Coupon Pro Step 2 UI.
 * Version: 4.0.0
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

        <div id="mf_bogo_no_restrictions"
             style="background:#fcf0f0;border:1px solid #d63638;border-radius:4px;padding:12px 16px;margin-bottom:16px;<?php echo $has_any_restriction ? 'display:none;' : ''; ?>">
            <strong style="color:#d63638;">&#9888; No product restrictions set.</strong>
            This BOGO will apply to <em>any</em> products in the cart. Select collections below or set product/category restrictions above.
        </div>
        <div id="mf_bogo_unsaved" style="background:#fcf9e8;border:1px solid #dba617;border-radius:4px;padding:12px 16px;margin-bottom:16px;display:none;">
            <strong>Not saved yet.</strong> Save this BOGO to apply the collection restriction.
        </div>

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
        var $picker = $('#mf_bogo_collections');

        $picker.add('#mf_bogo_exclude_collections').select2({
            placeholder: 'Search collections...',
            allowClear: true,
            width: '100%'
        });

        // The red warning is rendered from what is stored, so without this it stays up
        // while a collection is sitting selected but unsaved, which reads as the pick
        // having failed. Reflect the current selection instead, and say plainly that it
        // still needs saving.
        var hadRestrictionOnLoad = <?php echo $has_any_restriction ? 'true' : 'false'; ?>;

        function syncNotices() {
            var chosen = ($picker.val() || []).length > 0;
            $('#mf_bogo_no_restrictions').toggle(!chosen && !hadRestrictionOnLoad);
            $('#mf_bogo_unsaved').toggle(chosen && !hadRestrictionOnLoad);
        }

        $picker.on('change', syncNotices);
        syncNotices();
    });
    </script>
    <?php
}, 20);

// ─── Admin: save collection meta from the BOGO form ─────────────────────────

// The BOGO screen does not post its form normally. Smart Coupons serialises the
// whole form into a single `data` parameter and runs parse_str() on it, then hands
// the result to this hook. So these fields are in $data and never in $_POST, and
// reading $_POST here wrote an empty string on every save, which is why a chosen
// collection never stuck and the "no product restrictions" warning kept showing.
add_action('wt_sc_before_bogo_coupon_save', function ($coupon_id, $data) {
    $read = function ($key) use ($data) {
        $value = $data[$key] ?? ($_POST[$key] ?? null);
        if (empty($value) || !is_array($value)) {
            return '';
        }
        return implode(',', array_map('sanitize_text_field', $value));
    };

    update_post_meta($coupon_id, '_mf_bogo_collections', $read('_mf_bogo_collections_arr'));
    update_post_meta($coupon_id, '_mf_bogo_exclude_collections', $read('_mf_bogo_exclude_collections_arr'));
}, 10, 2);

// ─── Standard Coupons: collection fields on Usage Restriction tab ──────────
//
// WooCommerce has product and category restrictions built in but knows nothing
// about the custom "collection" taxonomy. These hooks add qualifying/excluded
// collection selectors to the standard coupon editor and enforce them at
// discount-calculation time via woocommerce_coupon_is_valid_for_product.

add_action('woocommerce_coupon_options_usage_restriction', function ($coupon_id) {
    $collections = get_post_meta($coupon_id, '_mf_coupon_collections', true);
    $exclude     = get_post_meta($coupon_id, '_mf_coupon_exclude_collections', true);

    $selected_slugs = array_filter(array_map('trim', explode(',', $collections ?: '')));
    $excluded_slugs = array_filter(array_map('trim', explode(',', $exclude ?: '')));

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
    <div class="options_group" id="mf-collection-restrictions">
        <p class="form-field"><label><strong>Collection restrictions</strong></label></p>
        <p class="form-field">
            <label for="mf_coupon_collections">Qualifying collections</label>
            <select id="mf_coupon_collections" name="_mf_coupon_collections_arr[]"
                    multiple="multiple" class="wc-enhanced-select" style="width:50%;"
                    data-placeholder="Search collections&hellip;">
                <?php foreach ($all_collections as $term) : ?>
                    <option value="<?php echo esc_attr($term->slug); ?>"
                        <?php echo in_array($term->slug, $selected_slugs, true) ? 'selected' : ''; ?>>
                        <?php echo esc_html($term->name); ?> (<?php echo (int) $term->count; ?>)
                    </option>
                <?php endforeach; ?>
            </select>
            <?php echo wc_help_tip('Only products in these collections will receive this coupon\'s discount.'); ?>
        </p>
        <p class="form-field">
            <label for="mf_coupon_exclude_collections">Exclude collections</label>
            <select id="mf_coupon_exclude_collections" name="_mf_coupon_exclude_collections_arr[]"
                    multiple="multiple" class="wc-enhanced-select" style="width:50%;"
                    data-placeholder="Search collections&hellip;">
                <?php foreach ($all_collections as $term) : ?>
                    <option value="<?php echo esc_attr($term->slug); ?>"
                        <?php echo in_array($term->slug, $excluded_slugs, true) ? 'selected' : ''; ?>>
                        <?php echo esc_html($term->name); ?> (<?php echo (int) $term->count; ?>)
                    </option>
                <?php endforeach; ?>
            </select>
            <?php echo wc_help_tip('Products in these collections will not receive this coupon\'s discount, even if they match other restrictions.'); ?>
        </p>
    </div>
    <script>
    jQuery(function($) {
        var $section = $('#mf-collection-restrictions');
        if (!$section.length) return;
        var $target = $('#product_categories').closest('.options_group');
        if (!$target.length) {
            $target = $('#product_ids').closest('.options_group');
        }
        if ($target.length) {
            $target.after($section);
        }
    });
    </script>
    <?php
}, 10, 1);

add_action('woocommerce_coupon_options_save', function ($post_id) {
    $collections = '';
    if (!empty($_POST['_mf_coupon_collections_arr']) && is_array($_POST['_mf_coupon_collections_arr'])) {
        $collections = implode(',', array_map('sanitize_text_field', $_POST['_mf_coupon_collections_arr']));
    }
    $exclude = '';
    if (!empty($_POST['_mf_coupon_exclude_collections_arr']) && is_array($_POST['_mf_coupon_exclude_collections_arr'])) {
        $exclude = implode(',', array_map('sanitize_text_field', $_POST['_mf_coupon_exclude_collections_arr']));
    }
    update_post_meta($post_id, '_mf_coupon_collections', $collections);
    update_post_meta($post_id, '_mf_coupon_exclude_collections', $exclude);
}, 10, 1);

add_filter('woocommerce_coupon_is_valid_for_product', function ($valid, $product, $coupon, $values) {
    if (!$valid) {
        return false;
    }

    $coupon_id   = $coupon->get_id();
    $include_raw = get_post_meta($coupon_id, '_mf_coupon_collections', true);
    $exclude_raw = get_post_meta($coupon_id, '_mf_coupon_exclude_collections', true);

    $include_slugs = !empty($include_raw) ? array_filter(array_map('trim', explode(',', $include_raw))) : [];
    $exclude_slugs = !empty($exclude_raw) ? array_filter(array_map('trim', explode(',', $exclude_raw))) : [];

    if (empty($include_slugs) && empty($exclude_slugs)) {
        return $valid;
    }

    $product_id = $product->get_id();
    $parent_id  = $product->get_parent_id();

    $exclude_ids = !empty($exclude_slugs) ? mf_get_products_in_collections($exclude_slugs) : [];
    if (!empty($exclude_ids)) {
        if (in_array($product_id, $exclude_ids) || ($parent_id && in_array($parent_id, $exclude_ids))) {
            return false;
        }
    }

    $include_ids = !empty($include_slugs) ? mf_get_products_in_collections($include_slugs) : [];
    if (!empty($include_ids)) {
        return in_array($product_id, $include_ids) || ($parent_id && in_array($parent_id, $include_ids));
    }

    return $valid;
}, 10, 4);

// ─── Runtime: enforce collection restrictions for fixed_cart coupons ───────
//
// woocommerce_coupon_is_valid_for_product only fires for per-product discount
// types (fixed_product, percent). fixed_cart coupons bypass it entirely because
// WooCommerce applies them at the cart level. This filter enforces collection
// restrictions at the cart level so fixed_cart coupons respect them too.

add_filter('woocommerce_coupon_is_valid', function ($valid, $coupon, $discounts) {
    if (!$valid) {
        return false;
    }

    if ('fixed_cart' !== $coupon->get_discount_type()) {
        return $valid;
    }

    $coupon_id   = $coupon->get_id();
    $include_raw = get_post_meta($coupon_id, '_mf_coupon_collections', true);
    $exclude_raw = get_post_meta($coupon_id, '_mf_coupon_exclude_collections', true);

    $include_slugs = !empty($include_raw) ? array_filter(array_map('trim', explode(',', $include_raw))) : [];
    $exclude_slugs = !empty($exclude_raw) ? array_filter(array_map('trim', explode(',', $exclude_raw))) : [];

    if (empty($include_slugs) && empty($exclude_slugs)) {
        return $valid;
    }

    $cart = WC()->cart;
    if (!$cart) {
        return $valid;
    }

    $exclude_ids = !empty($exclude_slugs) ? mf_get_products_in_collections($exclude_slugs) : [];
    $include_ids = !empty($include_slugs) ? mf_get_products_in_collections($include_slugs) : [];

    foreach ($cart->get_cart() as $cart_item) {
        $product_id = $cart_item['product_id'];
        if (!empty($exclude_ids) && in_array($product_id, $exclude_ids)) {
            throw new Exception(__('This coupon is not valid for items in your cart.', 'mellow-fellow'));
        }
    }

    if (!empty($include_ids)) {
        $has_qualifying = false;
        foreach ($cart->get_cart() as $cart_item) {
            if (in_array($cart_item['product_id'], $include_ids)) {
                $has_qualifying = true;
                break;
            }
        }
        if (!$has_qualifying) {
            throw new Exception(__('This coupon requires qualifying products in your cart.', 'mellow-fellow'));
        }
    }

    return $valid;
}, 10, 3);

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
