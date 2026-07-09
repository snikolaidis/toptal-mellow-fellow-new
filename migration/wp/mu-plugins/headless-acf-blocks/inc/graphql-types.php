<?php

namespace HeadlessAcfBlocks;

defined( 'ABSPATH' ) || exit;

function graphql_block_slugs() {
	static $slugs = null;

	if ( null !== $slugs ) {
		return $slugs;
	}

	$slugs      = array();
	$blocks_dir = HEADLESS_ACF_BLOCKS_DIR . '/blocks';

	if ( ! is_dir( $blocks_dir ) ) {
		return $slugs;
	}

	foreach ( glob( $blocks_dir . '/*', GLOB_ONLYDIR ) as $block_dir ) {
		if ( file_exists( $block_dir . '/block.json' ) ) {
			$slugs[] = basename( $block_dir );
		}
	}

	return $slugs;
}

function graphql_format_block_type_name( $block_name ) {
	if ( class_exists( '\WPGraphQL\ContentBlocks\Utilities\WPGraphQLHelpers' ) ) {
		return \WPGraphQL\ContentBlocks\Utilities\WPGraphQLHelpers::format_type_name( $block_name );
	}

	$type_name = lcfirst( ucwords( $block_name, '/' ) );
	$type_name = str_replace( '/', '', lcfirst( ucwords( $type_name, '/' ) ) );
	$type_name = lcfirst( str_replace( '-', ' ', ucwords( $type_name, '-' ) ) );
	$type_name = lcfirst( str_replace( ' ', '', ucwords( $type_name, ' ' ) ) );

	return ucfirst( $type_name );
}

function graphql_types_for_field_group( $field_group ) {
	if ( empty( $field_group['location'] ) || ! is_array( $field_group['location'] ) ) {
		return array();
	}

	if ( 1 !== count( $field_group['location'] ) ) {
		return array();
	}

	$rules = $field_group['location'][0];

	if ( ! is_array( $rules ) || 1 !== count( $rules ) ) {
		return array();
	}

	$rule = reset( $rules );

	if ( ! isset( $rule['param'], $rule['operator'], $rule['value'] ) ) {
		return array();
	}

	if ( 'block' !== $rule['param'] || '==' !== $rule['operator'] ) {
		return array();
	}

	if ( 0 !== strpos( $rule['value'], 'acf/' ) ) {
		return array();
	}

	if ( ! in_array( substr( $rule['value'], 4 ), graphql_block_slugs(), true ) ) {
		return array();
	}

	$type_name = graphql_format_block_type_name( $rule['value'] );

	return '' === $type_name ? array() : array( $type_name );
}

function restore_block_graphql_types( $field_group ) {
	$types = graphql_types_for_field_group( $field_group );

	if ( empty( $types ) ) {
		return $field_group;
	}

	$field_group['show_in_graphql']                       = 1;
	$field_group['map_graphql_types_from_location_rules'] = 0;
	$field_group['graphql_types']                         = $types;

	return $field_group;
}
add_filter( 'acf/load_field_group', __NAMESPACE__ . '\\restore_block_graphql_types' );
