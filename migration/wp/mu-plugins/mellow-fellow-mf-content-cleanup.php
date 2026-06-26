<?php
/* Plugin Name: Mellow Fellow MF Content Cleanup */

if (!defined('ABSPATH')) {
    exit;
}

add_action('admin_init', function () {
    if (get_option('mf_content_cleanup_done')) {
        return;
    }

    global $wpdb;

    $types = array(
        'device_faq', 'blend_noid_faq', 'general_faq', 'device_spec', 'user_manual_spec',
        'noid_description', 'cannabinoid_info', 'coa_link_group', 'current_sale', 'holiday_sale',
        'mellow_matcher', 'related_coll_set', 'related_noids_blends', 'main_coll_links',
        'blend_group', 'blend_group_set', 'learn_blend_content', 'learn_noid_content',
        'review_highlight', 'mf_badge',
    );

    $placeholders = implode(',', array_fill(0, count($types), '%s'));
    $ids = $wpdb->get_col($wpdb->prepare(
        "SELECT ID FROM {$wpdb->posts} WHERE post_type IN ($placeholders)",
        $types
    ));

    if (empty($ids)) {
        update_option('mf_content_cleanup_done', 1);
        return;
    }

    $backup = array();
    foreach ($ids as $id) {
        $post = get_post($id, ARRAY_A);
        if (!$post) {
            continue;
        }
        $post['meta'] = get_post_meta($id);
        $backup[] = $post;
    }

    $upload = wp_upload_dir();
    $file = trailingslashit($upload['basedir']) . 'mf-content-backup.json';
    file_put_contents($file, wp_json_encode($backup));

    $deleted = 0;
    foreach ($ids as $id) {
        if (wp_delete_post($id, true)) {
            $deleted++;
        }
    }

    update_option('mf_content_cleanup_done', 1);
    error_log('[MF cleanup] backed up and deleted ' . $deleted . ' MF Content posts to ' . $file);
});
