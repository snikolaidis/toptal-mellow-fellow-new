<?php
/**
 * Plugin Name: Mellow Fellow Quiz Post Type
 * Description: Registers the Quizzes custom post type for the product recommendation quiz. Guarded so it does not double-register where an ACF UI post type already defines it (e.g. the live site).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action(
	'init',
	function () {
		if ( post_type_exists( 'quiz' ) ) {
			return;
		}

		register_post_type(
			'quiz',
			array(
				'labels'              => array(
					'name'          => 'Quizzes',
					'singular_name' => 'Quiz',
					'menu_name'     => 'Quizzes',
					'add_new'       => 'Add New Quiz',
					'add_new_item'  => 'Add New Quiz',
					'edit_item'     => 'Edit Quiz',
					'new_item'      => 'New Quiz',
					'view_item'     => 'View Quiz',
					'search_items'  => 'Search Quizzes',
					'not_found'     => 'No quizzes found',
					'all_items'     => 'All Quizzes',
				),
				'public'              => true,
				'show_ui'             => true,
				'show_in_menu'        => true,
				'menu_icon'           => 'dashicons-forms',
				'has_archive'         => false,
				'hierarchical'        => false,
				'supports'            => array( 'title' ),
				'rewrite'             => array(
					'slug'       => 'quiz',
					'with_front' => true,
					'pages'      => true,
				),
				'show_in_rest'        => true,
				'show_in_graphql'     => true,
				'graphql_single_name' => 'quiz',
				'graphql_plural_name' => 'quizzes',
			)
		);
	},
	20
);
