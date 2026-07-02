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
