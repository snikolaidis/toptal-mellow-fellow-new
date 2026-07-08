<?php
/* Plugin Name: Mellow Fellow Subscription Cart Guard */

if (!defined('ABSPATH')) {
    exit;
}

function mf_cart_guard_is_wcs_flow($cart_item) {
    return isset($cart_item['subscription_initial_payment'])
        || isset($cart_item['subscription_resubscribe'])
        || isset($cart_item['subscription_renewal'])
        || isset($cart_item['subscription_switch']);
}

add_filter('wcsatt_set_subscription_scheme_id', function ($scheme_key, $cart_item, $default) {
    if (mf_cart_guard_is_wcs_flow($cart_item)) {
        return $scheme_key;
    }
    return false;
}, 999, 3);

add_action('wp_loaded', function () {
    remove_action('woocommerce_check_cart_items', array('WCS_ATT_Cart', 'check_applied_subscription_schemes'), 10);
}, 20);
