<?php
/**
 * Plugin Name: Mellow Fellow - Cart Forensics
 * Description: Temporary diagnostic logging. Records every cart item removal
 *              and coupon add/removal with the request path and the code path
 *              (plugin/function) that triggered it. View under WooCommerce →
 *              Status → Logs → source "mf-cart-forensics". Remove when the
 *              cart-wipe investigation is done.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

function mf_forensics_log( $message ) {
    if ( ! function_exists( 'wc_get_logger' ) ) return;

    $trace = array();
    foreach ( debug_backtrace( DEBUG_BACKTRACE_IGNORE_ARGS, 12 ) as $frame ) {
        if ( empty( $frame['file'] ) ) continue;
        $file = $frame['file'];
        // Skip WP core internals and this file — keep plugin/theme frames.
        if ( strpos( $file, 'mellow-fellow-cart-forensics' ) !== false ) continue;
        if ( strpos( $file, '/wp-includes/' ) !== false ) continue;
        $short = preg_replace( '#^.*/(plugins|mu-plugins|themes)/#', '$1/', $file );
        $trace[] = $short . ':' . ( $frame['line'] ?? '?' ) . ' ' . ( $frame['function'] ?? '' );
        if ( count( $trace ) >= 6 ) break;
    }

    $session_key = '';
    if ( function_exists( 'WC' ) && WC()->session ) {
        $session_key = method_exists( WC()->session, 'get_customer_id' )
            ? substr( (string) WC()->session->get_customer_id(), 0, 16 )
            : '';
    }

    $uri    = isset( $_SERVER['REQUEST_URI'] ) ? substr( sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ), 0, 120 ) : 'cli';
    $method = isset( $_SERVER['REQUEST_METHOD'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) : '';
    $user   = get_current_user_id();

    wc_get_logger()->info(
        sprintf(
            "%s | req=%s %s | user=%d | session=%s\n  trace: %s",
            $message, $method, $uri, $user, $session_key,
            implode( ' <- ', $trace )
        ),
        array( 'source' => 'mf-cart-forensics' )
    );
}

add_action( 'woocommerce_removed_coupon', function ( $code ) {
    mf_forensics_log( "COUPON REMOVED: $code" );
}, 1 );

add_action( 'woocommerce_applied_coupon', function ( $code ) {
    mf_forensics_log( "coupon applied: $code" );
}, 1 );

add_action( 'woocommerce_cart_item_removed', function ( $key, $cart ) {
    $item = isset( $cart->removed_cart_contents[ $key ] ) ? $cart->removed_cart_contents[ $key ] : null;
    $pid  = $item ? ( $item['product_id'] ?? '?' ) : '?';
    $qty  = $item ? ( $item['quantity'] ?? '?' ) : '?';
    mf_forensics_log( "ITEM REMOVED: product=$pid qty=$qty key=$key" );
}, 1, 2 );

add_action( 'woocommerce_cart_emptied', function () {
    mf_forensics_log( 'CART EMPTIED' );
}, 1 );
