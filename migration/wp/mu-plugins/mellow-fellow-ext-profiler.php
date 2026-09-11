<?php
/**
 * Plugin Name: Mellow Fellow - Store API Extension Profiler (TEMPORARY)
 * Description: Wraps each registered Store API cart-item extension data_callback to
 *   measure its cumulative time + DB queries across a request. Pinpoints which
 *   extension (WebToffee, subscriptions, bundle-builder, ours, klaviyo, avatax…)
 *   is responsible for the per-item N+1 query cost that makes GET /cart scale
 *   badly with cart size. Logs an EXT-PROF line per Store API request under
 *   source "mf-cart-forensics". REMOVE when the cart-perf investigation is done.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$GLOBALS['mf_ext_prof'] = array();

add_action( 'woocommerce_blocks_loaded', function () {
	if ( ! class_exists( '\Automattic\WooCommerce\StoreApi\StoreApi' ) ) {
		return;
	}
	try {
		$ext = \Automattic\WooCommerce\StoreApi\StoreApi::container()->get(
			\Automattic\WooCommerce\StoreApi\Schemas\ExtendSchema::class
		);
	} catch ( \Throwable $e ) {
		return;
	}
	if ( ! $ext ) {
		return;
	}

	try {
		$prop = new ReflectionProperty( $ext, 'extend_data' );
		$prop->setAccessible( true );
		$data = $prop->getValue( $ext );
	} catch ( \Throwable $e ) {
		return;
	}

	// Wrap callbacks on BOTH the per-item ('cart-item') and cart-level ('cart')
	// endpoints. WebToffee's wt_sc_blocks and others register on 'cart' (runs once
	// per cart response but can scan every coupon), which is where the GET /cart
	// query cost likely hides. Label each namespace with its endpoint.
	foreach ( array( 'cart', 'cart-item' ) as $endpoint ) {
		if ( empty( $data[ $endpoint ] ) || ! is_array( $data[ $endpoint ] ) ) {
			continue;
		}
		foreach ( $data[ $endpoint ] as $ns => $cbs ) {
			if ( empty( $cbs['data_callback'] ) || ! is_callable( $cbs['data_callback'] ) ) {
				continue;
			}
			$orig  = $cbs['data_callback'];
			$label = ( $endpoint === 'cart' ? 'CART:' : 'ITEM:' ) . $ns;
			$data[ $endpoint ][ $ns ]['data_callback'] = function ( $item ) use ( $orig, $label ) {
				global $wpdb;
				$q0  = isset( $wpdb ) ? (int) $wpdb->num_queries : 0;
				$t0  = microtime( true );
				$res = call_user_func( $orig, $item );
				if ( ! isset( $GLOBALS['mf_ext_prof'][ $label ] ) ) {
					$GLOBALS['mf_ext_prof'][ $label ] = array( 'ms' => 0.0, 'q' => 0, 'n' => 0 );
				}
				$GLOBALS['mf_ext_prof'][ $label ]['ms'] += ( microtime( true ) - $t0 ) * 1000;
				$GLOBALS['mf_ext_prof'][ $label ]['q']  += ( isset( $wpdb ) ? (int) $wpdb->num_queries : 0 ) - $q0;
				$GLOBALS['mf_ext_prof'][ $label ]['n']++;
				return $res;
			};
		}
	}

	try {
		$prop->setValue( $ext, $data );
	} catch ( \Throwable $e ) {
		return;
	}
}, 99999 );

add_filter( 'rest_post_dispatch', function ( $response, $server, $request ) {
	if ( strpos( $request->get_route(), '/wc/store/' ) !== 0 ) {
		return $response;
	}
	if ( empty( $GLOBALS['mf_ext_prof'] ) || ! function_exists( 'wc_get_logger' ) ) {
		return $response;
	}
	// Sort namespaces by cumulative time, worst first.
	$rows = $GLOBALS['mf_ext_prof'];
	uasort( $rows, function ( $a, $b ) {
		return $b['ms'] <=> $a['ms'];
	} );
	$parts = array();
	foreach ( $rows as $ns => $r ) {
		$parts[] = sprintf( '%s=%dms/%dq/%dn', $ns, round( $r['ms'] ), $r['q'], $r['n'] );
	}
	wc_get_logger()->info(
		'EXT-PROF: ' . $request->get_method() . ' ' . $request->get_route() . ' | ' . implode( ' ; ', $parts ),
		array( 'source' => 'mf-cart-forensics' )
	);
	$GLOBALS['mf_ext_prof'] = array();
	return $response;
}, 998, 3 );
