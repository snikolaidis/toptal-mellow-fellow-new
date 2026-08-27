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
add_action( 'acf/init', 'mf_register_loyalty_tiers_fields' );
add_action( 'admin_init', 'mf_seed_loyalty_tiers_from_home_page' );
add_action( 'admin_init', 'mf_seed_promotional_slides_from_home_page' );
add_action( 'graphql_register_types', 'mf_register_hero_slider_shared_slides', 20 );

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


/**
 * Fam Club tiers, shared by the home page LoyaltyTiers block and the mood pages.
 * Field names and nesting mirror the block's own group (acf-json/group_loyalty_tiers.json)
 * exactly, and it is exposed under the same `loyaltyTiers` name, so a page can hand
 * siteSettings straight to the LoyaltyTiers component without reshaping anything.
 * Changing a field name here without changing it there silently drops that field.
 */
function mf_register_loyalty_tiers_fields() {
    if ( ! function_exists( 'acf_add_local_field_group' ) ) {
        return;
    }

    acf_add_local_field_group( [
        'key'    => 'group_mf_loyalty_tiers',
        'title'  => 'Fam Club Tiers',
        'fields' => [
            [
                'key'           => 'field_mf_lt_badge_icon',
                'label'         => 'Badge Icon',
                'name'          => 'badge_icon',
                'type'          => 'image',
                'return_format' => 'array',
                'preview_size'  => 'thumbnail',
                'required'      => 0,
                'wrapper'       => [ 'width' => '25' ],
            ],
            [
                'key'      => 'field_mf_lt_badge_text',
                'label'    => 'Badge Text',
                'name'     => 'badge_text',
                'type'     => 'text',
                'required' => 0,
                'wrapper'  => [ 'width' => '75' ],
            ],
            [
                'key'      => 'field_mf_lt_heading',
                'label'    => 'Heading',
                'name'     => 'heading',
                'type'     => 'text',
                'required' => 0,
            ],
            [
                'key'      => 'field_mf_lt_body',
                'label'    => 'Body',
                'name'     => 'body',
                'type'     => 'textarea',
                'rows'     => 3,
                'required' => 0,
            ],
            [
                'key'      => 'field_mf_lt_cta',
                'label'    => 'CTA',
                'name'     => 'cta',
                'type'     => 'link',
                'required' => 0,
                'wrapper'  => [ 'width' => '50' ],
            ],
            [
                'key'      => 'field_mf_lt_tiers_title',
                'label'    => 'Tiers Title',
                'name'     => 'tiers_title',
                'type'     => 'text',
                'required' => 0,
                'wrapper'  => [ 'width' => '50' ],
            ],
            [
                'key'          => 'field_mf_lt_tiers',
                'label'        => 'Tiers',
                'name'         => 'tiers',
                'type'         => 'repeater',
                'instructions' => 'One row per tier, in the order they should appear.',
                'layout'       => 'block',
                'button_label' => 'Add Tier',
                'min'          => 0,
                'sub_fields'   => [
                    [
                        'key'           => 'field_mf_lt_tier_icon',
                        'label'         => 'Icon',
                        'name'          => 'icon',
                        'type'          => 'image',
                        'return_format' => 'array',
                        'preview_size'  => 'thumbnail',
                        'required'      => 0,
                        'wrapper'       => [ 'width' => '25' ],
                    ],
                    [
                        'key'           => 'field_mf_lt_tier_icon_bg',
                        'label'         => 'Icon Background',
                        'name'          => 'icon_bg',
                        'type'          => 'color_picker',
                        'required'      => 0,
                        'wrapper'       => [ 'width' => '25' ],
                    ],
                    [
                        'key'      => 'field_mf_lt_tier_name',
                        'label'    => 'Name',
                        'name'     => 'name',
                        'type'     => 'text',
                        'required' => 0,
                        'wrapper'  => [ 'width' => '25' ],
                    ],
                    [
                        'key'      => 'field_mf_lt_tier_points',
                        'label'    => 'Points',
                        'name'     => 'points',
                        'type'     => 'text',
                        'required' => 0,
                        'wrapper'  => [ 'width' => '25' ],
                    ],
                    [
                        'key'          => 'field_mf_lt_tier_benefits',
                        'label'        => 'Benefits',
                        'name'         => 'benefits',
                        'type'         => 'repeater',
                        'layout'       => 'table',
                        'button_label' => 'Add Benefit',
                        'min'          => 0,
                        'sub_fields'   => [
                            [
                                'key'           => 'field_mf_lt_benefit_icon',
                                'label'         => 'Icon',
                                'name'          => 'icon',
                                'type'          => 'image',
                                'return_format' => 'array',
                                'preview_size'  => 'thumbnail',
                                'required'      => 0,
                                'wrapper'       => [ 'width' => '30' ],
                            ],
                            [
                                'key'      => 'field_mf_lt_benefit_label',
                                'label'    => 'Label',
                                'name'     => 'label',
                                'type'     => 'text',
                                'required' => 0,
                                'wrapper'  => [ 'width' => '70' ],
                            ],
                        ],
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
        'graphql_field_name' => 'loyaltyTiers',
    ] );
}


/**
 * One-time copy of the home page LoyaltyTiers block into the shared Site Settings
 * group, so the mood pages have the tiers without anyone re-picking four tier icons
 * and eight benefit icons by hand.
 *
 * Runs in admin only, writes nothing once the group has tiers, and records a flag so
 * it never runs twice. Editing the Site Settings values afterwards is safe: this will
 * not overwrite them, and it does not touch the home page block, which stays the
 * source for the home page itself.
 */
function mf_seed_loyalty_tiers_from_home_page() {
    if ( get_option( 'mf_loyalty_tiers_seeded' ) ) {
        return;
    }
    if ( ! function_exists( 'get_field' ) || ! function_exists( 'update_field' ) ) {
        return;
    }
    if ( get_field( 'tiers', 'option' ) ) {
        update_option( 'mf_loyalty_tiers_seeded', 1, false );
        return;
    }

    $front_id = (int) get_option( 'page_on_front' );
    $front    = $front_id ? get_post( $front_id ) : null;
    if ( ! $front ) {
        return;
    }

    $data = null;
    foreach ( parse_blocks( $front->post_content ) as $block ) {
        if ( ( $block['blockName'] ?? '' ) === 'acf/loyalty-tiers' && ! empty( $block['attrs']['data'] ) ) {
            $data = $block['attrs']['data'];
            break;
        }
    }
    if ( ! $data ) {
        return;
    }

    foreach ( [ 'badge_icon', 'badge_text', 'heading', 'body', 'cta', 'tiers_title' ] as $name ) {
        if ( isset( $data[ $name ] ) && '' !== $data[ $name ] ) {
            update_field( $name, $data[ $name ], 'option' );
        }
    }

    // The block stores repeaters flattened as tiers_0_name, tiers_0_benefits_1_label
    // and so on. update_field() wants them nested, and rebuilding it here means ACF
    // writes the field keys itself rather than this code guessing them.
    $tiers = [];
    for ( $i = 0, $count = (int) ( $data['tiers'] ?? 0 ); $i < $count; $i++ ) {
        $benefits = [];
        for ( $j = 0, $bcount = (int) ( $data[ "tiers_{$i}_benefits" ] ?? 0 ); $j < $bcount; $j++ ) {
            $benefits[] = [
                'icon'  => $data[ "tiers_{$i}_benefits_{$j}_icon" ] ?? '',
                'label' => $data[ "tiers_{$i}_benefits_{$j}_label" ] ?? '',
            ];
        }
        $tiers[] = [
            'icon'     => $data[ "tiers_{$i}_icon" ] ?? '',
            'icon_bg'  => $data[ "tiers_{$i}_icon_bg" ] ?? '',
            'name'     => $data[ "tiers_{$i}_name" ] ?? '',
            'points'   => $data[ "tiers_{$i}_points" ] ?? '',
            'benefits' => $benefits,
        ];
    }
    if ( $tiers ) {
        update_field( 'tiers', $tiers, 'option' );
    }

    update_option( 'mf_loyalty_tiers_seeded', 1, false );
}


/**
 * Re-exposes the shared Promotional Slides under the Hero Slider block, so the block
 * and the mega menu Featured carousel render the same slides.
 *
 * It reuses the generated `PromotionalSlides` type rather than a hand rolled one, so
 * the field shape is identical to `siteSettings.promotionalSlides` and the component
 * needs no mapping. The resolver returns a node carrying the ACF options post id,
 * which is what wpgraphql-acf reads to know where to load the values from
 * (Utils::get_node_acf_id, the `is_array && isset($node['post_id'])` case).
 */
function mf_register_hero_slider_shared_slides() {
    if ( ! function_exists( 'register_graphql_field' ) ) {
        return;
    }

    register_graphql_field( 'AcfHeroSlider', 'sharedSlides', [
        'type'        => 'PromotionalSlides',
        'description' => 'Slides from the shared Promotional Slides group in Site Settings.',
        'resolve'     => function () {
            return [ 'node' => [ 'post_id' => 'options' ] ];
        },
    ] );
}

/**
 * One-time copy of the home page hero slides into the shared group, so switching the
 * block over does not blank the hero while someone re-uploads five slides.
 *
 * Same guards as the tiers seeder: admin only, skips once the shared group has slides,
 * and flagged so it never runs twice.
 */
function mf_seed_promotional_slides_from_home_page() {
    if ( get_option( 'mf_promotional_slides_seeded' ) ) {
        return;
    }
    if ( ! function_exists( 'get_field' ) || ! function_exists( 'update_field' ) ) {
        return;
    }
    if ( get_field( 'slides', 'option' ) ) {
        update_option( 'mf_promotional_slides_seeded', 1, false );
        return;
    }

    $front_id = (int) get_option( 'page_on_front' );
    $front    = $front_id ? get_post( $front_id ) : null;
    if ( ! $front ) {
        return;
    }

    $data = null;
    foreach ( parse_blocks( $front->post_content ) as $block ) {
        if ( ( $block['blockName'] ?? '' ) === 'acf/hero-slider' && ! empty( $block['attrs']['data'] ) ) {
            $data = $block['attrs']['data'];
            break;
        }
    }
    if ( ! $data ) {
        return;
    }

    $slides = [];
    for ( $i = 0, $count = (int) ( $data['slides'] ?? 0 ); $i < $count; $i++ ) {
        $slides[] = [
            'caption'       => '',
            'link'          => $data[ "slides_{$i}_link" ] ?? '',
            'desktop_image' => $data[ "slides_{$i}_desktop_image" ] ?? '',
            'tablet_image'  => $data[ "slides_{$i}_tablet_image" ] ?? '',
            'mobile_image'  => $data[ "slides_{$i}_mobile_image" ] ?? '',
        ];
    }
    if ( $slides ) {
        update_field( 'slides', $slides, 'option' );
    }

    update_option( 'mf_promotional_slides_seeded', 1, false );
}
