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

/* ── performance profiling: every Store API request gets a PERF line ──
 * duration | db query count | peak memory | how many times cart totals
 * were recalculated (plugins re-triggering calculate_totals is the classic
 * WooCommerce cart bottleneck — each recalc re-runs every coupon/pricing
 * plugin). Slow requests (>1s) are logged as PERF-SLOW for easy filtering. */

$GLOBALS['mf_forensics_perf'] = array( 'start' => 0.0, 'calc_totals' => 0, 'route' => '' );

add_filter( 'rest_pre_dispatch', function ( $result, $server, $request ) {
    $route = $request->get_route();
    if ( strpos( $route, '/wc/store/' ) === 0 ) {
        $GLOBALS['mf_forensics_perf']['start']       = microtime( true );
        $GLOBALS['mf_forensics_perf']['calc_totals'] = 0;
        $GLOBALS['mf_forensics_perf']['route']       = $request->get_method() . ' ' . $route;
    }
    return $result;
}, 1, 3 );

add_action( 'woocommerce_after_calculate_totals', function () {
    if ( ! empty( $GLOBALS['mf_forensics_perf']['start'] ) ) {
        $GLOBALS['mf_forensics_perf']['calc_totals']++;
    }
}, 999 );

add_filter( 'rest_post_dispatch', function ( $response, $server, $request ) {
    $perf = $GLOBALS['mf_forensics_perf'];
    if ( empty( $perf['start'] ) || strpos( $request->get_route(), '/wc/store/' ) !== 0 ) {
        return $response;
    }
    $GLOBALS['mf_forensics_perf']['start'] = 0.0;

    $duration_ms = (int) round( ( microtime( true ) - $perf['start'] ) * 1000 );
    $queries     = isset( $GLOBALS['wpdb'] ) ? (int) $GLOBALS['wpdb']->num_queries : 0;
    $memory_mb   = round( memory_get_peak_usage( true ) / 1048576, 1 );
    $status      = is_object( $response ) && method_exists( $response, 'get_status' ) ? $response->get_status() : '?';

    if ( function_exists( 'wc_get_logger' ) ) {
        $tag = $duration_ms > 1000 ? 'PERF-SLOW' : 'PERF';
        wc_get_logger()->info(
            sprintf(
                '%s: %s -> %s | %dms | queries=%d | mem=%sMB | calc_totals=%d',
                $tag, $perf['route'], $status, $duration_ms, $queries, $memory_mb, $perf['calc_totals']
            ),
            array( 'source' => 'mf-cart-forensics' )
        );
    }
    return $response;
}, 999, 3 );

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
