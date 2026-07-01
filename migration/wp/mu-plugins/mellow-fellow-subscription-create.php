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
        $faust_secret = get_option('faustwp_secret_key', '');
        if ($faust_secret && hash_equals($faust_secret, $provided)) {
            return true;
        }
        if (defined('FAUSTWP_SECRET_KEY') && hash_equals(FAUSTWP_SECRET_KEY, $provided)) {
            return true;
        }
    }
    return new WP_Error('rest_forbidden', 'Unauthorized', array('status' => 401));
}

add_action('rest_api_init', function () {
    register_rest_route('mf/v1', '/create-subscription', array(
        'methods' => 'POST',
        'permission_callback' => 'mf_subscription_verify_request',
        'callback' => 'mf_create_subscription_from_order',
    ));
});

function mf_create_subscription_from_order($request) {
    if (!function_exists('wcs_create_subscription')) {
        return new WP_REST_Response(array('error' => 'subscriptions_unavailable'), 500);
    }

    $order_id = (int) $request->get_param('orderId');
    $period = sanitize_text_field((string) $request->get_param('period'));
    $interval = (int) $request->get_param('interval');
    $customer_profile_id = sanitize_text_field((string) $request->get_param('customerProfileId'));
    $payment_profile_id = sanitize_text_field((string) $request->get_param('paymentProfileId'));

    $order = wc_get_order($order_id);
    if (!$order) {
        return new WP_REST_Response(array('error' => 'order_not_found'), 404);
    }
    if (!$period || $interval < 1) {
        return new WP_REST_Response(array('error' => 'missing_schedule'), 400);
    }

    if (function_exists('wcs_get_subscriptions_for_order')) {
        $existing = wcs_get_subscriptions_for_order($order_id, array('order_type' => 'parent'));
        if (!empty($existing)) {
            $first = reset($existing);
            return new WP_REST_Response(array('subscription_id' => $first->get_id(), 'existing' => true), 200);
        }
    }

    $sub = wcs_create_subscription(array(
        'order_id' => $order_id,
        'status' => 'pending',
        'billing_period' => $period,
        'billing_interval' => $interval,
        'customer_id' => $order->get_customer_id(),
        'start_date' => gmdate('Y-m-d H:i:s'),
    ));

    if (is_wp_error($sub)) {
        return new WP_REST_Response(array('error' => 'create_failed', 'message' => $sub->get_error_message()), 500);
    }

    foreach ($order->get_items() as $item) {
        $product = $item->get_product();
        if ($product && $product->get_id()) {
            $sub->add_product($product, $item->get_quantity(), array(
                'subtotal' => $item->get_subtotal(),
                'total' => $item->get_total(),
            ));
        }
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

    $sub->update_status('active', 'Headless subscription created from order #' . $order->get_order_number() . '.');
    $sub->save();

    $order->add_order_note('Subscription #' . $sub->get_id() . ' created (headless).');
    $order->save();

    return new WP_REST_Response(array('subscription_id' => $sub->get_id()), 200);
}
