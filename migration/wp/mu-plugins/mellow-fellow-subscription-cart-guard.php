<?php
/* Plugin Name: Mellow Fellow Subscription Cart Guard */

if (!defined('ABSPATH')) {
    exit;
}

add_filter('wcsatt_set_subscription_scheme_id', function ($scheme_key, $cart_item, $default) {
    if (
        isset($cart_item['subscription_initial_payment'])
        || isset($cart_item['subscription_resubscribe'])
        || isset($cart_item['subscription_renewal'])
        || isset($cart_item['subscription_switch'])
    ) {
        return $scheme_key;
    }
    return false;
}, 999, 3);
