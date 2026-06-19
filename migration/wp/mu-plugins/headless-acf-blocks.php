<?php
/**
 * Plugin Name:       Headless ACF Blocks
 * Description:       Registers custom ACF blocks for the headless frontend (Faust.js).
 *                     Block PHP render callbacks only power the WP admin editor preview —
 *                     actual frontend rendering happens in the Faust.js React app via WPGraphQL.
 * Version:            1.0.0
 * Requires Plugins:   advanced-custom-fields-pro, wp-graphql, wp-graphql-acf, wp-graphql-content-blocks
 *
 * This file is the loader. WordPress only autoloads files placed directly inside
 * mu-plugins/, not subfolders — so this file's only job is to pull in the real
 * plugin code from the headless-acf-blocks/ folder next to it.
 */

namespace HeadlessAcfBlocks;

defined( 'ABSPATH' ) || exit;

define( 'HEADLESS_ACF_BLOCKS_DIR', __DIR__ . '/headless-acf-blocks' );
define( 'HEADLESS_ACF_BLOCKS_URL', content_url( '/mu-plugins/headless-acf-blocks' ) );

require_once HEADLESS_ACF_BLOCKS_DIR . '/inc/block-loader.php';
