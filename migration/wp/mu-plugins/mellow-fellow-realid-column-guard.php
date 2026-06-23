<?php
/**
 * Plugin Name: Mellow Fellow Real ID Column Guard
 * Description: Prevents a fatal in the getverdict Real ID "ID verification" admin column when real_id_check_status order meta is non-scalar (e.g. an array from a migrated or malformed webhook payload), which otherwise aborts the entire WooCommerce Orders list render.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

function mellow_fellow_realid_scalarize_order($order) {
    if (!($order instanceof WC_Abstract_Order)) {
        return;
    }
    $status = $order->get_meta('real_id_check_status');
    if ($status !== '' && $status !== null && !is_scalar($status)) {
        $order->update_meta_data('real_id_check_status', '');
    }
}

add_action('woocommerce_shop_order_list_table_custom_column', function ($column, $order) {
    if ($column === 'real_id_check') {
        mellow_fellow_realid_scalarize_order($order);
    }
}, 9, 2);

add_action('manage_shop_order_posts_custom_column', function ($column) {
    if ($column === 'real_id_check') {
        global $the_order;
        mellow_fellow_realid_scalarize_order($the_order);
    }
}, 9, 1);
