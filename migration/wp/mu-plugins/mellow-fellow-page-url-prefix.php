<?php
/**
 * Plugin Name: Pages URL Prefix
 * Description: Adds /pages/ before WordPress page URLs.
 * Author: Hanan Abu Kwaider
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Add /pages/ to generated page permalinks.
 */
function hak_add_pages_prefix_to_page_link($link, $post_id, $sample = false)
{
    $post = get_post($post_id);

    if (!$post || 'page' !== $post->post_type) {
        return $link;
    }

    $page_path = get_page_uri($post);

    if (!$page_path) {
        return $link;
    }

    return home_url(user_trailingslashit('pages/' . $page_path));
}
add_filter('page_link', 'hak_add_pages_prefix_to_page_link', 10, 3);

/**
 * Resolve /pages/example/ URLs to WordPress pages.
 */
function hak_register_pages_prefix_rewrite()
{
    add_rewrite_rule(
        '^pages/(.+?)/?$',
        'index.php?pagename=$matches[1]',
        'top'
    );
}
add_action('init', 'hak_register_pages_prefix_rewrite');

/**
 * Flush rewrite rules once when this MU plugin version changes.
 */
function hak_maybe_flush_pages_prefix_rewrite()
{
    $version = '1.0.0';
    $saved_version = get_option('hak_pages_prefix_version');

    if ($saved_version === $version) {
        return;
    }

    hak_register_pages_prefix_rewrite();
    flush_rewrite_rules(false);

    update_option('hak_pages_prefix_version', $version);
}
add_action('admin_init', 'hak_maybe_flush_pages_prefix_rewrite');