<?php
/**
 * Plugin Name: Mellow Fellow - Discount Forensics (TEMPORARY)
 * Description: Logs the full per-line and per-coupon discount attribution after
 *              every Store API cart mutation, to diagnose promotion stacking and
 *              bundle discount instability. View under WooCommerce → Status →
 *              Logs → source "mf-discount-forensics". REMOVE after the
 *              investigation is complete.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_filter( 'rest_post_dispatch', function ( $response, $server, $request ) {
    $route = $request->get_route();
    if ( strpos( $route, '/wc/store/' ) !== 0 ) return $response;
    if ( ! function_exists( 'WC' ) || ! WC()->cart || ! function_exists( 'wc_get_logger' ) ) return $response;

    // Only log routes that can change the cart (skip plain GETs to reduce noise,
    // except the extensions endpoint which is always POST).
    $method = $request->get_method();
    if ( 'GET' === $method && ! preg_match( '#/cart$#', $route ) ) return $response;

    // ---- Identify what triggered this change ----
    $trigger = $method . ' ' . $route;
    $body    = $request->get_json_params();
    if ( is_array( $body ) ) {
        if ( isset( $body['id'] ) )   $trigger .= ' id=' . $body['id'] . ' qty=' . ( $body['quantity'] ?? '' );
        if ( isset( $body['key'] ) )  $trigger .= ' key=' . substr( (string) $body['key'], 0, 12 );
        if ( isset( $body['code'] ) ) $trigger .= ' code=' . $body['code'];
        if ( isset( $body['namespace'] ) ) {
            $trigger .= ' ext=' . $body['namespace'] . ' action=' . ( $body['data']['action'] ?? '' );
            if ( isset( $body['data']['bundle_id'] ) ) $trigger .= ' bundle=' . $body['data']['bundle_id'];
            if ( isset( $body['data']['group_keys'] ) ) $trigger .= ' groups=' . implode( ',', array_map( function ( $g ) { return substr( (string) $g, 0, 8 ); }, (array) $body['data']['group_keys'] ) );
        }
    }

    $cart = WC()->cart;

    // ---- Per-line breakdown, with the data flags that reveal WHY a line is discounted ----
    $lines = array();
    foreach ( $cart->get_cart() as $item ) {
        $product = isset( $item['data'] ) ? $item['data'] : null;
        $name    = $product ? $product->get_name() : '(unknown)';
        $sku     = $product ? $product->get_sku() : '';
        $sub     = (float) ( $item['line_subtotal'] ?? 0 );
        $tot     = (float) ( $item['line_total'] ?? 0 );

        $flags = array();
        foreach ( $item as $ik => $iv ) {
            if ( is_scalar( $iv ) && preg_match( '/bogo|free|gift|giveaway|_discount|bb_group|bb_bundle|bb_locked/i', (string) $ik ) ) {
                $flags[] = $ik . '=' . ( is_bool( $iv ) ? ( $iv ? '1' : '0' ) : (string) $iv );
            }
        }

        $lines[] = sprintf(
            '    %-38s SKU=%-12s qty=%d sub=$%.2f tot=$%.2f%s',
            substr( $name, 0, 38 ), $sku ?: '-', (int) $item['quantity'], $sub, $tot,
            $flags ? '  [' . implode( ' ', $flags ) . ']' : ''
        );
    }

    // ---- Per-coupon breakdown ----
    $coupons = array();
    foreach ( $cart->get_applied_coupons() as $code ) {
        $amt  = $cart->get_coupon_discount_amount( $code, $cart->display_cart_ex_tax );
        $type = '';
        if ( class_exists( 'WC_Coupon' ) ) {
            $c    = new WC_Coupon( $code );
            $type = $c->get_discount_type();
        }
        $coupons[] = sprintf( '    %-24s type=%-16s discount=$%.2f', $code, $type, (float) $amt );
    }

    $totals = $cart->get_totals();
    $msg = "TRIGGER: $trigger\n"
        . sprintf(
            "  TOTALS: items_subtotal=$%.2f discount=$%.2f shipping=$%.2f total=$%.2f\n",
            (float) ( $totals['subtotal'] ?? 0 ),
            (float) ( $totals['discount_total'] ?? 0 ),
            (float) ( $totals['shipping_total'] ?? 0 ),
            (float) ( $totals['total'] ?? 0 )
        )
        . "  LINES:\n" . ( $lines ? implode( "\n", $lines ) : '    (empty)' ) . "\n"
        . "  COUPONS:\n" . ( $coupons ? implode( "\n", $coupons ) : '    (none)' );

    wc_get_logger()->info( $msg, array( 'source' => 'mf-discount-forensics' ) );

    return $response;
}, 100, 3 );
