<?php

if (!defined('WP_CLI') || !WP_CLI) {
    fwrite(STDERR, "This script must run under WP-CLI (wp eval-file).\n");
    exit(1);
}

if (!function_exists('wcs_get_subscriptions') || !function_exists('wcs_create_renewal_order')) {
    WP_CLI::error('WooCommerce Subscriptions not available.');
}

$sub_id = isset($args[0]) ? (int) $args[0] : 0;
if ($sub_id) {
    $sub = wcs_get_subscription($sub_id);
} else {
    $subs = wcs_get_subscriptions(array(
        'subscriptions_per_page' => 1,
        'orderby' => 'start_date',
        'order' => 'DESC',
    ));
    $sub = $subs ? reset($subs) : null;
}

if (!$sub) {
    WP_CLI::error('No subscription found.');
}

$renewal = wcs_create_renewal_order($sub);
if (is_wp_error($renewal)) {
    WP_CLI::error('Could not create renewal order: ' . $renewal->get_error_message());
}

$method = $sub->get_payment_method();
do_action('woocommerce_scheduled_subscription_payment_' . $method, $renewal->get_total(), $renewal);

$after = wc_get_order($renewal->get_id());
WP_CLI::success(sprintf(
    'sub#%d method=%s renewal_order#%d charged=%s order_status=%s sub_status=%s',
    $sub->get_id(),
    $method,
    $renewal->get_id(),
    $renewal->get_total(),
    $after ? $after->get_status() : 'unknown',
    $sub->get_status()
));
