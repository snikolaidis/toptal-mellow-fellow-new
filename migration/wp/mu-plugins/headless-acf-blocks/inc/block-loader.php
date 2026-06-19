<?php
/**
 * Block auto-discovery and registration.
 *
 * Scans the blocks/ directory for subfolders containing a block.json file
 * and registers each one. To add a new block, create a new folder under
 * blocks/ with its own block.json + render.php + ACF field group JSON —
 * no changes needed here.
 */

namespace HeadlessAcfBlocks;

defined( 'ABSPATH' ) || exit;

/**
 * Register a dedicated block category so our headless blocks are grouped
 * together in the block inserter, rather than silently falling back to
 * a default category if "headless-blocks" is referenced but never declared.
 */
function register_block_category( $categories ) {
	return array_merge(
		$categories,
		array(
			array(
				'slug'  => 'headless-blocks',
				'title' => __( 'Headless Sections', 'headless-acf-blocks' ),
				'icon'  => 'layout',
			),
		)
	);
}
add_filter( 'block_categories_all', __NAMESPACE__ . '\\register_block_category' );

/**
 * Register all ACF blocks found in the blocks/ directory.
 */
function register_blocks() {
	if ( ! function_exists( 'acf_register_block_type' ) ) {
		return;
	}

	$blocks_dir = HEADLESS_ACF_BLOCKS_DIR . '/blocks';

	if ( ! is_dir( $blocks_dir ) ) {
		return;
	}

	foreach ( glob( $blocks_dir . '/*', GLOB_ONLYDIR ) as $block_dir ) {
		$block_json_path = $block_dir . '/block.json';

		if ( ! file_exists( $block_json_path ) ) {
			continue;
		}

		\register_block_type( $block_dir );
	}
}
add_action( 'init', __NAMESPACE__ . '\\register_blocks' );

/**
 * Point ACF's local JSON save/load at our own acf-json/ folder instead of
 * (or in addition to) the theme's, so field groups for these blocks are
 * version-controlled alongside the blocks themselves.
 */
function acf_json_save_point( $path ) {
	return HEADLESS_ACF_BLOCKS_DIR . '/acf-json';
}
add_filter( 'acf/settings/save_json', __NAMESPACE__ . '\\acf_json_save_point' );

function acf_json_load_point( $paths ) {
	$paths[] = HEADLESS_ACF_BLOCKS_DIR . '/acf-json';
	return $paths;
}
add_filter( 'acf/settings/load_json', __NAMESPACE__ . '\\acf_json_load_point' );
