<?php
/**
 * Backfill _shopify_id post meta on WooCommerce products from the Shopify export.
 *
 * Matches each Woo product to its Shopify product by slug (Woo post_name == Shopify
 * handle), then stores the numeric Shopify product id in _shopify_id. Matching by
 * slug is stable across re-imports, unlike the Woo post id. The Mellow Fellow Shopify
 * ID plugin reads _shopify_id and exposes the numeric id as `shopifyId` on WPGraphQL,
 * which the Klaviyo reviews widget uses as its product key.
 *
 * Input is the Shopify products export (JSONL, one product per line with `id` and
 * `handle`), e.g. migration/data/products.jsonl.
 *
 * Run: wp eval-file backfill-shopify-id.php /absolute/path/to/products.jsonl
 * With no argument it looks for products.jsonl next to this script.
 */

if (!defined('WP_CLI') || !WP_CLI) {
    fwrite(STDERR, "This script must run under WP-CLI (wp eval-file).\n");
    exit(1);
}

$path = isset($args[0]) ? $args[0] : __DIR__ . '/products.jsonl';
if (!file_exists($path)) {
    WP_CLI::error('Export file not found: ' . $path);
}

$fh = fopen($path, 'r');
if (!$fh) {
    WP_CLI::error('Could not open export file: ' . $path);
}

$updated = 0;
$unchanged = 0;
$no_match = 0;
$no_id = 0;
$lines = 0;
$missing = array();

while (($line = fgets($fh)) !== false) {
    $line = trim($line);
    if ($line === '') {
        continue;
    }
    $lines++;
    $rec = json_decode($line, true);
    if (!is_array($rec)) {
        continue;
    }
    $handle = isset($rec['handle']) ? (string) $rec['handle'] : '';
    $gid = isset($rec['id']) ? (string) $rec['id'] : '';
    if ($handle === '' || $gid === '') {
        $no_id++;
        continue;
    }
    $numeric = '';
    if (preg_match('/(\d+)$/', $gid, $m)) {
        $numeric = $m[1];
    }
    if ($numeric === '') {
        $no_id++;
        continue;
    }
    $found = get_posts(array(
        'name' => $handle,
        'post_type' => 'product',
        'post_status' => array('publish', 'draft', 'pending', 'private'),
        'numberposts' => 1,
        'fields' => 'ids',
        'suppress_filters' => true,
    ));
    if (empty($found)) {
        $no_match++;
        if (count($missing) < 20) {
            $missing[] = $handle;
        }
        continue;
    }
    $post_id = (int) $found[0];
    $existing = get_post_meta($post_id, '_shopify_id', true);
    if ((string) $existing === (string) $numeric) {
        $unchanged++;
        continue;
    }
    update_post_meta($post_id, '_shopify_id', $numeric);
    $updated++;
}
fclose($fh);

if (!empty($missing)) {
    WP_CLI::log('No Woo product for handles (first 20): ' . implode(', ', $missing));
}

WP_CLI::success(sprintf(
    'Backfill done. updated=%d unchanged=%d no_woo_match=%d no_id=%d lines=%d',
    $updated,
    $unchanged,
    $no_match,
    $no_id,
    $lines
));
