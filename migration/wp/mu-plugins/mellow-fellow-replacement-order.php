<?php
/* Plugin Name: Mellow Fellow Replacement Order */

if (!defined('ABSPATH')) {
    exit;
}

add_filter('woocommerce_order_actions', function ($actions) {
    global $theorder;
    if ($theorder && $theorder->get_meta('_mf_replacement_for')) {
        return $actions;
    }
    $actions['mf_create_replacement'] = __('Create replacement order (draft)', 'mellow-fellow');
    return $actions;
});

add_action('woocommerce_order_action_mf_create_replacement', 'mellow_fellow_create_replacement_order');

function mellow_fellow_create_replacement_order($order) {
    if (!current_user_can('manage_woocommerce') || !function_exists('wc_create_order')) {
        return;
    }

    $new = wc_create_order(array(
        'customer_id' => $order->get_customer_id(),
        'status' => 'pending',
    ));
    if (is_wp_error($new)) {
        $order->add_order_note('Replacement order failed: could not create the new order.');
        return;
    }

    $new->set_address($order->get_address('billing'), 'billing');
    $new->set_address($order->get_address('shipping'), 'shipping');

    $skipped = array();
    foreach ($order->get_items() as $item) {
        $product = $item->get_product();
        if ($product && $product->get_id()) {
            $new->add_product($product, $item->get_quantity());
        } else {
            $skipped[] = $item->get_name();
        }
    }

    foreach ($order->get_items('shipping') as $ship) {
        $shipping = new WC_Order_Item_Shipping();
        $shipping->set_method_title($ship->get_method_title());
        $shipping->set_method_id($ship->get_method_id());
        $shipping->set_total(0);
        $new->add_item($shipping);
    }

    $new->calculate_totals();
    $new->update_meta_data('_mf_replacement_for', $order->get_id());

    $user = wp_get_current_user();
    $by = $user && $user->ID ? $user->user_login : 'system';
    $new->add_order_note('Replacement draft for order #' . $order->get_order_number() . ' (lost or damaged). Created by ' . $by . '. Adjust items and discount as needed, then set the order to a paid status to send it to fulfillment.');
    if (!empty($skipped)) {
        $new->add_order_note('Products not found and skipped: ' . implode(', ', $skipped));
    }

    $new->save();

    $order->add_order_note('Replacement draft #' . $new->get_order_number() . ' created.');
    $order->save();
}
