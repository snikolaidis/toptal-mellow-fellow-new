<?php
/**
 * Plugin Name: Mellow Fellow Shopify ID
 * Description: Exposes the migrated numeric Shopify product ID on WPGraphQL products, used to map Klaviyo reviews.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('graphql_register_types', function () {
    register_graphql_field('Product', 'shopifyId', [
        'type' => 'String',
        'description' => 'Numeric Shopify product ID from the migration, used to map reviews',
        'resolve' => function ($source) {
            $post_id = null;
            if (is_object($source)) {
                if (isset($source->databaseId)) {
                    $post_id = $source->databaseId;
                } elseif (isset($source->ID)) {
                    $post_id = $source->ID;
                }
            }
            if (!$post_id) {
                return null;
            }
            $gid = get_post_meta($post_id, '_shopify_id', true);
            if (!$gid) {
                return null;
            }
            if (preg_match('/(\d+)$/', (string) $gid, $matches)) {
                return $matches[1];
            }
            return (string) $gid;
        },
    ]);
});
