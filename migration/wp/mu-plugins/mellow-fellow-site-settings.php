<?php
/**
 * Plugin Name: Mellow Fellow - Site Settings (ACF Options Page)
 * Description: Registers a "Site Settings" ACF options page (social network links etc.)
 *              and exposes it to WPGraphQL for the headless frontend.
 * Version: 1.0.0
 * Requires Plugins: advanced-custom-fields-pro, wp-graphql, wp-graphql-acf
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'acf/init', 'mf_register_site_settings_options_page' );
add_action( 'acf/init', 'mf_register_site_settings_fields' );
add_action( 'acf/init', 'mf_register_landing_page_icon_row_fields' );
add_action( 'acf/init', 'mf_register_value_props_fields' );
add_action( 'acf/init', 'mf_register_announcement_bar_fields' );
add_action( 'acf/init', 'mf_register_mega_menu_featured_fields' );
add_action( 'acf/init', 'mf_register_promotional_slides_fields' );

function mf_register_site_settings_options_page() {
    if ( ! function_exists( 'acf_add_options_page' ) ) {
        return; // ACF Pro not active
    }

    acf_add_options_page( [
        'page_title'        => 'Site Settings',
        'menu_title'        => 'Site Settings',
        'menu_slug'         => 'mf-site-settings',
        'capability'        => 'manage_options',
        'position'          => 61, // just below Appearance
        'icon_url'          => 'dashicons-admin-generic',
        'redirect'          => false,
        'autoload'          => true, // options load with one query on every request
        'update_button'     => 'Save Settings',
        'updated_message'   => 'Site settings saved.',
        // WPGraphQL for ACF — exposes this page at the root of the schema
        'show_in_graphql'   => true,
        'graphql_type_name' => 'SiteSettings',
    ] );
}

function mf_register_site_settings_fields() {
    if ( ! function_exists( 'acf_add_local_field_group' ) ) {
        return;
    }

    acf_add_local_field_group( [
        'key'    => 'group_mf_social_links',
        'title'  => 'Social Links',
        'fields' => [
            [
                'key'             => 'field_mf_social_instagram',
                'label'           => 'Instagram URL',
                'name'            => 'instagram_url',
                'type'            => 'url',
                'placeholder'     => 'https://www.instagram.com/…',
                'show_in_graphql' => 1,
            ],
            [
                'key'             => 'field_mf_social_twitter',
                'label'           => 'X / Twitter URL',
                'name'            => 'twitter_url',
                'type'            => 'url',
                'placeholder'     => 'https://x.com/…',
                'show_in_graphql' => 1,
            ],
            [
                'key'             => 'field_mf_social_facebook',
                'label'           => 'Facebook URL',
                'name'            => 'facebook_url',
                'type'            => 'url',
                'show_in_graphql' => 1,
            ],
            [
                'key'             => 'field_mf_social_tiktok',
                'label'           => 'TikTok URL',
                'name'            => 'tiktok_url',
                'type'            => 'url',
                'show_in_graphql' => 1,
            ],
            [
                'key'             => 'field_mf_social_youtube',
                'label'           => 'YouTube URL',
                'name'            => 'youtube_url',
                'type'            => 'url',
                'show_in_graphql' => 1,
            ],
        ],
        'location' => [ [ [
            'param'    => 'options_page',
            'operator' => '==',
            'value'    => 'mf-site-settings',
        ] ] ],
        'active'             => true,
        'show_in_graphql'    => 1,
        'graphql_field_name' => 'socialLinks',
    ] );
}

function mf_register_value_props_fields() {
    if ( ! function_exists( 'acf_add_local_field_group' ) ) {
        return;
    }

    acf_add_local_field_group( [
        'key'    => 'group_mf_value_props',
        'title'  => 'Value Props',
        'fields' => [
            [
                'key'          => 'field_mf_vp_items',
                'label'        => 'Value Props',
                'name'         => 'value_props',
                'type'         => 'repeater',
                'instructions' => 'Global value props (icon + short title), migrated from the Shopify "Set of value props" section. Rendered wherever the "Value Props Set" block is placed. Drag rows to set the display order.',
                'layout'       => 'block',
                'button_label' => 'Add Value Prop',
                'min'          => 0,
                'sub_fields'   => [
                    [
                        'key'           => 'field_mf_vp_image',
                        'label'         => 'Image',
                        'name'          => 'image',
                        'type'          => 'image',
                        'return_format' => 'array',
                        'preview_size'  => 'thumbnail',
                        'required'      => 1,
                        'wrapper'       => [ 'width' => '30' ],
                    ],
                    [
                        'key'      => 'field_mf_vp_title',
                        'label'    => 'Title',
                        'name'     => 'title',
                        'type'     => 'text',
                        'required' => 1,
                        'wrapper'  => [ 'width' => '30' ],
                    ],
                    [
                        'key'           => 'field_mf_vp_width_mobile',
                        'label'         => 'Image width — mobile',
                        'name'          => 'width_mobile',
                        'type'          => 'number',
                        'default_value' => 20,
                        'append'        => 'px',
                        'wrapper'       => [ 'width' => '20' ],
                    ],
                    [
                        'key'           => 'field_mf_vp_width_desktop',
                        'label'         => 'Image width — desktop',
                        'name'          => 'width_desktop',
                        'type'          => 'number',
                        'default_value' => 25,
                        'append'        => 'px',
                        'wrapper'       => [ 'width' => '20' ],
                    ],
                ],
            ],
        ],
        'location' => [ [ [
            'param'    => 'options_page',
            'operator' => '==',
            'value'    => 'mf-site-settings',
        ] ] ],
        'active'             => true,
        'show_in_graphql'    => 1,
        'graphql_field_name' => 'valuePropsSet',
    ] );
}

function mf_register_landing_page_icon_row_fields() {
    if ( ! function_exists( 'acf_add_local_field_group' ) ) {
        return;
    }

    acf_add_local_field_group( [
        'key'    => 'group_mf_landing_icon_row',
        'title'  => 'Landing Page Icon Row',
        'fields' => [
            [
                'key'         => 'field_mf_lir_icons',
                'label'       => 'Icons',
                'name'        => 'icons',
                'type'        => 'repeater',
                'instructions' => 'Shown as a static row on every landing page. Drag rows to set the display order.',
                'layout'      => 'block',
                'button_label' => 'Add Icon',
                'min'         => 0,
                'sub_fields'  => [
                    [
                        'key'             => 'field_mf_lir_icon',
                        'label'           => 'Icon',
                        'name'            => 'icon',
                        'type'            => 'image',
                        'return_format'   => 'array',
                        'preview_size'    => 'medium',
                        'required'        => 1,
                        'wrapper'         => [ 'width' => '33' ],
                    ],
                    [
                        'key'      => 'field_mf_lir_label',
                        'label'    => 'Label',
                        'name'     => 'label',
                        'type'     => 'text',
                        'required' => 0,
                        'wrapper'  => [ 'width' => '33' ],
                    ],
                    [
                        'key'         => 'field_mf_lir_link',
                        'label'       => 'Link',
                        'name'        => 'link',
                        'type'        => 'link',
                        'instructions' => 'Optional. Makes the icon clickable.',
                        'required'    => 0,
                        'wrapper'     => [ 'width' => '34' ],
                    ],
                ],
            ],
        ],
        'location' => [ [ [
            'param'    => 'options_page',
            'operator' => '==',
            'value'    => 'mf-site-settings',
        ] ] ],
        'active'             => true,
        'show_in_graphql'    => 1,
        'graphql_field_name' => 'landingPageIconRow',
    ] );
}

function mf_register_announcement_bar_fields() {
    if ( ! function_exists( 'acf_add_local_field_group' ) ) {
        return;
    }

    acf_add_local_field_group( [
        'key'    => 'group_mf_announcement_bar',
        'title'  => 'Announcement Bar',
        'fields' => [
            [
                'key'          => 'field_mf_ann_items',
                'label'        => 'Announcements',
                'name'         => 'items',
                'type'         => 'repeater',
                'instructions' => 'The rotating bar above the site header. Drag rows to set the display order. Leave empty to keep the built-in defaults.',
                'layout'       => 'block',
                'button_label' => 'Add Announcement',
                'min'          => 0,
                'sub_fields'   => [
                    [
                        'key'      => 'field_mf_ann_label',
                        'label'    => 'Label',
                        'name'     => 'label',
                        'type'     => 'text',
                        'required' => 1,
                        'wrapper'  => [ 'width' => '30' ],
                    ],
                    [
                        'key'           => 'field_mf_ann_label_color',
                        'label'         => 'Label colour',
                        'name'          => 'label_color',
                        'type'          => 'color_picker',
                        'instructions'  => 'Colours the label text only, not the bar.',
                        'return_format' => 'string',
                        'required'      => 0,
                        'wrapper'       => [ 'width' => '20' ],
                    ],
                    [
                        'key'           => 'field_mf_ann_icon',
                        'label'         => 'Icon',
                        'name'          => 'icon',
                        'type'          => 'image',
                        'instructions'  => 'Rendered at 16x16. SVG is fine.',
                        'return_format' => 'array',
                        'preview_size'  => 'thumbnail',
                        'required'      => 0,
                        'wrapper'       => [ 'width' => '25' ],
                    ],
                    [
                        'key'          => 'field_mf_ann_link',
                        'label'        => 'Link',
                        'name'         => 'link',
                        'type'         => 'link',
                        'instructions' => 'Optional. Makes the announcement clickable.',
                        'required'     => 0,
                        'wrapper'      => [ 'width' => '25' ],
                    ],
                ],
            ],
        ],
        'location' => [ [ [
            'param'    => 'options_page',
            'operator' => '==',
            'value'    => 'mf-site-settings',
        ] ] ],
        'active'             => true,
        'show_in_graphql'    => 1,
        'graphql_field_name' => 'announcementBar',
    ] );
}

function mf_register_mega_menu_featured_fields() {
    if ( ! function_exists( 'acf_add_local_field_group' ) ) {
        return;
    }

    acf_add_local_field_group( [
        'key'    => 'group_mf_mega_menu_featured',
        'title'  => 'Mega Menu Featured Panel',
        'fields' => [
            [
                'key'           => 'field_mf_feat_image',
                'label'         => 'Image',
                'name'          => 'image',
                'type'          => 'image',
                'return_format' => 'array',
                'preview_size'  => 'medium',
                'required'      => 0,
                'wrapper'       => [ 'width' => '50' ],
            ],
            [
                'key'      => 'field_mf_feat_caption',
                'label'    => 'Caption',
                'name'     => 'caption',
                'type'     => 'text',
                'required' => 0,
                'wrapper'  => [ 'width' => '50' ],
            ],
            [
                'key'          => 'field_mf_feat_links',
                'label'        => 'Links',
                'name'         => 'links',
                'type'         => 'repeater',
                'instructions' => 'Up to four text links below the image. Drag rows to set the display order.',
                'layout'       => 'table',
                'button_label' => 'Add Link',
                'min'          => 0,
                'max'          => 4,
                'sub_fields'   => [
                    [
                        'key'      => 'field_mf_feat_row_label',
                        'label'    => 'Label',
                        'name'     => 'label',
                        'type'     => 'text',
                        'required' => 1,
                    ],
                    [
                        'key'      => 'field_mf_feat_row_link',
                        'label'    => 'Link',
                        'name'     => 'link',
                        'type'     => 'link',
                        'required' => 1,
                    ],
                ],
            ],
        ],
        'location' => [ [ [
            'param'    => 'options_page',
            'operator' => '==',
            'value'    => 'mf-site-settings',
        ] ] ],
        'active'             => true,
        'show_in_graphql'    => 1,
        'graphql_field_name' => 'megaMenuFeatured',
    ] );
}

/**
 * One shared set of promotional slides. The mega menu's Featured carousel and
 * the Hero Slider block both read this, so a slide is authored once instead of
 * being kept in step by hand in two places. Image fields mirror the hero-slider
 * block (mobile / tablet / desktop) so the same row serves both.
 */
function mf_register_promotional_slides_fields() {
    if ( ! function_exists( 'acf_add_local_field_group' ) ) {
        return;
    }

    acf_add_local_field_group( [
        'key'    => 'group_mf_promotional_slides',
        'title'  => 'Promotional Slides',
        'fields' => [
            [
                'key'          => 'field_mf_promo_slides',
                'label'        => 'Slides',
                'name'         => 'slides',
                'type'         => 'repeater',
                'instructions' => 'Shared by the mega menu Featured carousel and the Hero Slider block. Drag rows to set the display order.',
                'layout'       => 'block',
                'button_label' => 'Add Slide',
                'min'          => 0,
                'sub_fields'   => [
                    [
                        'key'      => 'field_mf_promo_caption',
                        'label'    => 'Caption',
                        'name'     => 'caption',
                        'type'     => 'text',
                        'required' => 0,
                        'wrapper'  => [ 'width' => '50' ],
                    ],
                    [
                        'key'      => 'field_mf_promo_link',
                        'label'    => 'Link',
                        'name'     => 'link',
                        'type'     => 'link',
                        'required' => 0,
                        'wrapper'  => [ 'width' => '50' ],
                    ],
                    [
                        'key'           => 'field_mf_promo_desktop_image',
                        'label'         => 'Desktop Image',
                        'name'          => 'desktop_image',
                        'type'          => 'image',
                        'return_format' => 'array',
                        'preview_size'  => 'medium',
                        'required'      => 0,
                        'wrapper'       => [ 'width' => '34' ],
                    ],
                    [
                        'key'           => 'field_mf_promo_tablet_image',
                        'label'         => 'Tablet Image',
                        'name'          => 'tablet_image',
                        'type'          => 'image',
                        'return_format' => 'array',
                        'preview_size'  => 'medium',
                        'required'      => 0,
                        'wrapper'       => [ 'width' => '33' ],
                    ],
                    [
                        'key'           => 'field_mf_promo_mobile_image',
                        'label'         => 'Mobile Image',
                        'name'          => 'mobile_image',
                        'type'          => 'image',
                        'return_format' => 'array',
                        'preview_size'  => 'medium',
                        'required'      => 0,
                        'wrapper'       => [ 'width' => '33' ],
                    ],
                ],
            ],
        ],
        'location' => [ [ [
            'param'    => 'options_page',
            'operator' => '==',
            'value'    => 'mf-site-settings',
        ] ] ],
        'active'             => true,
        'show_in_graphql'    => 1,
        'graphql_field_name' => 'promotionalSlides',
    ] );
}
