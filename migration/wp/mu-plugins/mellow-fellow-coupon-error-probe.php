<?php
/**
 * Plugin Name: Mellow Fellow - Coupon Error Probe (TEMPORARY)
 * Description: Logs the EXACT reason WooCommerce/WebToffee deems any coupon invalid, so we can
 *   see why foreverfall + the free gift get removed by the Store API's validate_cart_coupons.
 *   View under WooCommerce → Status → Logs → source "mf-coupon-error". REMOVE when done.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Fires whenever a coupon is judged invalid during validation — carries the error code + message.
add_filter( 'woocommerce_coupon_error', function ( $err, $code, $coupon ) {
	if ( function_exists( 'wc_get_logger' ) ) {
		$cc = is_object( $coupon ) && method_exists( $coupon, 'get_code' ) ? $coupon->get_code() : '';
		wc_get_logger()->info(
			'COUPON ERROR: coupon=' . $cc . ' err_code=' . $code . ' msg=' . wp_strip_all_tags( (string) $err ),
			array( 'source' => 'mf-coupon-error' )
		);
	}
	return $err;
}, 10, 3 );

// Also record the final applied set right after the Store API validates coupons, so we can see
// what survived vs. what got stripped, per request.
add_filter( 'woocommerce_coupon_is_valid', function ( $valid, $coupon, $discounts ) {
	if ( function_exists( 'wc_get_logger' ) && is_object( $coupon ) ) {
		$code = $coupon->get_code();
		if ( 0 === strpos( $code, 'mf-free-gift-' ) || 'foreverfalltest' === $code ) {
			wc_get_logger()->info(
				'IS_VALID CHECK: coupon=' . $code . ' valid_in=' . ( $valid ? '1' : '0' ),
				array( 'source' => 'mf-coupon-error' )
			);
		}
	}
	return $valid;
}, 9999, 3 );
