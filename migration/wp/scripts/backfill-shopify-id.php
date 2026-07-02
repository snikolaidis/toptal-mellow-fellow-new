<?php

if (!defined('WP_CLI') || !WP_CLI) {
    fwrite(STDERR, "This script must run under WP-CLI (wp eval-file).\n");
    exit(1);
}

global $wpdb;

$path = isset($args[0]) ? $args[0] : __DIR__ . '/shopify-handle-map.jsonl';
if (!file_exists($path)) {
    WP_CLI::error('Export file not found: ' . $path);
}

$records = array();
$fh = fopen($path, 'r');
if (!$fh) {
    WP_CLI::error('Cannot open export file: ' . $path);
}
while (($line = fgets($fh)) !== false) {
    $line = trim($line);
    if ($line === '') {
        continue;
    }
    $rec = json_decode($line, true);
    if (!is_array($rec)) {
        continue;
    }
    $handle = isset($rec['handle']) ? (string) $rec['handle'] : '';
    $gid = isset($rec['id']) ? (string) $rec['id'] : '';
    $title = isset($rec['title']) ? (string) $rec['title'] : '';
    $numeric = '';
    if (preg_match('/(\d+)$/', $gid, $m)) {
        $numeric = $m[1];
    }
    if ($handle === '' || $numeric === '') {
        continue;
    }
    $records[] = array('handle' => $handle, 'numeric' => $numeric, 'title' => $title);
}
fclose($fh);

$updated = 0;
$unchanged = 0;
$by_slug = 0;
$by_title = 0;
$no_match = 0;
$remaining = array();

foreach ($records as $r) {
    $found = get_posts(array(
        'name' => $r['handle'],
        'post_type' => 'product',
        'post_status' => array('publish', 'draft', 'pending', 'private'),
        'numberposts' => 1,
        'fields' => 'ids',
        'suppress_filters' => true,
    ));
    if (empty($found)) {
        $remaining[] = $r;
        continue;
    }
    $pid = (int) $found[0];
    $existing = get_post_meta($pid, '_shopify_id', true);
    if ((string) $existing === $r['numeric']) {
        $unchanged++;
    } else {
        update_post_meta($pid, '_shopify_id', $r['numeric']);
        $updated++;
        $by_slug++;
    }
}

foreach ($remaining as $r) {
    if ($r['title'] === '') {
        $no_match++;
        continue;
    }
    $ids = $wpdb->get_col($wpdb->prepare(
        "SELECT p.ID FROM {$wpdb->posts} p " .
        "LEFT JOIN {$wpdb->postmeta} pm ON pm.post_id = p.ID AND pm.meta_key = '_shopify_id' " .
        "WHERE p.post_type = 'product' AND p.post_status IN ('publish','draft','pending','private') " .
        "AND p.post_title = %s AND (pm.meta_id IS NULL OR pm.meta_value = '') LIMIT 2",
        $r['title']
    ));
    if (count($ids) === 1) {
        update_post_meta((int) $ids[0], '_shopify_id', $r['numeric']);
        $updated++;
        $by_title++;
    } else {
        $no_match++;
    }
}

WP_CLI::success(sprintf(
    'Backfill done. updated=%d (slug=%d title=%d) unchanged=%d no_match=%d total=%d',
    $updated, $by_slug, $by_title, $unchanged, $no_match, count($records)
));
