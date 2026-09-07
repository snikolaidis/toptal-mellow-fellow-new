<?php
/**
 * Plugin Name: Mellow Fellow - Target Price Coupons
 * Description: Adds a "Target Price" option to fixed_product coupons. When set,
 *              the discount for each qualifying item is calculated as
 *              (item_price - target_price) instead of using the fixed amount.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

// ─── Admin: add Target Price field to coupon General tab ─────────────────────

add_action('woocommerce_coupon_options', function ($coupon_id, $coupon) {
    $target_price = get_post_meta($coupon_id, '_mf_target_price', true);
    woocommerce_wp_text_input([
        'id'                => '_mf_target_price',
        'label'             => 'Target price ($)',
        'description'       => 'For fixed_product coupons: set a target price instead of a fixed discount. The discount will be calculated as (item price &minus; target price). Leave empty to use the normal coupon amount.',
        'desc_tip'          => true,
        'type'              => 'text',
        'data_type'         => 'price',
        'value'             => $target_price,
        'placeholder'       => 'e.g. 19.99',
        'custom_attributes' => ['step' => '0.01', 'min' => '0'],
    ]);
}, 30, 2);

// ─── Admin: save Target Price meta ───────────────────────────────────────────

add_action('woocommerce_coupon_options_save', function ($post_id) {
    if (isset($_POST['_mf_target_price'])) {
        $value = sanitize_text_field($_POST['_mf_target_price']);
        $value = $value !== '' ? wc_format_decimal($value) : '';
        update_post_meta($post_id, '_mf_target_price', $value);
    }
}, 10, 1);

// ─── Runtime: override discount amount for target-price coupons ──────────────

add_filter('woocommerce_coupon_get_discount_amount', function ($discount, $discounting_amount, $cart_item, $single, $coupon) {
    if ('fixed_product' !== $coupon->get_discount_type()) {
        return $discount;
    }

    $target_price = get_post_meta($coupon->get_id(), '_mf_target_price', true);
    if ($target_price === '' || $target_price === false) {
        return $discount;
    }

    $target = (float) $target_price;
    if ($target < 0) {
        return $discount;
    }

    $item_price = (float) $discounting_amount;
    $calculated_discount = max(0, $item_price - $target);

    return $calculated_discount;
}, 10, 5);
