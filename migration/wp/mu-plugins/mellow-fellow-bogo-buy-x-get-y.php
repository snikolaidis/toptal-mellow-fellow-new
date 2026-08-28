<?php
/**
 * Plugin Name: Mellow Fellow - BOGO Buy X Get Y
 * Description: Adds configurable Buy X Get Y quantities to WT Smart Coupon Pro BOGO coupons.
 *              Admin can set how many qualifying items (X) are needed and how many
 *              free/discounted items (Y) the customer receives.
 * Version: 1.0.0
 *
 * DISABLED: WT Smart Coupon Pro already handles Buy X / Get Y quantities natively.
 *           Uncomment the code below if the specific "Get" products or quantity
 *           overrides are needed.
 */

if (!defined('ABSPATH')) {
    exit;
}

/*
// ─── Admin: inject Buy X / Get Y fields into BOGO Step 2 ────────────────────

add_action('wbte_sc_bogo_edit_step2_content', function ($coupon_id) {
    $buy_qty      = (int) get_post_meta($coupon_id, '_mf_bogo_buy_qty', true) ?: 1;
    $get_qty      = (int) get_post_meta($coupon_id, '_mf_bogo_get_qty', true) ?: 1;
    $get_products = get_post_meta($coupon_id, '_mf_bogo_get_product_ids', true);
    $get_ids      = !empty($get_products) ? array_filter(array_map('absint', explode(',', $get_products))) : [];
    ?>
    <div class="wbte_sc_bogo_edit_step_content" style="padding:20px;border-top:1px solid #e2e4e7;">
        <h4 style="margin:0 0 12px;font-size:14px;font-weight:600;">Buy X Get Y Configuration</h4>
        <table style="width:100%;border-collapse:collapse;">
            <tr>
                <td style="padding:8px 12px 8px 0;width:180px;vertical-align:top;">
                    <label for="mf_bogo_buy_qty" style="font-weight:500;">Buy quantity (X)</label>
                </td>
                <td style="padding:8px 0;">
                    <input type="number" id="mf_bogo_buy_qty" name="_mf_bogo_buy_qty"
                           value="<?php echo esc_attr($buy_qty); ?>" min="1" max="100"
                           style="width:80px;" />
                    <p style="color:#757575;font-size:12px;margin:4px 0 0;">
                        Customer must have at least this many qualifying items in the cart to trigger the deal.
                    </p>
                </td>
            </tr>
            <tr>
                <td style="padding:8px 12px 8px 0;vertical-align:top;">
                    <label for="mf_bogo_get_qty" style="font-weight:500;">Get quantity (Y)</label>
                </td>
                <td style="padding:8px 0;">
                    <input type="number" id="mf_bogo_get_qty" name="_mf_bogo_get_qty"
                           value="<?php echo esc_attr($get_qty); ?>" min="1" max="100"
                           style="width:80px;" />
                    <p style="color:#757575;font-size:12px;margin:4px 0 0;">
                        Number of items that receive the BOGO discount. These are the cheapest qualifying items.
                    </p>
                </td>
            </tr>
            <tr>
                <td style="padding:8px 12px 8px 0;vertical-align:top;">
                    <label for="mf_bogo_get_product_ids" style="font-weight:500;">Specific "Get" products</label>
                </td>
                <td style="padding:8px 0;">
                    <select id="mf_bogo_get_product_ids" name="_mf_bogo_get_product_ids_arr[]"
                            multiple="multiple" class="wc-product-search" style="width:100%;min-width:300px;"
                            data-placeholder="Search for products&hellip;" data-action="woocommerce_json_search_products">
                        <?php foreach ($get_ids as $pid) :
                            $p = wc_get_product($pid);
                            if (!$p) continue;
                        ?>
                            <option value="<?php echo esc_attr($pid); ?>" selected>
                                <?php echo esc_html($p->get_name()); ?> (#<?php echo $pid; ?>)
                            </option>
                        <?php endforeach; ?>
                    </select>
                    <p style="color:#757575;font-size:12px;margin:4px 0 0;">
                        Optional. If set, only these products can be the discounted "Get" items.
                        Leave empty to discount the cheapest qualifying items in the cart.
                    </p>
                </td>
            </tr>
        </table>
    </div>
    <script>
    jQuery(function($) {
        $('#mf_bogo_get_product_ids').selectWoo({
            placeholder: 'Search for products...',
            allowClear: true,
            width: '100%',
            ajax: {
                url: ajaxurl,
                dataType: 'json',
                delay: 250,
                data: function(params) {
                    return { term: params.term, action: 'woocommerce_json_search_products', security: woocommerce_admin_meta_boxes.search_products_nonce };
                },
                processResults: function(data) {
                    var results = [];
                    $.each(data, function(id, text) { results.push({ id: id, text: text }); });
                    return { results: results };
                },
                cache: true
            }
        });
    });
    </script>
    <?php
}, 15);

// ─── Admin: save Buy X / Get Y meta ─────────────────────────────────────────

add_action('wt_sc_before_bogo_coupon_save', function ($coupon_id, $data) {
    $buy_qty = isset($_POST['_mf_bogo_buy_qty']) ? max(1, (int) $_POST['_mf_bogo_buy_qty']) : 1;
    $get_qty = isset($_POST['_mf_bogo_get_qty']) ? max(1, (int) $_POST['_mf_bogo_get_qty']) : 1;

    update_post_meta($coupon_id, '_mf_bogo_buy_qty', $buy_qty);
    update_post_meta($coupon_id, '_mf_bogo_get_qty', $get_qty);

    $get_ids = '';
    if (!empty($_POST['_mf_bogo_get_product_ids_arr']) && is_array($_POST['_mf_bogo_get_product_ids_arr'])) {
        $get_ids = implode(',', array_map('absint', $_POST['_mf_bogo_get_product_ids_arr']));
    }
    update_post_meta($coupon_id, '_mf_bogo_get_product_ids', $get_ids);
}, 10, 2);

// ─── Runtime: enforce Buy X quantity threshold ───────────────────────────────

add_filter('wbte_sc_alter_items_to_validate', function ($items, $coupon_id) {
    $buy_qty = (int) get_post_meta($coupon_id, '_mf_bogo_buy_qty', true);
    if ($buy_qty <= 1) {
        return $items;
    }

    $total_qty = array_sum(array_column($items, 'quantity'));
    if ($total_qty < $buy_qty) {
        return [];
    }

    return $items;
}, 20, 2);

// ─── Runtime: limit discounted items to Get Y quantity ───────────────────────

global $mf_bogo_get_discount_counts;
$mf_bogo_get_discount_counts = [];

add_action('woocommerce_before_calculate_totals', function () {
    global $mf_bogo_get_discount_counts;
    $mf_bogo_get_discount_counts = [];
}, 0);

add_filter('woocommerce_coupon_get_discount_amount', function ($discount, $discounting_amount, $cart_item, $single, $coupon) {
    if ('wbte_sc_bogo' !== $coupon->get_discount_type()) {
        return $discount;
    }

    $coupon_id = $coupon->get_id();
    $get_qty   = (int) get_post_meta($coupon_id, '_mf_bogo_get_qty', true);
    if ($get_qty <= 0) {
        return $discount;
    }

    $get_products_raw = get_post_meta($coupon_id, '_mf_bogo_get_product_ids', true);
    $get_product_ids  = !empty($get_products_raw) ? array_filter(array_map('absint', explode(',', $get_products_raw))) : [];

    if (!empty($get_product_ids)) {
        $item_product_id = $cart_item['product_id'] ?? 0;
        if (!in_array($item_product_id, $get_product_ids)) {
            return 0;
        }
    }

    global $mf_bogo_get_discount_counts;
    $code = $coupon->get_code();
    if (!isset($mf_bogo_get_discount_counts[$code])) {
        $mf_bogo_get_discount_counts[$code] = 0;
    }

    if ($mf_bogo_get_discount_counts[$code] >= $get_qty) {
        return 0;
    }

    $mf_bogo_get_discount_counts[$code] += $cart_item['quantity'] ?? 1;

    return $discount;
}, 10, 5);
*/
