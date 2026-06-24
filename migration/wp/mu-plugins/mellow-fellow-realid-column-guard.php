<?php
/**
 * Plugin Name: Mellow Fellow Real ID Column Guard
 * Description: The getverdict Real ID "ID verification" admin column renders through a Twig template that throws a PHP ParseError under this server's PHP/Twig build, which aborts the entire WooCommerce Orders list (only one row renders, the rest show "critical error"). This removes the plugin's broken column renderer and replaces it with a safe plain-text one.
 * Version: 1.1.0
 */

if (!defined('ABSPATH')) {
    exit;
}

function mellow_fellow_realid_remove_broken_column() {
    global $wp_filter;
    $targets = array(
        'woocommerce_shop_order_list_table_custom_column' => 'populate_id_check_column_hpos',
        'manage_shop_order_posts_custom_column' => 'populate_id_check_column',
    );
    foreach ($targets as $hook => $method) {
        if (empty($wp_filter[$hook]) || empty($wp_filter[$hook]->callbacks)) {
            continue;
        }
        foreach ($wp_filter[$hook]->callbacks as $priority => $callbacks) {
            foreach ($callbacks as $id => $callback) {
                $fn = isset($callback['function']) ? $callback['function'] : null;
                if (is_array($fn) && isset($fn[0]) && is_object($fn[0]) && isset($fn[1]) && $fn[1] === $method) {
                    unset($wp_filter[$hook]->callbacks[$priority][$id]);
                }
            }
        }
    }
}
add_action('current_screen', 'mellow_fellow_realid_remove_broken_column', 99);

function mellow_fellow_realid_render_status($order) {
    if (!($order instanceof WC_Abstract_Order)) {
        echo '-';
        return;
    }
    $status = $order->get_meta('real_id_check_status');
    if ($status !== '' && $status !== null && is_scalar($status)) {
        echo esc_html(ucfirst(str_replace('_', ' ', (string) $status)));
    } else {
        echo '-';
    }
}

add_action('woocommerce_shop_order_list_table_custom_column', function ($column, $order) {
    if ($column === 'real_id_check') {
        mellow_fellow_realid_render_status($order);
    }
}, 10, 2);

add_action('manage_shop_order_posts_custom_column', function ($column) {
    if ($column === 'real_id_check') {
        global $the_order;
        mellow_fellow_realid_render_status($the_order);
    }
}, 10, 1);
