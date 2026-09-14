<?php
/**
 * Plugin Name: Mellow Fellow - Auto-Coupon Stabilizer
 * Description: Makes WebToffee auto-apply coupons safe under the WooCommerce
 *   Store API (headless cart). The Store API re-validates every applied coupon on
 *   every request and REMOVES any that are momentarily invalid. WebToffee re-adds
 *   auto-coupons on every calculate_totals() and decides "should I re-run?" from a
 *   hash that INCLUDES the applied-coupon set. So a Store-API removal changes that
 *   hash, which re-fires auto-apply, which re-adds the coupon, which the Store API
 *   removes again — an add/remove war that (a) floods the cart with "not applicable"
 *   notices, (b) sweeps the free-gift coupon out in the churn, and (c) runs
 *   calculate_totals 10x+ per request, which is what makes add-to-cart / add-bundle
 *   time out. Proven via the mf-discount-forensics backtraces (Sep 2026).
 *
 *   Two guards break the loop:
 *     1. Drop the applied-coupon set from the auto-apply trigger hash, so a coupon
 *        being removed can never re-fire auto-apply. Auto-apply then re-runs only
 *        when the cart CONTENTS (or payment/shipping) actually change — which is the
 *        correct trigger. The loop cannot sustain: apply once, and if the Store API
 *        removes it, it stays removed until the cart really changes.
 *     2. Live-revalidate WebToffee's (cached) auto-coupon candidate list against the
 *        CURRENT cart, so a coupon is never re-applied to a cart it is not valid for
 *        (WebToffee caches the list per request and reuses it as the cart mutates).
 *
 *   Both are additive filters on documented-enough WebToffee hooks; remove this file
 *   to fully revert. Auto-apply keeps working as marketing intends: applies once when
 *   the cart qualifies, stays applied, recalculates correctly, and honors removal.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Guard 1 — remove the applied-coupon set from the auto-apply trigger hash.
 *
 * WebToffee builds this hash in get_current_hash_values() and only re-runs
 * auto_apply_coupons() when the hash changes. Leaving 'current_coupons' in it means
 * any coupon add/remove (including the Store API's own validation removal) re-triggers
 * auto-apply — the engine of the war. Cart contents, payment and shipping method stay
 * in the hash, so legitimate re-evaluation on real cart changes is unaffected.
 */
add_filter( 'wt_smart_coupon_auto_coupon_triggers', function ( $hash ) {
	if ( is_array( $hash ) ) {
		unset( $hash['current_coupons'] );
	}
	return $hash;
}, 10, 1 );

/**
 * Guard 2 — live-revalidate the cached auto-coupon list against the current cart.
 *
 * get_available_auto_coupons() caches its candidate list in a per-request property and
 * returns it (via this filter) without recomputing. As the cart mutates within a
 * request, that cached list can still contain a coupon that is no longer valid for the
 * cart. Re-checking each candidate with WC core's own validator here means a coupon is
 * only ever (re)applied when WooCommerce itself considers it valid — so the Store API
 * has nothing to remove, and no "not applicable" notice is produced.
 */
add_filter( 'wt_sc_auto_coupons_list', function ( $list ) {
	// Not yet computed (false) or nothing cached — let WebToffee compute normally;
	// its own computation path already validates candidates.
	if ( ! is_array( $list ) || empty( $list ) ) {
		return $list;
	}
	if ( ! function_exists( 'WC' ) || ! WC()->cart || ! class_exists( 'WC_Discounts' ) || ! class_exists( 'WC_Coupon' ) ) {
		return $list;
	}

	$discounts = new WC_Discounts( WC()->cart );

	foreach ( $list as $code => $coupon ) {
		$coupon_obj = ( $coupon instanceof WC_Coupon ) ? $coupon : new WC_Coupon( $code );
		$valid      = $discounts->is_coupon_valid( $coupon_obj );
		if ( is_wp_error( $valid ) ) {
			unset( $list[ $code ] );
		}
	}

	return $list;
}, 10, 1 );
