<?php
/**
 * Plugin Name: Mellow Fellow - Menu Locations
 * Description: Registers nav menu locations the headless frontend needs but the
 *              active theme does not declare, so WPGraphQL can expose them.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'after_setup_theme', 'mf_register_menu_locations' );

function mf_register_menu_locations() {
    register_nav_menus( [
        'shop_mega_menu' => __( 'Shop Mega Menu', 'mellow-fellow' ),
    ] );
}
