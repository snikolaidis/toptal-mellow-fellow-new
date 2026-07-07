<?php
/**
 * Plugin Name: Mellow Fellow - Page Templates
 * Description: Registers a "Landing Page" page template (virtual — no PHP template
 *              file, since rendering happens in the Faust.js React frontend) and
 *              its per-page ACF settings, exposed to WPGraphQL.
 * Version: 1.0.0
 * Requires Plugins: advanced-custom-fields-pro, wp-graphql, wp-graphql-acf
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_filter( 'theme_page_templates', 'mf_register_landing_page_template' );
add_action( 'acf/init', 'mf_register_landing_page_settings_fields' );

function mf_register_landing_page_template( $templates ) {
    $templates['template-landing-page.php'] = 'Landing Page';
    return $templates;
}

function mf_register_landing_page_settings_fields() {
    if ( ! function_exists( 'acf_add_local_field_group' ) ) {
        return;
    }

    acf_add_local_field_group( [
        'key'    => 'group_landing_page_settings',
        'title'  => 'Landing Page Settings',
        'fields' => [
            [
                'key'        => 'field_mf_lps_hero_image',
                'label'      => 'Hero Image',
                'name'       => 'hero_image',
                'type'       => 'group',
                // Native copy of group_responsive_image's fields rather than a
                // clone: wp-graphql-acf doesn't resolve clone-field values when
                // the clone is nested inside a group (schema is correct, values
                // come back null). Keep these in sync with acf-responsive-image.json
                // by hand if that block's fields change.
                'sub_fields' => [
                    [
                        'key'           => 'field_mf_lps_hi_mobile_image',
                        'label'         => 'Mobile image',
                        'name'          => 'mobile_image',
                        'type'          => 'image',
                        'instructions'  => 'Shown below 768px.',
                        'return_format' => 'array',
                        'preview_size'  => 'medium',
                        'wrapper'       => [ 'width' => '33' ],
                    ],
                    [
                        'key'           => 'field_mf_lps_hi_tablet_image',
                        'label'         => 'Tablet image',
                        'name'          => 'tablet_image',
                        'type'          => 'image',
                        'instructions'  => 'Shown from 768px to 1023px.',
                        'return_format' => 'array',
                        'preview_size'  => 'medium',
                        'wrapper'       => [ 'width' => '33' ],
                    ],
                    [
                        'key'           => 'field_mf_lps_hi_desktop_image',
                        'label'         => 'Desktop image',
                        'name'          => 'desktop_image',
                        'type'          => 'image',
                        'instructions'  => 'Shown from 1024px up.',
                        'return_format' => 'array',
                        'preview_size'  => 'medium',
                        'wrapper'       => [ 'width' => '34' ],
                    ],
                    [
                        'key'          => 'field_mf_lps_hi_link',
                        'label'        => 'Link',
                        'name'         => 'link',
                        'type'         => 'link',
                        'instructions' => 'Optional. Makes the whole image clickable.',
                        'required'     => 0,
                    ],
                    [
                        'key'           => 'field_mf_lps_hi_border_radius',
                        'label'         => 'Border radius',
                        'name'          => 'border_radius',
                        'type'          => 'range',
                        'min'           => 0,
                        'max'           => 50,
                        'step'          => 1,
                        'default_value' => 0,
                        'append'        => 'px',
                        'wrapper'       => [ 'width' => '34' ],
                    ],
                    [
                        'key'           => 'field_mf_lps_hi_width',
                        'label'         => 'Width',
                        'name'          => 'width',
                        'type'          => 'button_group',
                        'choices'       => [
                            'full'      => 'Full width',
                            'contained' => 'Contained',
                        ],
                        'default_value' => 'full',
                        'wrapper'       => [ 'width' => '33' ],
                    ],
                    [
                        'key'           => 'field_mf_lps_hi_eager_load',
                        'label'         => 'Eager load',
                        'name'          => 'eager_load',
                        'type'          => 'true_false',
                        'instructions'  => 'Enable for above-the-fold banners so the image loads immediately (LCP).',
                        'default_value' => 0,
                        'ui'            => 1,
                        'wrapper'       => [ 'width' => '33' ],
                    ],
                ],
            ],
            [
                'key'        => 'field_mf_lps_collection_group',
                'label'      => 'Collection Group',
                'name'       => 'collection_group',
                'type'       => 'group',
                'sub_fields' => [
                    [
                        'key'         => 'field_mf_lps_cg_heading',
                        'label'       => 'Heading',
                        'name'        => 'heading',
                        'type'        => 'text',
                        'instructions' => 'Optional. Shown above the collection tabs.',
                        'required'    => 0,
                        'wrapper'     => [ 'width' => '50' ],
                    ],
                    [
                        'key'      => 'field_mf_lps_cg_product_count',
                        'label'    => 'Number of products',
                        'name'     => 'product_count',
                        'type'     => 'number',
                        'instructions' => 'How many products to show for the active collection (1–24).',
                        'default_value' => 8,
                        'min'      => 1,
                        'max'      => 24,
                        'required' => 0,
                        'wrapper'  => [ 'width' => '50' ],
                    ],
                    [
                        'key'      => 'field_mf_lps_cg_show_thumbnail',
                        'label'    => 'Show thumbnail',
                        'name'     => 'show_thumbnail',
                        'type'     => 'true_false',
                        'instructions' => 'Show each collection\'s thumbnail image behind its tab control.',
                        'default_value' => 0,
                        'ui'       => 1,
                        'wrapper'  => [ 'width' => '50' ],
                    ],
                    [
                        'key'      => 'field_mf_lps_cg_show_products_slider',
                        'label'    => 'Show products as slider',
                        'name'     => 'show_products_slider',
                        'type'     => 'true_false',
                        'instructions' => 'Render the active collection\'s products as a slider instead of a grid.',
                        'default_value' => 0,
                        'ui'       => 1,
                        'wrapper'  => [ 'width' => '50' ],
                    ],
                    [
                        'key'         => 'field_mf_lps_cg_items',
                        'label'       => 'Collections',
                        'name'        => 'items',
                        'type'        => 'repeater',
                        'instructions' => 'Add a row per collection tab. Drag rows to set the display order.',
                        'layout'      => 'block',
                        'button_label' => 'Add Collection',
                        'min'         => 0,
                        'sub_fields'  => [
                            [
                                'key'             => 'field_mf_lps_cg_item_collection',
                                'label'           => 'Collection',
                                'name'            => 'collection',
                                'type'            => 'taxonomy',
                                'taxonomy'        => 'collection',
                                'field_type'      => 'select',
                                'allow_null'      => 0,
                                'add_term'        => 0,
                                'save_terms'      => 0,
                                'load_terms'      => 0,
                                'return_format'   => 'object',
                                'multiple'        => 0,
                                'required'        => 1,
                                'wrapper'         => [ 'width' => '60' ],
                            ],
                            [
                                'key'         => 'field_mf_lps_cg_item_title_override',
                                'label'       => 'Title override',
                                'name'        => 'title_override',
                                'type'        => 'text',
                                'instructions' => 'Optional. Shown instead of the collection\'s name.',
                                'required'    => 0,
                                'wrapper'     => [ 'width' => '40' ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
        'location' => [
            [
                [
                    'param'    => 'page_template',
                    'operator' => '==',
                    'value'    => 'template-landing-page.php',
                ],
            ],
        ],
        'menu_order'                     => 0,
        'position'                       => 'normal',
        'style'                          => 'default',
        'label_placement'                => 'top',
        'instruction_placement'          => 'label',
        'hide_on_screen'                 => '',
        'active'                         => true,
        'show_in_graphql'                => 1,
        'graphql_field_name'             => 'landingPageSettings',
        'map_graphql_types_from_location_rules' => 0,
        'graphql_types'                  => [ 'Page' ],
    ] );
}
