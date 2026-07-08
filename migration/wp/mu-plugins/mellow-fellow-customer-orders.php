<?php
/* Plugin Name: Mellow Fellow Customer Orders */

if (!defined('ABSPATH')) {
    exit;
}

function mf_co_is_hpos() {
    return class_exists('\Automattic\WooCommerce\Utilities\OrderUtil')
        && \Automattic\WooCommerce\Utilities\OrderUtil::custom_orders_table_usage_is_enabled();
}

function mf_co_order_edit_url($order_id) {
    if (class_exists('\Automattic\WooCommerce\Utilities\OrderUtil')
        && method_exists('\Automattic\WooCommerce\Utilities\OrderUtil', 'get_order_admin_edit_url')) {
        return \Automattic\WooCommerce\Utilities\OrderUtil::get_order_admin_edit_url($order_id);
    }
    return admin_url('post.php?post=' . (int) $order_id . '&action=edit');
}

function mf_co_orders_list_url($user_id) {
    if (mf_co_is_hpos()) {
        return admin_url('admin.php?page=wc-orders&_customer_user=' . (int) $user_id);
    }
    return admin_url('edit.php?post_type=shop_order&_customer_user=' . (int) $user_id);
}

function mf_co_create_order_url($user_id) {
    return wp_nonce_url(
        admin_url('admin-post.php?action=mf_create_customer_order&user_id=' . (int) $user_id),
        'mf_create_order_' . (int) $user_id
    );
}

add_action('admin_post_mf_create_customer_order', function () {
    if (!current_user_can('manage_woocommerce')) {
        wp_die('Insufficient permissions.');
    }
    $user_id = isset($_GET['user_id']) ? absint($_GET['user_id']) : 0;
    check_admin_referer('mf_create_order_' . $user_id);
    if (!$user_id || !function_exists('wc_create_order')) {
        wp_die('Invalid request.');
    }
    $order = wc_create_order(array('customer_id' => $user_id));
    if (is_wp_error($order) || !$order) {
        wp_die('Could not create the order.');
    }
    $order->set_status('auto-draft');
    $order->save();
    wp_safe_redirect(mf_co_order_edit_url($order->get_id()));
    exit;
});

function mf_co_render_user_orders($user) {
    if (!current_user_can('manage_woocommerce') || !function_exists('wc_get_orders')) {
        return;
    }
    $user_id = is_object($user) ? (int) $user->ID : (int) $user;
    if (!$user_id) {
        return;
    }

    $orders = wc_get_orders(array(
        'customer_id' => $user_id,
        'limit' => 10,
        'orderby' => 'date',
        'order' => 'DESC',
        'type' => 'shop_order',
    ));

    echo '<h2>Customer Orders</h2>';

    if (empty($orders)) {
        echo '<p>No orders yet for this customer.</p>';
        echo '<p class="submit" style="margin-top:0"><a href="' . esc_url(mf_co_create_order_url($user_id)) . '" class="button button-primary">Create order</a></p>';
        return;
    }

    $last = $orders[0];
    $last_date = $last->get_date_created() ? $last->get_date_created()->date('M j, Y \a\t g:i a') : '';

    echo '<div style="border:1px solid #dcdcde;border-radius:8px;padding:16px;max-width:840px;background:#fff">';
    echo '<div style="color:#646970;font-weight:600;margin-bottom:8px">Last order placed</div>';
    echo '<div style="display:flex;justify-content:space-between;align-items:baseline">';
    echo '<div><a href="' . esc_url(mf_co_order_edit_url($last->get_id())) . '" style="font-weight:700;font-size:15px">#' . esc_html($last->get_order_number()) . '</a> <span style="display:inline-block;background:#f0f0f1;border-radius:10px;padding:2px 8px;font-size:12px;color:#3c434a">' . esc_html(wc_get_order_status_name($last->get_status())) . '</span></div>';
    echo '<div style="font-weight:700">' . wp_kses_post($last->get_formatted_order_total()) . '</div>';
    echo '</div>';
    echo '<div style="color:#646970;font-size:12px;margin-top:2px">' . esc_html($last_date) . '</div>';

    foreach ($last->get_items() as $item) {
        $product = $item->get_product();
        $img = $product ? $product->get_image(array(40, 40)) : '';
        echo '<div style="display:flex;align-items:center;gap:12px;border-top:1px solid #f0f0f1;padding:10px 0">';
        echo '<div style="width:40px;height:40px;flex:0 0 40px">' . wp_kses_post($img) . '</div>';
        echo '<div style="flex:1">' . esc_html($item->get_name()) . '</div>';
        echo '<div style="color:#646970">x ' . (int) $item->get_quantity() . '</div>';
        echo '<div style="min-width:70px;text-align:right">' . wp_kses_post(wc_price($item->get_total())) . '</div>';
        echo '</div>';
    }

    echo '<div style="text-align:right;margin-top:12px">';
    echo '<a href="' . esc_url(mf_co_orders_list_url($user_id)) . '" class="button button-secondary">View all orders</a> ';
    echo '<a href="' . esc_url(mf_co_create_order_url($user_id)) . '" class="button button-primary">Create order</a>';
    echo '</div>';
    echo '</div>';

    echo '<table class="widefat striped" style="max-width:840px;margin-top:16px"><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Total</th><th></th></tr></thead><tbody>';
    foreach ($orders as $order) {
        $edit = mf_co_order_edit_url($order->get_id());
        $date = $order->get_date_created() ? $order->get_date_created()->date('Y-m-d H:i') : '';
        echo '<tr>';
        echo '<td><a href="' . esc_url($edit) . '">#' . esc_html($order->get_order_number()) . '</a></td>';
        echo '<td>' . esc_html($date) . '</td>';
        echo '<td>' . esc_html(wc_get_order_status_name($order->get_status())) . '</td>';
        echo '<td>' . wp_kses_post($order->get_formatted_order_total()) . '</td>';
        echo '<td><a href="' . esc_url($edit) . '" class="button button-small">Edit</a></td>';
        echo '</tr>';
    }
    echo '</tbody></table>';
    echo '<p class="description">Showing up to 10 most recent orders. Use "View all orders" for the full list filtered to this customer.</p>';
}

add_action('edit_user_profile', 'mf_co_render_user_orders', 20);
add_action('show_user_profile', 'mf_co_render_user_orders', 20);
