<?php
/* Plugin Name: Mellow Fellow Loyalty Free Product */

if (!defined('ABSPATH')) {
    exit;
}

function mellow_fellow_free_product_verify_token($params) {
    if (!function_exists('mellow_fellow_loyalty_guid') || !function_exists('mellow_fellow_loyalty_api_key')) {
        return false;
    }
    $guid = mellow_fellow_loyalty_guid();
    $api_key = mellow_fellow_loyalty_api_key();
    if (!$guid || !$api_key) {
        return false;
    }
    $token = isset($params['token']) ? (string) $params['token'] : '';
    if ($token === '') {
        return false;
    }
    $message = array(
        'guid' => (string) $guid,
        'api_key' => (string) $api_key,
        'cart_id' => (string) ($params['cart_id'] ?? ''),
        'variant_id' => (string) ($params['variant_id'] ?? ''),
        'customer_email' => (string) ($params['customer_email'] ?? ''),
        'point_redemption_id' => (int) ($params['point_redemption_id'] ?? 0),
    );
    $json = wp_json_encode($message, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $expected = hash_hmac('sha256', $json, (string) $api_key);
    return hash_equals($expected, $token);
}

add_action('rest_api_init', function () {
    register_rest_route('mellow-fellow/v1', '/loyalty/free-product', array(
        'methods' => 'POST',
        'permission_callback' => '__return_true',
        'callback' => 'mellow_fellow_loyalty_free_product',
    ));
});

function mellow_fellow_loyalty_free_product($request) {
    $params = array(
        'cart_id' => $request->get_param('cart_id'),
        'variant_id' => $request->get_param('variant_id'),
        'customer_email' => sanitize_email((string) $request->get_param('customer_email')),
        'point_redemption_id' => $request->get_param('point_redemption_id'),
        'token' => $request->get_param('token'),
    );

    if (!mellow_fellow_free_product_verify_token($params)) {
        return new WP_REST_Response(array('verified' => false, 'reason' => 'invalid_token'), 403);
    }

    $code = trim((string) $request->get_param('reward_text'));
    $product_id = (int) $request->get_param('product_id');
    if ($code === '' || !$product_id) {
        return new WP_REST_Response(array('verified' => true, 'error' => 'missing_fields'), 400);
    }

    if (!function_exists('wc_get_coupon_id_by_code') || !class_exists('WC_Coupon')) {
        return new WP_REST_Response(array('verified' => true, 'error' => 'woo_unavailable'), 500);
    }

    $existing = wc_get_coupon_id_by_code($code);
    if ($existing) {
        return new WP_REST_Response(array('verified' => true, 'code' => $code, 'id' => $existing), 200);
    }

    $coupon = new WC_Coupon();
    $coupon->set_code($code);
    $coupon->set_discount_type('percent');
    $coupon->set_amount(100);
    $coupon->set_product_ids(array($product_id));
    $coupon->set_usage_limit(1);
    if ($params['customer_email']) {
        $coupon->set_email_restrictions(array($params['customer_email']));
    }
    $coupon->update_meta_data('_yotpo_loyalty_coupon', 1);
    $coupon->update_meta_data('_yotpo_free_product', 1);
    $id = $coupon->save();

    if (!$id) {
        return new WP_REST_Response(array('verified' => true, 'error' => 'create_failed'), 500);
    }

    return new WP_REST_Response(array('verified' => true, 'code' => $code, 'id' => $id), 200);
}
