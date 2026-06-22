<?php
/**
 * Plugin Name: Mellow Fellow Loyalty Redemptions
 * Description: Creates and cancels WooCommerce coupons from Yotpo Loyalty point redemptions.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

function mellow_fellow_loyalty_coupon_secret() {
    if (defined('YOTPO_LOYALTY_COUPON_SECRET') && YOTPO_LOYALTY_COUPON_SECRET) {
        return YOTPO_LOYALTY_COUPON_SECRET;
    }
    $env = getenv('YOTPO_LOYALTY_COUPON_SECRET');
    if ($env) {
        return $env;
    }
    $opt = get_option('yotpo_loyalty_coupon_secret');
    if ($opt) {
        return $opt;
    }
    if (defined('YOTPO_LOYALTY_API_KEY') && YOTPO_LOYALTY_API_KEY) {
        return YOTPO_LOYALTY_API_KEY;
    }
    $api_env = getenv('YOTPO_LOYALTY_API_KEY');
    if ($api_env) {
        return $api_env;
    }
    return get_option('yotpo_loyalty_api_key');
}

function mellow_fellow_loyalty_check_secret($request) {
    $expected = mellow_fellow_loyalty_coupon_secret();
    if (!$expected) {
        return false;
    }
    $given = $request->get_param('secret');
    if (!is_string($given) || $given === '') {
        $given = $request->get_header('X-Api-Secret');
    }
    return is_string($given) && hash_equals((string) $expected, $given);
}

add_action('rest_api_init', function () {
    register_rest_route('mellow-fellow/v1', '/loyalty/coupon', array(
        'methods' => 'POST',
        'permission_callback' => '__return_true',
        'callback' => 'mellow_fellow_loyalty_create_coupon',
    ));

    register_rest_route('mellow-fellow/v1', '/loyalty/coupon/cancel', array(
        'methods' => array('POST', 'DELETE'),
        'permission_callback' => '__return_true',
        'callback' => 'mellow_fellow_loyalty_cancel_coupon',
    ));
});

function mellow_fellow_loyalty_create_coupon($request) {
    if (!mellow_fellow_loyalty_check_secret($request)) {
        return new WP_REST_Response(array('error' => 'unauthorized'), 403);
    }

    $code = trim((string) $request->get_param('coupon_code'));
    $amount = $request->get_param('discount_amount');
    $email = sanitize_email((string) $request->get_param('customer_email'));

    if ($amount === null) {
        $cents = $request->get_param('discount_amount_cents');
        if ($cents !== null) {
            $amount = (float) $cents / 100;
        }
    }

    if (!$code || $amount === null) {
        return new WP_REST_Response(array('error' => 'missing_fields'), 400);
    }

    $existing = wc_get_coupon_id_by_code($code);
    if ($existing) {
        return new WP_REST_Response(array('id' => $existing), 200);
    }

    $coupon = new WC_Coupon();
    $coupon->set_code($code);
    $coupon->set_discount_type('fixed_cart');
    $coupon->set_amount((float) $amount);
    $coupon->set_usage_limit(1);
    if ($email) {
        $coupon->set_email_restrictions(array($email));
    }
    $coupon->update_meta_data('_yotpo_loyalty_coupon', 1);
    $id = $coupon->save();

    if (!$id) {
        return new WP_REST_Response(array('error' => 'create_failed'), 500);
    }

    return new WP_REST_Response(array('id' => $id), 200);
}

function mellow_fellow_loyalty_cancel_coupon($request) {
    if (!mellow_fellow_loyalty_check_secret($request)) {
        return new WP_REST_Response(array('error' => 'unauthorized'), 403);
    }

    $id = (int) $request->get_param('coupon_id');
    if (!$id) {
        $code = trim((string) $request->get_param('coupon_code'));
        if ($code) {
            $id = (int) wc_get_coupon_id_by_code($code);
        }
    }
    if (!$id) {
        return new WP_REST_Response(array('error' => 'missing_fields'), 400);
    }

    if (get_post_type($id) !== 'shop_coupon') {
        return new WP_REST_Response(array('cancelled' => false, 'reason' => 'not_found'), 200);
    }

    $coupon = new WC_Coupon($id);
    if ((int) $coupon->get_usage_count() > 0) {
        return new WP_REST_Response(array('cancelled' => false, 'reason' => 'already_used'), 200);
    }

    wp_delete_post($id, true);
    return new WP_REST_Response(array('cancelled' => true, 'id' => $id), 200);
}
