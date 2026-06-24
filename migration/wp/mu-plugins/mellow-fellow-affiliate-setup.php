<?php
/**
 * Plugin Name: Mellow Fellow - Affiliate Page Setup (one-time)
 * Description: Creates the "Affiliate Page Data" page and imports the ACF field group for the affiliate UGC gallery. Runs once on admin_init, then marks itself complete via an option.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'admin_init', 'mf_affiliate_setup_run_once' );

function mf_affiliate_setup_run_once() {
    // Only run once
    if ( get_option( 'mf_affiliate_setup_done' ) ) {
        return;
    }

    // Ensure ACF is loaded
    if ( ! function_exists( 'acf_import_field_group' ) ) {
        return; // ACF not active yet, will try again next admin load
    }

    $log = [];

    // 1. Create the "Affiliate Page Data" page if it doesn't exist
    $existing = get_page_by_path( 'affiliate-data', OBJECT, 'page' );
    if ( $existing ) {
        $page_id = $existing->ID;
        // Ensure it's published
        if ( $existing->post_status !== 'publish' ) {
            wp_update_post( [ 'ID' => $page_id, 'post_status' => 'publish' ] );
        }
        $log[] = "Page already exists: ID $page_id";
    } else {
        $page_id = wp_insert_post( [
            'post_title'   => 'Affiliate Page Data',
            'post_name'    => 'affiliate-data',
            'post_status'  => 'publish',
            'post_type'    => 'page',
            'post_content' => '',
        ] );
        $log[] = "Created page: ID $page_id";
    }

    if ( is_wp_error( $page_id ) || ! $page_id ) {
        error_log( '[MF Affiliate Setup] Failed to create page: ' . ( is_wp_error( $page_id ) ? $page_id->get_error_message() : 'unknown' ) );
        return;
    }

    // 2. Check if the ACF field group already exists
    $existing_group = acf_get_field_group( 'group_mf_affiliate_page' );
    if ( $existing_group ) {
        $log[] = "ACF field group already exists, updating location rule";
        $existing_group['location'] = [ [ [ 'param' => 'page', 'operator' => '==', 'value' => (string) $page_id ] ] ];
        acf_update_field_group( $existing_group );
    } else {
        // Import the field group
        $group = [
            'key'                   => 'group_mf_affiliate_page',
            'title'                 => 'Affiliate Page Content',
            'fields'                => [
                [
                    'key'            => 'field_affiliate_ugc_gallery',
                    'label'          => 'UGC Gallery',
                    'name'           => 'ugc_gallery',
                    'type'           => 'repeater',
                    'instructions'   => 'Add creator video clips with a tagged product for the shoppable video gallery on the affiliate page. Upload vertical (9:16) videos for best results.',
                    'required'       => 0,
                    'min'            => 0,
                    'max'            => 10,
                    'layout'         => 'block',
                    'button_label'   => 'Add Video',
                    'show_in_graphql'=> 1,
                    'sub_fields'     => [
                        [
                            'key'            => 'field_affiliate_ugc_video_url',
                            'label'          => 'Video File',
                            'name'           => 'video_url',
                            'type'           => 'file',
                            'instructions'   => 'Upload an MP4 or WebM video. Keep under 20MB. Vertical (9:16) ratio works best.',
                            'required'       => 1,
                            'return_format'  => 'id',
                            'library'        => 'all',
                            'mime_types'     => 'mp4,webm,mov',
                            'show_in_graphql'=> 1,
                        ],
                        [
                            'key'            => 'field_affiliate_ugc_poster',
                            'label'          => 'Poster / Thumbnail',
                            'name'           => 'video_poster',
                            'type'           => 'image',
                            'instructions'   => 'A still frame shown before the video loads.',
                            'required'       => 0,
                            'return_format'  => 'url',
                            'preview_size'   => 'medium',
                            'library'        => 'all',
                            'show_in_graphql'=> 1,
                        ],
                        [
                            'key'            => 'field_affiliate_ugc_product',
                            'label'          => 'Tagged Product',
                            'name'           => 'tagged_product',
                            'type'           => 'post_object',
                            'instructions'   => 'Select the WooCommerce product shown in this video.',
                            'required'       => 0,
                            'post_type'      => [ 'product' ],
                            'taxonomy'       => [],
                            'allow_null'     => 1,
                            'multiple'       => 0,
                            'return_format'  => 'id',
                            'ui'             => 1,
                            'show_in_graphql'=> 1,
                        ],
                    ],
                ],
                [
                    'key'            => 'field_affiliate_hero_1',
                    'label'          => 'Hero Image 1',
                    'name'           => 'affiliate_hero_1',
                    'type'           => 'image',
                    'instructions'   => 'Main hero collage card. Tall portrait ratio, ~600x700px.',
                    'required'       => 0,
                    'return_format'  => 'array',
                    'preview_size'   => 'medium',
                    'library'        => 'all',
                    'show_in_graphql'=> 1,
                ],
                [
                    'key'            => 'field_affiliate_hero_2',
                    'label'          => 'Hero Image 2',
                    'name'           => 'affiliate_hero_2',
                    'type'           => 'image',
                    'instructions'   => 'Secondary hero collage card.',
                    'required'       => 0,
                    'return_format'  => 'array',
                    'preview_size'   => 'medium',
                    'library'        => 'all',
                    'show_in_graphql'=> 1,
                ],
                [
                    'key'            => 'field_affiliate_hero_3',
                    'label'          => 'Hero Image 3',
                    'name'           => 'affiliate_hero_3',
                    'type'           => 'image',
                    'instructions'   => 'Tertiary hero collage card.',
                    'required'       => 0,
                    'return_format'  => 'array',
                    'preview_size'   => 'medium',
                    'library'        => 'all',
                    'show_in_graphql'=> 1,
                ],
                [
                    'key'            => 'field_affiliate_cta_image',
                    'label'          => 'CTA Lifestyle Image',
                    'name'           => 'affiliate_cta_lifestyle',
                    'type'           => 'image',
                    'instructions'   => 'Right-side image in the Start Earning CTA banner. Landscape, ~800x500px.',
                    'required'       => 0,
                    'return_format'  => 'array',
                    'preview_size'   => 'medium',
                    'library'        => 'all',
                    'show_in_graphql'=> 1,
                ],
            ],
            'location'              => [ [ [ 'param' => 'page', 'operator' => '==', 'value' => (string) $page_id ] ] ],
            'menu_order'            => 0,
            'position'              => 'normal',
            'style'                 => 'default',
            'label_placement'       => 'top',
            'instruction_placement' => 'label',
            'active'                => true,
            'show_in_graphql'       => 1,
            'graphql_field_name'    => 'affiliatePageContent',
        ];

        acf_import_field_group( $group );
        $log[] = "Imported ACF field group: Affiliate Page Content";
    }

    // Mark as done so it never runs again
    update_option( 'mf_affiliate_setup_done', true );

    error_log( '[MF Affiliate Setup] Complete: ' . implode( ' | ', $log ) );
}
