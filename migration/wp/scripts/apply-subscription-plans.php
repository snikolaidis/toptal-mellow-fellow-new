<?php

if (!defined('WP_CLI') || !WP_CLI) {
    fwrite(STDERR, "This script must run under WP-CLI (wp eval-file).\n");
    exit(1);
}

global $wpdb;

$path = isset($args[0]) ? $args[0] : __DIR__ . '/subscription-plans-map.jsonl';
$remove = isset($args[1]) && $args[1] === 'remove';
if (!file_exists($path)) {
    WP_CLI::error('Map file not found: ' . $path);
}
$fh = fopen($path, 'r');
if (!$fh) {
    WP_CLI::error('Cannot open map file: ' . $path);
}

$updated = 0;
$scheme_count = 0;
$no_match = 0;
$lines = 0;
$missing = array();

while (($line = fgets($fh)) !== false) {
    $line = trim($line);
    if ($line === '') {
        continue;
    }
    $lines++;
    $rec = json_decode($line, true);
    if (!is_array($rec) || empty($rec['pid'])) {
        continue;
    }
    $sid = (string) $rec['pid'];
    $post_id = (int) $wpdb->get_var($wpdb->prepare(
        "SELECT pm.post_id FROM {$wpdb->postmeta} pm JOIN {$wpdb->posts} p ON p.ID = pm.post_id " .
        "WHERE pm.meta_key = '_shopify_id' AND pm.meta_value = %s " .
        "AND p.post_type = 'product' AND p.post_status IN ('publish','draft','pending','private') " .
        "ORDER BY (p.post_status = 'publish') DESC, p.ID ASC LIMIT 1",
        $sid
    ));
    if (!$post_id) {
        $no_match++;
        if (count($missing) < 20) {
            $missing[] = $sid;
        }
        continue;
    }

    if ($remove) {
        delete_post_meta($post_id, '_wcsatt_schemes');
        delete_post_meta($post_id, '_wcsatt_force_subscription');
        if (function_exists('wc_delete_product_transients')) {
            wc_delete_product_transients($post_id);
        }
        $updated++;
        continue;
    }

    $schemes = array();
    if (!empty($rec['schemes']) && is_array($rec['schemes'])) {
        foreach ($rec['schemes'] as $s) {
            $period = in_array(($s['period'] ?? 'month'), array('day', 'week', 'month', 'year'), true) ? $s['period'] : 'month';
            $interval = max(1, (int) ($s['interval'] ?? 1));
            $disc = (string) (float) ($s['discount'] ?? 0);
            $key = $interval . '_' . $period . '_0';
            $schemes[$key] = array(
                'subscription_period'          => $period,
                'subscription_period_interval' => (string) $interval,
                'subscription_length'          => '0',
                'subscription_trial_period'    => 'day',
                'subscription_trial_length'    => '0',
                'subscription_pricing_method'  => 'inherit',
                'subscription_regular_price'   => '',
                'subscription_sale_price'      => '',
                'subscription_discount'        => $disc,
                'id'                           => $key,
            );
        }
    }
    if (empty($schemes)) {
        continue;
    }
    update_post_meta($post_id, '_wcsatt_schemes', $schemes);
    update_post_meta($post_id, '_wcsatt_force_subscription', 'no');
    if (function_exists('wc_delete_product_transients')) {
        wc_delete_product_transients($post_id);
    }
    $updated++;
    $scheme_count += count($schemes);
}
fclose($fh);

if (!empty($missing)) {
    WP_CLI::log('No Woo product for shopify ids (first 20): ' . implode(', ', $missing));
}

if ($remove) {
    WP_CLI::success(sprintf('Removed plans. products=%d no_woo_match=%d lines=%d', $updated, $no_match, $lines));
} else {
    WP_CLI::success(sprintf('Applied plans. products=%d schemes=%d no_woo_match=%d lines=%d', $updated, $scheme_count, $no_match, $lines));
}
