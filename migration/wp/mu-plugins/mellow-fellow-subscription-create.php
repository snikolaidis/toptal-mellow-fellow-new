<?php
/* Plugin Name: Mellow Fellow Subscription Create */

if (!defined('ABSPATH')) {
    exit;
}

function mf_subscription_verify_request($request) {
    if (is_user_logged_in()) {
        return true;
    }
    $auth = $request->get_header('Authorization');
    if ($auth && strpos($auth, 'Bearer ') === 0) {
        $provided = substr($auth, 7);
        $candidates = array();
        if (defined('FAUSTWP_SECRET_KEY')) {
            $candidates[] = FAUSTWP_SECRET_KEY;
        }
        $opt = get_option('faustwp_secret_key', '');
        if ($opt) {
            $candidates[] = $opt;
        }
        $settings = get_option('faustwp_settings');
        if (is_array($settings) && !empty($settings['secret_key'])) {
            $candidates[] = $settings['secret_key'];
        }
        foreach ($candidates as $secret) {
            if ($secret && hash_equals((string) $secret, $provided)) {
                return true;
            }
        }
    }
    return new WP_Error('rest_forbidden', 'Unauthorized', array('status' => 401));
}

add_action('rest_api_init', function () {
    register_rest_route('mf/v1', '/create-subscription', array(
        'methods' => 'POST',
        'permission_callback' => 'mf_subscription_verify_request',
        'callback' => 'mf_create_subscription_from_order_endpoint',
    ));
    register_rest_route('mf/v1', '/create-subscription-order', array(
        'methods' => 'POST',
        'permission_callback' => 'mf_subscription_verify_request',
        'callback' => 'mf_create_subscription_order_endpoint',
    ));
    register_rest_route('mf/v1', '/subscriptions/(?P<user_id>\d+)', array(
        'methods' => 'GET',
        'permission_callback' => 'mf_subscription_verify_request',
        'callback' => 'mf_subscriptions_list_endpoint',
    ));
    register_rest_route('mf/v1', '/subscriptions/(?P<user_id>\d+)/cancel', array(
        'methods' => 'POST',
        'permission_callback' => 'mf_subscription_verify_request',
        'callback' => 'mf_subscription_cancel_endpoint',
    ));
});

function mf_subscriptions_list_endpoint($request) {
    $user_id = (int) $request['user_id'];
    if (!$user_id || !function_exists('wcs_get_users_subscriptions')) {
        return new WP_REST_Response(array('subscriptions' => array()), 200);
    }
    $subs = wcs_get_users_subscriptions($user_id);
    $out = array();
    foreach ($subs as $sub) {
        $items = array();
        foreach ($sub->get_items() as $item) {
            $items[] = array(
                'name' => $item->get_name(),
                'quantity' => $item->get_quantity(),
            );
        }
        $next = $sub->get_date('next_payment');
        $out[] = array(
            'id' => $sub->get_id(),
            'status' => $sub->get_status(),
            'total' => $sub->get_total(),
            'currency' => $sub->get_currency(),
            'billingPeriod' => $sub->get_billing_period(),
            'billingInterval' => (int) $sub->get_billing_interval(),
            'nextPayment' => $next ? $next : '',
            'canCancel' => $sub->can_be_updated_to('cancelled'),
            'items' => $items,
        );
    }
    return new WP_REST_Response(array('subscriptions' => $out), 200);
}

function mf_subscription_cancel_endpoint($request) {
    $user_id = (int) $request['user_id'];
    $params = $request->get_json_params();
    $sub_id = (int) (isset($params['subscriptionId']) ? $params['subscriptionId'] : 0);
    if (!$user_id || !$sub_id || !function_exists('wcs_get_subscription')) {
        return new WP_REST_Response(array('error' => 'invalid_request'), 400);
    }
    $sub = wcs_get_subscription($sub_id);
    if (!$sub || (int) $sub->get_user_id() !== $user_id) {
        return new WP_REST_Response(array('error' => 'not_found'), 404);
    }
    if (!$sub->can_be_updated_to('cancelled')) {
        return new WP_REST_Response(array('error' => 'cannot_cancel', 'status' => $sub->get_status()), 409);
    }
    $sub->update_status('cancelled', 'Cancelled by customer (headless account).');
    return new WP_REST_Response(array('success' => true, 'status' => $sub->get_status()), 200);
}

function mf_map_address($addr) {
    if (!is_array($addr)) {
        return array();
    }
    return array(
        'first_name' => isset($addr['firstName']) ? sanitize_text_field($addr['firstName']) : '',
        'last_name' => isset($addr['lastName']) ? sanitize_text_field($addr['lastName']) : '',
        'address_1' => isset($addr['address1']) ? sanitize_text_field($addr['address1']) : '',
        'address_2' => isset($addr['address2']) ? sanitize_text_field($addr['address2']) : '',
        'city' => isset($addr['city']) ? sanitize_text_field($addr['city']) : '',
        'state' => isset($addr['state']) ? sanitize_text_field($addr['state']) : '',
        'postcode' => isset($addr['postcode']) ? sanitize_text_field($addr['postcode']) : '',
        'country' => isset($addr['country']) ? sanitize_text_field($addr['country']) : 'US',
        'email' => isset($addr['email']) ? sanitize_email($addr['email']) : '',
        'phone' => isset($addr['phone']) ? sanitize_text_field($addr['phone']) : '',
    );
}

function mf_build_subscription($order, $period, $interval, $customer_profile_id, $payment_profile_id, $subscribed_ids = array()) {
    if (!function_exists('wcs_create_subscription')) {
        return new WP_Error('subscriptions_unavailable', 'WooCommerce Subscriptions not available.');
    }
    if (function_exists('wcs_get_subscriptions_for_order')) {
        $existing = wcs_get_subscriptions_for_order($order->get_id(), array('order_type' => 'parent'));
        if (!empty($existing)) {
            return reset($existing);
        }
    }

    $sub = wcs_create_subscription(array(
        'order_id' => $order->get_id(),
        'status' => 'pending',
        'billing_period' => $period,
        'billing_interval' => $interval,
        'customer_id' => $order->get_customer_id(),
        'start_date' => gmdate('Y-m-d H:i:s'),
    ));
    if (is_wp_error($sub)) {
        return $sub;
    }

    $only = array_map('intval', (array) $subscribed_ids);
    foreach ($order->get_items() as $item) {
        $product = $item->get_product();
        if ($product && $product->get_id()) {
            if (!empty($only) && !in_array((int) $product->get_id(), $only, true)) {
                continue;
            }
            $sub->add_product($product, $item->get_quantity(), array(
                'subtotal' => $item->get_subtotal(),
                'total' => $item->get_total(),
            ));
        }
    }

    foreach ($order->get_items('shipping') as $ship_item) {
        $sub_ship = new WC_Order_Item_Shipping();
        $sub_ship->set_method_title($ship_item->get_method_title());
        $sub_ship->set_total($ship_item->get_total());
        $sub->add_item($sub_ship);
    }

    $sub->set_address($order->get_address('billing'), 'billing');
    $sub->set_address($order->get_address('shipping'), 'shipping');
    $sub->set_payment_method('authorize_net');
    $sub->set_payment_method_title('Credit Card (Authorize.net)');
    if (method_exists($sub, 'set_requires_manual_renewal')) {
        $sub->set_requires_manual_renewal(false);
    }
    if ($customer_profile_id) {
        $sub->update_meta_data('_authnet_customer_profile_id', $customer_profile_id);
    }
    if ($payment_profile_id) {
        $sub->update_meta_data('_authnet_payment_profile_id', $payment_profile_id);
    }

    $sub->calculate_totals();

    $from = current_time('timestamp', true);
    $next_ts = function_exists('wcs_add_time') ? wcs_add_time($interval, $period, $from) : ($from + 30 * DAY_IN_SECONDS);
    $sub->update_dates(array('next_payment' => gmdate('Y-m-d H:i:s', $next_ts)));

    $sub->update_status('active', 'Headless subscription created.');
    $sub->save();

    return $sub;
}

function mf_create_subscription_from_order_endpoint($request) {
    $order = wc_get_order((int) $request->get_param('orderId'));
    if (!$order) {
        return new WP_REST_Response(array('error' => 'order_not_found'), 404);
    }
    $period = sanitize_text_field((string) $request->get_param('period'));
    $interval = (int) $request->get_param('interval');
    if (!$period || $interval < 1) {
        return new WP_REST_Response(array('error' => 'missing_schedule'), 400);
    }

    $sub = mf_build_subscription(
        $order,
        $period,
        $interval,
        sanitize_text_field((string) $request->get_param('customerProfileId')),
        sanitize_text_field((string) $request->get_param('paymentProfileId'))
    );
    if (is_wp_error($sub)) {
        return new WP_REST_Response(array('error' => 'create_failed', 'message' => $sub->get_error_message()), 500);
    }

    $order->add_order_note('Subscription #' . $sub->get_id() . ' created (headless).');
    $order->save();

    return new WP_REST_Response(array('subscription_id' => $sub->get_id()), 200);
}

function mf_create_subscription_order_endpoint($request) {
    if (!function_exists('wc_create_order')) {
        return new WP_REST_Response(array('error' => 'woo_unavailable'), 500);
    }

    $params = $request->get_json_params();
    $period = sanitize_text_field((string) ($params['period'] ?? ''));
    $interval = (int) ($params['interval'] ?? 0);
    $items = isset($params['items']) && is_array($params['items']) ? $params['items'] : array();
    $transaction_id = sanitize_text_field((string) ($params['transactionId'] ?? ''));
    $customer_id = (int) ($params['wpUserId'] ?? 0);
    $billing = mf_map_address(isset($params['billing']) ? $params['billing'] : array());
    $shipping = mf_map_address(isset($params['shipping']) ? $params['shipping'] : (isset($params['billing']) ? $params['billing'] : array()));
    $customer_profile_id = sanitize_text_field((string) ($params['customerProfileId'] ?? ''));
    $payment_profile_id = sanitize_text_field((string) ($params['paymentProfileId'] ?? ''));

    if (!$period || $interval < 1 || empty($items)) {
        return new WP_REST_Response(array('error' => 'missing_fields'), 400);
    }

    $order = wc_create_order(array('customer_id' => $customer_id));
    if (is_wp_error($order)) {
        return new WP_REST_Response(array('error' => 'order_failed', 'message' => $order->get_error_message()), 500);
    }

    $lines = isset($params['lines']) && is_array($params['lines']) ? $params['lines'] : array();
    $unit_prices = array();
    foreach ($lines as $ln) {
        $lpid = (int) (isset($ln['productId']) ? $ln['productId'] : 0);
        if ($lpid && isset($ln['unitPrice']) && is_numeric($ln['unitPrice'])) {
            $unit_prices[$lpid] = (float) $ln['unitPrice'];
        }
    }

    $applied_discount = false;
    foreach ($items as $it) {
        $pid = (int) (isset($it['productId']) ? $it['productId'] : 0);
        $qty = max(1, (int) (isset($it['quantity']) ? $it['quantity'] : 1));
        $product = $pid ? wc_get_product($pid) : null;
        if ($product && $product->get_id()) {
            if (isset($unit_prices[$pid])) {
                $line_total = round($unit_prices[$pid] * $qty, 2);
                $order->add_product($product, $qty, array(
                    'subtotal' => $line_total,
                    'total' => $line_total,
                ));
                $applied_discount = true;
            } else {
                $order->add_product($product, $qty);
            }
        }
    }

    $shipping_cost = isset($params['shippingCost']) && is_numeric($params['shippingCost'])
        ? (float) $params['shippingCost']
        : ( isset($params['shipping']) && is_numeric($params['shipping']) ? (float) $params['shipping'] : 0 );
    if ($shipping_cost > 0) {
        $ship_item = new WC_Order_Item_Shipping();
        $ship_item->set_method_title('Shipping');
        $ship_item->set_total((string) round($shipping_cost, 2));
        $order->add_item($ship_item);
    }

    $order->set_address($billing, 'billing');
    $order->set_address($shipping, 'shipping');
    $order->set_payment_method('authorize_net');
    $order->set_payment_method_title('Credit Card (Authorize.net)');
    if ($transaction_id) {
        $order->set_transaction_id($transaction_id);
    }
    if ($customer_profile_id) {
        $order->update_meta_data('_authnet_customer_profile_id', $customer_profile_id);
    }
    if ($payment_profile_id) {
        $order->update_meta_data('_authnet_payment_profile_id', $payment_profile_id);
    }
    $order->calculate_totals(!$applied_discount);
    $order->payment_complete($transaction_id);

    $sub = mf_build_subscription($order, $period, $interval, $customer_profile_id, $payment_profile_id, array_keys($unit_prices));
    if (is_wp_error($sub)) {
        $order->add_order_note('Subscription creation failed: ' . $sub->get_error_message());
        $order->save();
        return new WP_REST_Response(array(
            'error' => 'subscription_failed',
            'message' => $sub->get_error_message(),
            'orderId' => $order->get_id(),
            'orderNumber' => $order->get_order_number(),
        ), 500);
    }

    $order->add_order_note('Subscription #' . $sub->get_id() . ' created (headless, server-side).');
    $order->save();

    return new WP_REST_Response(array(
        'orderId' => $order->get_id(),
        'orderNumber' => $order->get_order_number(),
        'subscriptionId' => $sub->get_id(),
        'total' => $order->get_total(),
    ), 200);
}
