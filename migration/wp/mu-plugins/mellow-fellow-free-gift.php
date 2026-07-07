<?php
/* Plugin Name: Mellow Fellow Free Gift */

if (!defined('ABSPATH')) {
    exit;
}

add_action('rest_api_init', function () {
    register_rest_route('mellow-fellow/v1', '/free-gift', array(
        'methods' => 'POST',
        'permission_callback' => '__return_true',
        'callback' => 'mellow_fellow_free_gift',
    ));
});

function mellow_fellow_free_gift($request) {
    $product_id = (int) $request->get_param('product_id');
    if (!$product_id) {
        return new WP_REST_Response(array('error' => 'missing_product_id'), 400);
    }

    if (!function_exists('wc_get_coupon_id_by_code') || !class_exists('WC_Coupon') || !function_exists('wc_get_product')) {
        return new WP_REST_Response(array('error' => 'woo_unavailable'), 500);
    }

    $product = wc_get_product($product_id);
    if (!$product) {
        return new WP_REST_Response(array('error' => 'product_not_found'), 404);
    }

    $offers = function_exists('mf_cart_offers_get') ? mf_cart_offers_get() : array('free_gift_min' => 100, 'free_gift_max_price' => 10);
    $min = (float) ($offers['free_gift_threshold'] ?? 100);
    $max_price = (float) ($offers['free_gift_max_price'] ?? 10);

    $price = (float) $product->get_price();
    if ($price <= 0 || $price >= $max_price) {
        return new WP_REST_Response(array('error' => 'not_eligible'), 400);
    }

    $code = 'mf-free-gift-' . $product_id;
    $existing = wc_get_coupon_id_by_code($code);
    if ($existing) {
        return new WP_REST_Response(array('code' => $code, 'id' => $existing), 200);
    }

    $coupon = new WC_Coupon();
    $coupon->set_code($code);
    $coupon->set_discount_type('percent');
    $coupon->set_amount(100);
    $coupon->set_product_ids(array($product_id));
    $coupon->set_minimum_amount($min);
    $coupon->set_limit_usage_to_x_items(1);
    $coupon->set_individual_use(false);
    $coupon->update_meta_data('_mf_free_gift', 1);
    $id = $coupon->save();

    if (!$id) {
        return new WP_REST_Response(array('error' => 'create_failed'), 500);
    }

    return new WP_REST_Response(array('code' => $code, 'id' => $id), 200);
}
