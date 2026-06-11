<?php
/**
 * Plugin Name: Mellow Fellow Loyalty Orders
 * Description: Sends paid and completed WooCommerce orders to the Yotpo Loyalty API to award points.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

function mellow_fellow_loyalty_guid() {
    if (defined('YOTPO_LOYALTY_GUID') && YOTPO_LOYALTY_GUID) {
        return YOTPO_LOYALTY_GUID;
    }
    $env = getenv('YOTPO_LOYALTY_GUID');
    if ($env) {
        return $env;
    }
    $opt = get_option('yotpo_loyalty_guid');
    if ($opt) {
        return $opt;
    }
    return 'AJUs08zwC9wlMRyimafHsw';
}

function mellow_fellow_loyalty_api_key() {
    if (defined('YOTPO_LOYALTY_API_KEY') && YOTPO_LOYALTY_API_KEY) {
        return YOTPO_LOYALTY_API_KEY;
    }
    $env = getenv('YOTPO_LOYALTY_API_KEY');
    if ($env) {
        return $env;
    }
    return get_option('yotpo_loyalty_api_key');
}

function mellow_fellow_loyalty_record_order($order_id) {
    $order = wc_get_order($order_id);
    if (!$order) {
        return;
    }

    $current_status = $order->get_status();
    if ($order->get_meta('_yotpo_loyalty_synced_status') === $current_status) {
        return;
    }

    $api_key = mellow_fellow_loyalty_api_key();
    $guid = mellow_fellow_loyalty_guid();
    $email = $order->get_billing_email();
    if (!$api_key || !$guid || !$email) {
        return;
    }

    $created = $order->get_date_created();

    $payload = array(
        'customer_email' => $email,
        'total_amount_cents' => (int) round((float) $order->get_total() * 100),
        'currency_code' => $order->get_currency(),
        'order_id' => (string) $order->get_id(),
        'ip_address' => $order->get_customer_ip_address(),
        'user_agent' => $order->get_customer_user_agent(),
        'status' => $current_status,
        'created_at' => $created ? $created->date('c') : null,
    );

    $customer_id = $order->get_customer_id();
    if ($customer_id) {
        $payload['customer_id'] = (string) $customer_id;
    }

    $coupons = $order->get_coupon_codes();
    if (!empty($coupons)) {
        $payload['coupon_code'] = implode(',', $coupons);
    }

    $url = add_query_arg(
        array('guid' => $guid, 'api_key' => $api_key),
        'https://loyalty.yotpo.com/api/v2/orders'
    );

    $response = wp_remote_post($url, array(
        'timeout' => 20,
        'headers' => array('Content-Type' => 'application/json'),
        'body' => wp_json_encode($payload),
    ));

    if (is_wp_error($response)) {
        $order->add_order_note('Yotpo Loyalty order sync failed: ' . $response->get_error_message());
        return;
    }

    $code = wp_remote_retrieve_response_code($response);
    if ($code >= 200 && $code < 300) {
        $order->update_meta_data('_yotpo_loyalty_synced_status', $current_status);
        $order->save();
        $order->add_order_note('Yotpo Loyalty: order recorded for points as "' . $current_status . '" (HTTP ' . $code . ').');
    } else {
        $body = wp_remote_retrieve_body($response);
        $order->add_order_note('Yotpo Loyalty order sync error (HTTP ' . $code . '): ' . substr((string) $body, 0, 300));
    }
}

add_action('woocommerce_order_status_processing', 'mellow_fellow_loyalty_record_order', 20, 1);
add_action('woocommerce_order_status_completed', 'mellow_fellow_loyalty_record_order', 20, 1);
