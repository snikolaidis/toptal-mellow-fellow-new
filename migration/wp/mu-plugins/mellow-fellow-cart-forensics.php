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
 * A clear breakdown of where a cart request spends its time, so a slow
 * add-to-cart / apply-coupon shows its own bottleneck:
 *
 *   total ms            — full REST request wall time
 *   pre_calc ms         — request start -> first calculate_totals (session +
 *                         cart load + the mutation itself, e.g. add_to_cart)
 *   calc ms (xN)        — CUMULATIVE time inside calculate_totals across all N
 *                         recalcs (each recalc re-runs every coupon/pricing
 *                         plugin — the classic WooCommerce cart hot path)
 *   http ms (xN)        — CUMULATIVE time in OUTBOUND HTTP calls (wp_remote_*)
 *                         made during the request, with per-call host+ms. A
 *                         synchronous external call (Acumatica, a license/RealID
 *                         check, an API lookup) on the cart path is the #1 cause
 *                         of "the store is taking too long" and is invisible in
 *                         a plain duration number — this surfaces it.
 *   queries / mem       — DB query count and peak memory
 *
 * Slow requests (>1s) are tagged PERF-SLOW; those also get a second HTTP-DETAIL
 * line listing each outbound call so the offending host is unambiguous. */

function mf_forensics_perf_reset() {
    return array(
        'start'       => 0.0,
        'route'       => '',
        'action'      => '',
        'calc_totals' => 0,
        'calc_ms'     => 0.0,
        'calc_open'   => 0.0,
        'first_calc'  => 0.0,
        'http_count'  => 0,
        'http_ms'     => 0.0,
        'http_open'   => 0.0,
        'http_calls'  => array(),
    );
}
$GLOBALS['mf_forensics_perf'] = mf_forensics_perf_reset();

function mf_forensics_perf_active() {
    return ! empty( $GLOBALS['mf_forensics_perf']['start'] );
}

add_filter( 'rest_pre_dispatch', function ( $result, $server, $request ) {
    $route = $request->get_route();
    if ( strpos( $route, '/wc/store/' ) === 0 ) {
        $GLOBALS['mf_forensics_perf']          = mf_forensics_perf_reset();
        $GLOBALS['mf_forensics_perf']['start'] = microtime( true );
        $GLOBALS['mf_forensics_perf']['route'] = $request->get_method() . ' ' . $route;
        // Surface the cart-ops action (add_free_gift / add_bundle / empty_cart …)
        // so a slow request can be tied to the exact operation.
        $body = $request->get_json_params();
        if ( is_array( $body ) && isset( $body['namespace'] ) && $body['namespace'] === 'mellow-fellow/cart-ops' ) {
            $GLOBALS['mf_forensics_perf']['action'] = isset( $body['data']['action'] ) ? (string) $body['data']['action'] : '';
        }
    }
    return $result;
}, 1, 3 );

// Time each calculate_totals pass (before -> after), accumulating total calc ms.
add_action( 'woocommerce_before_calculate_totals', function () {
    if ( mf_forensics_perf_active() ) {
        $now = microtime( true );
        $GLOBALS['mf_forensics_perf']['calc_open'] = $now;
        if ( empty( $GLOBALS['mf_forensics_perf']['first_calc'] ) ) {
            $GLOBALS['mf_forensics_perf']['first_calc'] = $now;
        }
    }
}, -9999 );

add_action( 'woocommerce_after_calculate_totals', function () {
    if ( mf_forensics_perf_active() && ! empty( $GLOBALS['mf_forensics_perf']['calc_open'] ) ) {
        $GLOBALS['mf_forensics_perf']['calc_ms'] += ( microtime( true ) - $GLOBALS['mf_forensics_perf']['calc_open'] ) * 1000;
        $GLOBALS['mf_forensics_perf']['calc_open'] = 0.0;
        $GLOBALS['mf_forensics_perf']['calc_totals']++;
    }
}, 9999 );

// Time every OUTBOUND HTTP call. WP HTTP requests are synchronous and sequential
// within a PHP request, so a simple open/close pair is accurate (no concurrency).
add_filter( 'pre_http_request', function ( $pre, $args, $url ) {
    if ( mf_forensics_perf_active() ) {
        $GLOBALS['mf_forensics_perf']['http_open'] = microtime( true );
    }
    return $pre; // never short-circuit the real request
}, 1, 3 );

add_action( 'http_api_debug', function ( $response, $context, $class, $args, $url ) {
    if ( ! mf_forensics_perf_active() || empty( $GLOBALS['mf_forensics_perf']['http_open'] ) ) {
        return;
    }
    $ms = ( microtime( true ) - $GLOBALS['mf_forensics_perf']['http_open'] ) * 1000;
    $GLOBALS['mf_forensics_perf']['http_open'] = 0.0;
    $GLOBALS['mf_forensics_perf']['http_count']++;
    $GLOBALS['mf_forensics_perf']['http_ms'] += $ms;
    $host = wp_parse_url( (string) $url, PHP_URL_HOST );
    $code = ( is_array( $response ) && isset( $response['response']['code'] ) ) ? $response['response']['code'] : '?';
    if ( count( $GLOBALS['mf_forensics_perf']['http_calls'] ) < 20 ) {
        $GLOBALS['mf_forensics_perf']['http_calls'][] = sprintf( '%s [%s] %dms', $host ?: '?', $code, round( $ms ) );
    }
}, 10, 5 );

add_filter( 'rest_post_dispatch', function ( $response, $server, $request ) {
    $perf = $GLOBALS['mf_forensics_perf'];
    if ( empty( $perf['start'] ) || strpos( $request->get_route(), '/wc/store/' ) !== 0 ) {
        return $response;
    }
    $GLOBALS['mf_forensics_perf']['start'] = 0.0;

    $now         = microtime( true );
    $duration_ms = (int) round( ( $now - $perf['start'] ) * 1000 );
    $pre_calc_ms = $perf['first_calc'] ? (int) round( ( $perf['first_calc'] - $perf['start'] ) * 1000 ) : $duration_ms;
    $calc_ms     = (int) round( $perf['calc_ms'] );
    $http_ms     = (int) round( $perf['http_ms'] );
    $queries     = isset( $GLOBALS['wpdb'] ) ? (int) $GLOBALS['wpdb']->num_queries : 0;
    $memory_mb   = round( memory_get_peak_usage( true ) / 1048576, 1 );
    $status      = is_object( $response ) && method_exists( $response, 'get_status' ) ? $response->get_status() : '?';
    $route       = $perf['route'] . ( $perf['action'] ? ' (' . $perf['action'] . ')' : '' );

    // Session token (short) tells apart ONE browser looping (same token repeating
    // in a burst -> a frontend refetch storm to fix client-side) from MANY sessions
    // (different tokens -> real concurrent traffic -> a server-throughput problem).
    $session = '';
    if ( function_exists( 'WC' ) && WC()->session && method_exists( WC()->session, 'get_customer_id' ) ) {
        $session = substr( (string) WC()->session->get_customer_id(), 0, 14 );
    }
    // Cart item count — confirms the strong correlation between cart size and time.
    $items = ( function_exists( 'WC' ) && WC()->cart ) ? (int) WC()->cart->get_cart_contents_count() : 0;

    if ( function_exists( 'wc_get_logger' ) ) {
        $tag = $duration_ms > 1000 ? 'PERF-SLOW' : 'PERF';
        wc_get_logger()->info(
            sprintf(
                '%s: %s -> %s | total=%dms | pre_calc=%dms | calc=%dms (x%d) | http=%dms (x%d) | queries=%d | items=%d | mem=%sMB | sess=%s',
                $tag, $route, $status, $duration_ms, $pre_calc_ms, $calc_ms, $perf['calc_totals'],
                $http_ms, $perf['http_count'], $queries, $items, $memory_mb, $session
            ),
            array( 'source' => 'mf-cart-forensics' )
        );
        // For slow requests, spell out each outbound HTTP call so the offending
        // host/endpoint is obvious (this is usually where the seconds hide).
        if ( $duration_ms > 1000 && ! empty( $perf['http_calls'] ) ) {
            wc_get_logger()->info(
                'HTTP-DETAIL: ' . $route . ' | ' . implode( ' ; ', $perf['http_calls'] ),
                array( 'source' => 'mf-cart-forensics' )
            );
        }
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
