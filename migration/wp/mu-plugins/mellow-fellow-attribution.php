<?php
/* Plugin Name: Mellow Fellow Widget Attribution */

if (!defined('ABSPATH')) {
    exit;
}

function mf_attr_sources() {
    return array(
        'fbt' => 'Frequently Bought Together',
        'free_gift' => 'Free Gift with Purchase',
        'you_may_also_like' => 'You May Also Like',
        'recently_viewed' => 'Recently Viewed',
    );
}

function mf_attr_verify_request($request) {
    $provided = '';
    $auth = $request->get_header('Authorization');
    if ($auth && strpos($auth, 'Bearer ') === 0) {
        $provided = trim(substr($auth, 7));
    }
    if (!$provided) {
        return false;
    }
    $candidates = array();
    $opt = get_option('faustwp_secret_key', '');
    if ($opt) {
        $candidates[] = $opt;
    }
    $settings = get_option('faustwp_settings');
    if (is_array($settings) && !empty($settings['secret_key'])) {
        $candidates[] = $settings['secret_key'];
    }
    if (defined('FAUST_SECRET_KEY')) {
        $candidates[] = FAUST_SECRET_KEY;
    }
    foreach ($candidates as $secret) {
        if ($secret && hash_equals((string) $secret, $provided)) {
            return true;
        }
    }
    return false;
}

add_action('rest_api_init', function () {
    register_rest_route('mf/v1', '/attribute-order', array(
        'methods' => 'POST',
        'permission_callback' => 'mf_attr_verify_request',
        'callback' => 'mf_attr_attribute_order',
    ));
});

function mf_attr_attribute_order($request) {
    $params = $request->get_json_params();
    $order_id = isset($params['orderId']) ? absint($params['orderId']) : 0;
    $sources = isset($params['sources']) && is_array($params['sources']) ? $params['sources'] : array();
    if (!$order_id || empty($sources)) {
        return new WP_REST_Response(array('error' => 'missing_params'), 400);
    }
    if (!function_exists('wc_get_order')) {
        return new WP_REST_Response(array('error' => 'woo_unavailable'), 500);
    }
    $order = wc_get_order($order_id);
    if (!$order) {
        return new WP_REST_Response(array('error' => 'order_not_found'), 404);
    }
    $valid = mf_attr_sources();
    $count = 0;
    foreach ($order->get_items() as $item) {
        $pid = (string) $item->get_product_id();
        if (isset($sources[$pid])) {
            $src = sanitize_key((string) $sources[$pid]);
            if (isset($valid[$src]) && !$item->get_meta('_mf_widget_source')) {
                $item->update_meta_data('_mf_widget_source', $src);
                $item->save();
                $count++;
            }
        }
    }
    return new WP_REST_Response(array('attributed' => $count), 200);
}

function mf_attr_aggregate($days) {
    $args = array(
        'limit' => -1,
        'status' => array('processing', 'completed', 'on-hold'),
        'return' => 'objects',
        'type' => 'shop_order',
    );
    if ($days > 0) {
        $args['date_created'] = '>' . (time() - $days * DAY_IN_SECONDS);
    }
    $orders = wc_get_orders($args);
    $by_source = array();
    foreach (mf_attr_sources() as $k => $label) {
        $by_source[$k] = array('revenue' => 0.0, 'items' => 0, 'orders' => array());
    }
    $total_revenue = 0.0;
    $daily = array();
    foreach ($orders as $order) {
        $total_revenue += (float) $order->get_total();
        $date = $order->get_date_created() ? $order->get_date_created()->date('Y-m-d') : '';
        foreach ($order->get_items() as $item) {
            $src = $item->get_meta('_mf_widget_source');
            if ($src && isset($by_source[$src])) {
                $line = (float) $item->get_total();
                $by_source[$src]['revenue'] += $line;
                $by_source[$src]['items'] += (int) $item->get_quantity();
                $by_source[$src]['orders'][$order->get_id()] = true;
                if ($date) {
                    if (!isset($daily[$date])) {
                        $daily[$date] = 0.0;
                    }
                    $daily[$date] += $line;
                }
            }
        }
    }
    return array('by_source' => $by_source, 'total_revenue' => $total_revenue, 'daily' => $daily);
}

add_action('admin_menu', function () {
    add_submenu_page(
        'woocommerce',
        'Widget Performance',
        'Widget Performance',
        'manage_woocommerce',
        'mf-widget-performance',
        'mf_attr_dashboard_page'
    );
});

function mf_attr_money($n) {
    return function_exists('wc_price') ? wc_price($n) : ('$' . number_format((float) $n, 2));
}

function mf_attr_dashboard_page() {
    $labels = mf_attr_sources();
    $life = mf_attr_aggregate(0);
    $m30 = mf_attr_aggregate(30);

    $life_widget_rev = 0.0;
    foreach ($life['by_source'] as $s) {
        $life_widget_rev += $s['revenue'];
    }
    $m30_widget_rev = 0.0;
    foreach ($m30['by_source'] as $s) {
        $m30_widget_rev += $s['revenue'];
    }
    $m30_pct = $m30['total_revenue'] > 0 ? ($m30_widget_rev / $m30['total_revenue'] * 100) : 0;

    echo '<div class="wrap">';
    echo '<h1>Widget Performance</h1>';
    echo '<p>Revenue driven by the Mellow Fellow storefront widgets (cloned from Rebuy). Attribution is captured at checkout, so figures cover orders placed after this feature went live.</p>';

    echo '<div style="display:flex;gap:16px;flex-wrap:wrap;margin:16px 0">';
    echo '<div style="flex:1;min-width:220px;background:#fff;border:1px solid #dcdcde;border-radius:8px;padding:16px"><div style="font-size:26px;font-weight:700;color:#1d2327">' . mf_attr_money($life_widget_rev) . '</div><div style="color:#646970">Lifetime widget revenue</div></div>';
    echo '<div style="flex:1;min-width:220px;background:#fff;border:1px solid #dcdcde;border-radius:8px;padding:16px"><div style="font-size:26px;font-weight:700;color:#1d2327">' . mf_attr_money($m30_widget_rev) . '</div><div style="color:#646970">30-Day widget revenue</div></div>';
    echo '<div style="flex:1;min-width:220px;background:#fff;border:1px solid #dcdcde;border-radius:8px;padding:16px"><div style="font-size:26px;font-weight:700;color:#1d2327">' . number_format($m30_pct, 2) . '%</div><div style="color:#646970">30-Day widget % of total</div></div>';
    echo '</div>';

    echo '<h2>Sales by Type (Lifetime)</h2>';
    echo '<table class="widefat striped" style="max-width:820px"><thead><tr><th>Widget</th><th>Revenue</th><th>Items</th><th>Orders</th><th style="width:35%">Share</th></tr></thead><tbody>';
    $max = 0.0;
    foreach ($life['by_source'] as $data) {
        if ($data['revenue'] > $max) {
            $max = $data['revenue'];
        }
    }
    foreach ($labels as $key => $label) {
        $data = $life['by_source'][$key];
        $w = $max > 0 ? ($data['revenue'] / $max * 100) : 0;
        echo '<tr>';
        echo '<td><strong>' . esc_html($label) . '</strong></td>';
        echo '<td>' . mf_attr_money($data['revenue']) . '</td>';
        echo '<td>' . (int) $data['items'] . '</td>';
        echo '<td>' . count($data['orders']) . '</td>';
        echo '<td><div style="background:#e0e0e0;border-radius:4px;height:16px;width:100%"><div style="background:#2271b1;height:16px;border-radius:4px;width:' . esc_attr(number_format($w, 1)) . '%"></div></div></td>';
        echo '</tr>';
    }
    echo '</tbody></table>';

    echo '<h2 style="margin-top:28px">Daily Widget Sales (last 30 days)</h2>';
    $daily = $m30['daily'];
    if (empty($daily)) {
        echo '<p style="color:#646970">No attributed sales yet in the last 30 days.</p>';
    } else {
        ksort($daily);
        $dmax = max($daily);
        echo '<table class="widefat striped" style="max-width:620px"><thead><tr><th>Date</th><th>Revenue</th><th style="width:45%"></th></tr></thead><tbody>';
        foreach ($daily as $date => $rev) {
            $w = $dmax > 0 ? ($rev / $dmax * 100) : 0;
            echo '<tr><td>' . esc_html($date) . '</td><td>' . mf_attr_money($rev) . '</td><td><div style="background:#e0e0e0;border-radius:4px;height:12px;width:100%"><div style="background:#10866A;height:12px;border-radius:4px;width:' . esc_attr(number_format($w, 1)) . '%"></div></div></td></tr>';
        }
        echo '</tbody></table>';
    }

    echo '</div>';
}
