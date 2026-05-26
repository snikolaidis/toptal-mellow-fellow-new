<?php
/**
 * Plugin Name: Mellow Fellow Custom Post Types
 * Description: Registers Custom Post Types that mirror Shopify metaobjects, used to hold reusable content blocks (FAQs, specs, sale banners, etc.). All CPTs are exposed via WPGraphQL.
 * Version: 1.0.0
 * Author: Mellow Fellow Dev
 *
 * Drop this file into wp-content/mu-plugins/ on WP Engine.
 * WordPress auto-loads everything in mu-plugins, no activation needed.
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('init', function () {
    $cpts = [
        // FAQ types
        'device_faq' => [
            'singular' => 'Device FAQ',
            'plural'   => 'Device FAQs',
            'graphql_single' => 'deviceFaq',
            'graphql_plural' => 'deviceFaqs',
            'shopify_metaobject_type' => 'device_fa_qs',
        ],
        'blend_noid_faq' => [
            'singular' => 'Blend / Noid FAQ',
            'plural'   => 'Blend / Noid FAQs',
            'graphql_single' => 'blendNoidFaq',
            'graphql_plural' => 'blendNoidFaqs',
            'shopify_metaobject_type' => 'blend_noid_fa_qs',
        ],
        'general_faq' => [
            'singular' => 'General FAQ',
            'plural'   => 'General FAQs',
            'graphql_single' => 'generalFaq',
            'graphql_plural' => 'generalFaqs',
            'shopify_metaobject_type' => 'general_fa_qs',
        ],

        // Device + product info
        'device_spec' => [
            'singular' => 'Device Spec',
            'plural'   => 'Device Specs',
            'graphql_single' => 'deviceSpec',
            'graphql_plural' => 'deviceSpecs',
            'shopify_metaobject_type' => 'device_specs',
        ],
        'user_manual_spec' => [
            'singular' => 'User Manual Spec',
            'plural'   => 'User Manual Specs',
            'graphql_single' => 'userManualSpec',
            'graphql_plural' => 'userManualSpecs',
            'shopify_metaobject_type' => 'user_manual_device_specs',
        ],
        'noid_blend_description' => [
            'singular' => 'Noid / Blend Description',
            'plural'   => 'Noid / Blend Descriptions',
            'graphql_single' => 'noidBlendDescription',
            'graphql_plural' => 'noidBlendDescriptions',
            'shopify_metaobject_type' => 'noid_blend_descriptions',
        ],
        'cannabinoid_info' => [
            'singular' => 'Cannabinoid Info',
            'plural'   => 'Cannabinoid Info Entries',
            'graphql_single' => 'cannabinoidInfo',
            'graphql_plural' => 'cannabinoidInfos',
            'shopify_metaobject_type' => 'cannabinoid_info',
        ],
        'coa_link_group' => [
            'singular' => 'COA Link Group',
            'plural'   => 'COA Link Groups',
            'graphql_single' => 'coaLinkGroup',
            'graphql_plural' => 'coaLinkGroups',
            'shopify_metaobject_type' => 'coa_links_v_1',
        ],

        // Sale / promo content
        'current_sale' => [
            'singular' => 'Current Sale',
            'plural'   => 'Current Sales',
            'graphql_single' => 'currentSale',
            'graphql_plural' => 'currentSales',
            'shopify_metaobject_type' => 'current_sale_1_metaobject',
        ],
        'holiday_sale' => [
            'singular' => 'Holiday Sale',
            'plural'   => 'Holiday Sales',
            'graphql_single' => 'holidaySale',
            'graphql_plural' => 'holidaySales',
            'shopify_metaobject_type' => 'holiday_sale_info_and_images',
        ],

        // Collection / nav helpers
        'mellow_matcher' => [
            'singular' => 'Mellow Matcher Block',
            'plural'   => 'Mellow Matcher Blocks',
            'graphql_single' => 'mellowMatcher',
            'graphql_plural' => 'mellowMatchers',
            'shopify_metaobject_type' => 'mellow_matcher_on_page_display',
        ],
        'related_collection_set' => [
            'singular' => 'Related Collection Set',
            'plural'   => 'Related Collection Sets',
            'graphql_single' => 'relatedCollectionSet',
            'graphql_plural' => 'relatedCollectionSets',
            'shopify_metaobject_type' => 'related_collections',
        ],
        'related_noids_blends' => [
            'singular' => 'Related Noids / Blends Set',
            'plural'   => 'Related Noids / Blends Sets',
            'graphql_single' => 'relatedNoidsBlends',
            'graphql_plural' => 'relatedNoidsBlendsSets',
            'shopify_metaobject_type' => 'related_collections_noids_blends',
        ],
        'main_collection_links' => [
            'singular' => 'Main Collection Links',
            'plural'   => 'Main Collection Links Sets',
            'graphql_single' => 'mainCollectionLinks',
            'graphql_plural' => 'mainCollectionLinksSets',
            'shopify_metaobject_type' => 'main_collection_relevant_links',
        ],
        'blend_group' => [
            'singular' => 'Blend Group',
            'plural'   => 'Blend Groups',
            'graphql_single' => 'blendGroup',
            'graphql_plural' => 'blendGroups',
            'shopify_metaobject_type' => 'blend_groups',
        ],
        'blend_group_set' => [
            'singular' => 'Blend Group Set',
            'plural'   => 'Blend Group Sets',
            'graphql_single' => 'blendGroupSet',
            'graphql_plural' => 'blendGroupSets',
            'shopify_metaobject_type' => 'groups_of_blend_groups',
        ],

        // Learn content
        'learn_blend_content' => [
            'singular' => 'Learn About Blends Entry',
            'plural'   => 'Learn About Blends Entries',
            'graphql_single' => 'learnBlendContent',
            'graphql_plural' => 'learnBlendContents',
            'shopify_metaobject_type' => 'learn_about_noid_blend_content',
        ],
        'learn_noid_content' => [
            'singular' => 'Learn About Noids Entry',
            'plural'   => 'Learn About Noids Entries',
            'graphql_single' => 'learnNoidContent',
            'graphql_plural' => 'learnNoidContents',
            'shopify_metaobject_type' => 'learn_about_noids_content',
        ],

        // Reviews + badges
        'review_highlight' => [
            'singular' => 'Review Highlight',
            'plural'   => 'Review Highlights',
            'graphql_single' => 'reviewHighlight',
            'graphql_plural' => 'reviewHighlights',
            'shopify_metaobject_type' => 'monthly_review_highlights',
        ],
        'mf_badge' => [
            'singular' => 'Badge',
            'plural'   => 'Badges',
            'graphql_single' => 'badge',
            'graphql_plural' => 'badges',
            'shopify_metaobject_type' => 'shopify_badges_custom',
        ],
    ];

    foreach ($cpts as $slug => $cfg) {
        register_post_type($slug, [
            'labels' => [
                'name'          => $cfg['plural'],
                'singular_name' => $cfg['singular'],
                'menu_name'     => $cfg['plural'],
                'add_new_item'  => 'Add New ' . $cfg['singular'],
                'edit_item'     => 'Edit ' . $cfg['singular'],
                'new_item'      => 'New ' . $cfg['singular'],
                'view_item'     => 'View ' . $cfg['singular'],
                'search_items'  => 'Search ' . $cfg['plural'],
                'not_found'     => 'No ' . strtolower($cfg['plural']) . ' found',
            ],
            'public'              => false,
            'publicly_queryable'  => false,
            'show_ui'             => true,
            'show_in_menu'        => 'mellow-fellow-content',
            'show_in_admin_bar'   => false,
            'show_in_rest'        => true,
            'rest_base'           => $slug,
            'show_in_graphql'     => true,
            'graphql_single_name' => $cfg['graphql_single'],
            'graphql_plural_name' => $cfg['graphql_plural'],
            'menu_position'       => 25,
            'menu_icon'           => 'dashicons-screenoptions',
            'has_archive'         => false,
            'hierarchical'        => false,
            'supports'            => ['title', 'editor', 'custom-fields', 'revisions'],
            'capability_type'     => 'post',
            'rewrite'             => false,
        ]);

        // Stash the Shopify metaobject type that this CPT corresponds to,
        // so the migration scripts can find the right CPT by the Shopify type name.
        register_post_meta($slug, '_shopify_metaobject_type', [
            'type' => 'string',
            'single' => true,
            'show_in_rest' => true,
        ]);
        register_post_meta($slug, '_shopify_metaobject_id', [
            'type' => 'string',
            'single' => true,
            'show_in_rest' => true,
        ]);
        register_post_meta($slug, '_shopify_metaobject_handle', [
            'type' => 'string',
            'single' => true,
            'show_in_rest' => true,
        ]);
    }
});

/**
 * Top-level admin menu container for all the CPTs above.
 * Keeps them grouped instead of scattered down the side menu.
 */
add_action('admin_menu', function () {
    add_menu_page(
        'Mellow Fellow Content',
        'MF Content',
        'edit_posts',
        'mellow-fellow-content',
        '',
        'dashicons-store',
        24
    );
}, 9);
