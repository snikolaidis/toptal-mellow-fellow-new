<?php
/**
 * Plugin Name: Mellow Fellow - News Articles ACF Setup (one-time)
 * Description: Imports the ACF field group for the News Articles CPT. Runs once on admin_init.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'admin_init', 'mf_news_setup_run_once' );

function mf_news_setup_run_once() {
    if ( get_option( 'mf_news_setup_done' ) ) {
        return;
    }

    if ( ! function_exists( 'acf_import_field_group' ) ) {
        return;
    }

    // Check if already exists
    $existing = acf_get_field_group( 'group_mf_news_article' );
    if ( $existing ) {
        update_option( 'mf_news_setup_done', true );
        return;
    }

    $group = [
        'key'                   => 'group_mf_news_article',
        'title'                 => 'News Article Details',
        'fields'                => [
            [
                'key'            => 'field_news_publication_name',
                'label'          => 'Publication Name',
                'name'           => 'publication_name',
                'type'           => 'text',
                'instructions'   => 'e.g. Sarasota Magazine, Vice, Cannabis Now',
                'required'       => 1,
                'show_in_graphql'=> 1,
            ],
            [
                'key'            => 'field_news_publication_date',
                'label'          => 'Publication Date',
                'name'           => 'publication_date',
                'type'           => 'text',
                'instructions'   => 'Display date, e.g. "May, 2026"',
                'required'       => 0,
                'show_in_graphql'=> 1,
            ],
            [
                'key'            => 'field_news_external_url',
                'label'          => 'External Article URL',
                'name'           => 'external_url',
                'type'           => 'url',
                'instructions'   => 'Full URL to the original article on the publication\'s website.',
                'required'       => 1,
                'show_in_graphql'=> 1,
            ],
            [
                'key'            => 'field_news_cover_image',
                'label'          => 'Cover Image / Screenshot',
                'name'           => 'cover_image',
                'type'           => 'image',
                'instructions'   => 'Screenshot of the article or publication logo. Landscape ratio, ~800x500px.',
                'required'       => 0,
                'return_format'  => 'id',
                'preview_size'   => 'medium',
                'library'        => 'all',
                'show_in_graphql'=> 1,
            ],
        ],
        'location'              => [ [ [ 'param' => 'post_type', 'operator' => '==', 'value' => 'news-article' ] ] ],
        'menu_order'            => 0,
        'position'              => 'normal',
        'style'                 => 'default',
        'label_placement'       => 'top',
        'instruction_placement' => 'label',
        'active'                => true,
        'show_in_graphql'       => 1,
        'graphql_field_name'    => 'newsArticleDetails',
    ];

    acf_import_field_group( $group );
    update_option( 'mf_news_setup_done', true );
    error_log( '[MF News Setup] ACF field group imported for News Articles CPT' );
}
