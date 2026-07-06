<?php

if (!defined('WP_CLI') || !WP_CLI) {
    fwrite(STDERR, "This script must run under WP-CLI (wp eval-file).\n");
    exit(1);
}

$sub_id = isset($args[0]) ? (int) $args[0] : 0;
$order_id = isset($args[1]) ? (int) $args[1] : 0;

if ($sub_id && function_exists('wcs_get_subscription')) {
    $sub = wcs_get_subscription($sub_id);
    if ($sub) {
        WP_CLI::log('sub#' . $sub_id
            . ' status=' . $sub->get_status()
            . ' method=' . $sub->get_payment_method()
            . ' customer_profile=[' . $sub->get_meta('_authnet_customer_profile_id') . ']'
            . ' payment_profile=[' . $sub->get_meta('_authnet_payment_profile_id') . ']');
    } else {
        WP_CLI::log('sub#' . $sub_id . ' not found');
    }
}

if ($order_id) {
    $order = wc_get_order($order_id);
    if ($order) {
        WP_CLI::log('renewal#' . $order_id
            . ' status=' . $order->get_status()
            . ' total=' . $order->get_total()
            . ' customer_profile=[' . $order->get_meta('_authnet_customer_profile_id') . ']'
            . ' payment_profile=[' . $order->get_meta('_authnet_payment_profile_id') . ']');
        if (function_exists('wc_get_order_notes')) {
            $notes = wc_get_order_notes(array('order_id' => $order_id, 'limit' => 6));
            foreach ($notes as $n) {
                WP_CLI::log('note: ' . trim(wp_strip_all_tags($n->content)));
            }
        }
    } else {
        WP_CLI::log('renewal#' . $order_id . ' not found');
    }
}

WP_CLI::success('diag done');
