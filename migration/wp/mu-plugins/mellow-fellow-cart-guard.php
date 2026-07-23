<?php
/* Plugin Name: Mellow Fellow Subscription Cart Guard */

if (!defined('ABSPATH')) {
    exit;
}

function mf_scg_is_graphql_context() {
    return function_exists('is_graphql_request') && is_graphql_request();
}

function mf_scg_is_real_subscription_cart_item($cart_item) {
    if (!is_array($cart_item)) {
        return false;
    }
    return isset($cart_item['subscription_renewal'])
        || isset($cart_item['subscription_switch'])
        || isset($cart_item['subscription_resubscribe'])
        || isset($cart_item['subscription_initial_payment']);
}

function mf_scg_cart_has_real_subscription() {
    if (!function_exists('WC') || !WC()->cart) {
        return false;
    }
    foreach (WC()->cart->get_cart() as $cart_item) {
        if (mf_scg_is_real_subscription_cart_item($cart_item)) {
            return true;
        }
    }
    return false;
}

add_action('graphql_init', function () {
    if (!class_exists('WC_Subscriptions_Cart_Validator')) {
        return;
    }
    remove_filter('woocommerce_add_to_cart_validation', array('WC_Subscriptions_Cart_Validator', 'maybe_empty_cart'), 10);
    remove_filter('woocommerce_add_to_cart_validation', array('WC_Subscriptions_Cart_Validator', 'can_add_product_to_cart'), 10);

    if (class_exists('WCS_ATT_Cart')) {
        remove_action('woocommerce_add_to_cart', array('WCS_ATT_Cart', 'apply_subscription_schemes_on_add_to_cart'), 19);
        remove_action('woocommerce_before_calculate_totals', array('WCS_ATT_Cart', 'apply_subscription_scheme_prices'), 10);
    }

    if (class_exists('WC_Subscriptions_Cart')) {
        remove_action('woocommerce_before_calculate_totals', array('WC_Subscriptions_Cart', 'add_calculation_price_filter'), 10);
        remove_action('woocommerce_before_calculate_totals', array('WC_Subscriptions_Cart', 'set_recurring_cart_key_before_calculate_totals'), 1);
    }

    if (class_exists('WC_Subscriptions_Coupon')) {
        remove_action('woocommerce_before_calculate_totals', array('WC_Subscriptions_Coupon', 'remove_coupons'), 10);
    }

    if (class_exists('WC_Subscriptions_Synchroniser')) {
        remove_action('woocommerce_before_calculate_totals', array('WC_Subscriptions_Synchroniser', 'maybe_set_free_trial'), 0);
    }

    if (class_exists('WC_Subscriptions_Switcher')) {
        remove_action('woocommerce_before_calculate_totals', array('WC_Subscriptions_Switcher', 'calculate_prorated_totals'), 99);
        remove_filter('woocommerce_add_to_cart_validation', array('WC_Subscriptions_Switcher', 'validate_switch_request'), 10);
    }
});

add_filter('wcsatt_product_subscription_schemes', function ($schemes, $product) {
    if (mf_scg_is_graphql_context()) {
        return array();
    }
    return $schemes;
}, 1000, 2);

add_filter('wcsatt_force_subscription', function ($forced, $product) {
    if (mf_scg_is_graphql_context()) {
        return false;
    }
    return $forced;
}, 1000, 2);

add_filter('wcsatt_cart_item', function ($cart_item) {
    if (!mf_scg_is_graphql_context()) {
        return $cart_item;
    }
    if (mf_scg_is_real_subscription_cart_item($cart_item)) {
        return $cart_item;
    }
    if (isset($cart_item['wcsatt_data']) && is_array($cart_item['wcsatt_data'])) {
        $cart_item['wcsatt_data']['active_subscription_scheme'] = false;
    }
    return $cart_item;
}, 1000, 1);

add_action('woocommerce_check_cart_items', function () {
    if (!mf_scg_is_graphql_context() || mf_scg_cart_has_real_subscription()) {
        return;
    }
    if (class_exists('WCS_ATT_Cart')) {
        remove_action('woocommerce_check_cart_items', array('WCS_ATT_Cart', 'check_applied_subscription_schemes'), 10);
    }
}, 1);

add_action('woocommerce_check_cart_items', function () {
    if (!mf_scg_is_graphql_context() || mf_scg_cart_has_real_subscription()) {
        return;
    }
    $notices = function_exists('wc_get_notices') ? wc_get_notices('error') : array();
    if (empty($notices)) {
        return;
    }
    $needles = array(
        'subscription plan that you originally signed up for',
        'is only available for purchase on subscription',
    );
    $kept = array();
    foreach ($notices as $notice) {
        $message = is_array($notice) ? (isset($notice['notice']) ? $notice['notice'] : '') : (string) $notice;
        $strip = false;
        foreach ($needles as $needle) {
            if (false !== strpos($message, $needle)) {
                $strip = true;
                break;
            }
        }
        if (!$strip) {
            $kept[] = $notice;
        }
    }
    if (count($kept) === count($notices)) {
        return;
    }
    wc_clear_notices();
    foreach ($kept as $notice) {
        $message = is_array($notice) ? (isset($notice['notice']) ? $notice['notice'] : '') : (string) $notice;
        $type = is_array($notice) && isset($notice['type']) ? $notice['type'] : 'error';
        if ('' !== $message) {
            wc_add_notice($message, $type);
        }
    }
}, 999);
