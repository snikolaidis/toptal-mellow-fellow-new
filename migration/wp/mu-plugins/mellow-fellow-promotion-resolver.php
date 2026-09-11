<?php
/**
 * Plugin Name: Mellow Fellow - Promotion Resolver (WooCommerce adapter)
 * Description: Thin WooCommerce adapter over the framework-independent promotion engine
 *   (mf-promotions/). Builds cart lines + normalized rules from WooCommerce, calls
 *   PromotionEngine::resolve(), and applies the returned per-line discounts as line PRICES.
 *   Because the engine is deterministic and idempotent, there is no re-applied coupon for the
 *   Store API to re-validate/remove (the add/remove "war"), no notice flood, no gift eviction,
 *   and far fewer calculate_totals cycles (fixes add-to-cart / add-bundle timeouts).
 *
 *   The math lives in the unit-tested engine core (mf-promotions/src) — this file only
 *   translates between WooCommerce and that core. Authoring is UNCHANGED (WebToffee screens).
 *
 *   SAFETY:
 *     - Feature-flagged. Inert (WebToffee behaves as today) unless enabled via option
 *       'mf_promo_resolver_enabled' = 'yes' or constant MF_PROMO_RESOLVER_ENABLED.
 *     - Fail-safe: a coupon/BOGO it can't read cleanly, or a giveaway BOGO mode not yet
 *       ported, is skipped and logged (source mf-promo-resolver) — never applied wrong.
 *     - Version guard on the WebToffee meta reader.
 *
 *   Covered now (delegated to the engine, all unit-tested): automatic percent/fixed-product/
 *   fixed-cart coupons; BOGO cheapest/expensive/same-product (free / % / fixed-off / final
 *   price; once/repeatedly/custom). Free gift stays on its native coupon here, protected +
 *   threshold-hardened, until the Phase 3 frontend rework moves it fully into the engine.
 *   Giveaway BOGO (add a different product / choose-your-free) is skipped+logged (Phase 3).
 * Version: 0.3.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once __DIR__ . '/mf-promotions/src/Line.php';
require_once __DIR__ . '/mf-promotions/src/Rule.php';
require_once __DIR__ . '/mf-promotions/src/Result.php';
require_once __DIR__ . '/mf-promotions/src/PromotionEngine.php';

use MellowFellow\Promotions\Line;
use MellowFellow\Promotions\Rule;
use MellowFellow\Promotions\PromotionEngine;

if ( ! defined( 'MF_WT_TESTED_VERSION' ) ) {
	define( 'MF_WT_TESTED_VERSION', '3.9.0' );
}

function mf_resolver_enabled() {
	if ( defined( 'MF_PROMO_RESOLVER_ENABLED' ) ) {
		return (bool) MF_PROMO_RESOLVER_ENABLED;
	}
	return 'yes' === get_option( 'mf_promo_resolver_enabled', 'no' );
}

function mf_resolver_log( $message ) {
	if ( function_exists( 'wc_get_logger' ) ) {
		wc_get_logger()->warning( $message, array( 'source' => 'mf-promo-resolver' ) );
	}
}

/* ------------------------------------------------------------------ *
 * 1. Hand automatic-promotion runtime from WebToffee to the resolver
 * ------------------------------------------------------------------ */

// Primary, TIMING-INDEPENDENT kill for auto-apply: force WebToffee's available-auto-coupon
// list to empty. get_available_auto_coupons() runs this filter, so auto-apply then has nothing
// to add — no WT auto coupon is applied, and the Store API's validate_cart_coupons has nothing
// to remove (which is what caused the add/remove war + gift eviction). Our engine still applies
// the same coupons' discounts via line pricing, read straight from the coupon meta. Registered
// at file load so it's active however late WebToffee builds its list.
if ( mf_resolver_enabled() ) {
	add_filter( 'wt_sc_auto_coupons_list', '__return_empty_array', 9999 );
}

/**
 * Remove WebToffee's auto-apply + BOGO runtime hooks. WebToffee registers some of these LATE
 * (only during the frontend/REST request, after wp_loaded), so removing at wp_loaded alone
 * missed them — the bug that kept the war alive. We therefore also run this right before every
 * totals calculation, when the hooks are guaranteed to be registered. Idempotent.
 */
function mf_resolver_disable_wt_runtime() {
	if ( ! mf_resolver_enabled() ) {
		return; // flag off — WebToffee keeps running exactly as today
	}
	if ( class_exists( 'Wt_Smart_Coupon_Auto_Coupon_Public' ) ) {
		$ac = Wt_Smart_Coupon_Auto_Coupon_Public::get_instance();
		remove_action( 'woocommerce_after_calculate_totals', array( $ac, 'maybe_apply_auto_coupons' ), 1000 );
		remove_action( 'woocommerce_check_cart_items', array( $ac, 'woocommerce_check_cart_items' ), 0 );
	}
	if ( class_exists( 'Wbte_Smart_Coupon_Bogo_Public' ) ) {
		$bogo = Wbte_Smart_Coupon_Bogo_Public::get_instance();
		remove_filter( 'woocommerce_coupon_get_discount_amount', array( $bogo, 'get_cheap_exp_discount_amount' ), 10 );
		remove_filter( 'woocommerce_coupon_get_discount_amount', array( $bogo, 'get_bxgx_discount_amount' ), 10 );
		remove_filter( 'woocommerce_coupon_get_discount_amount', array( $bogo, 'alter_discount_amount_for_giveaway_products' ), 9 );
		remove_action( 'woocommerce_after_calculate_totals', array( $bogo, 'reprocess_bogo_giveaway_qty_after_recalc' ) );
	}
}
add_action( 'wp_loaded', 'mf_resolver_disable_wt_runtime', 20 );
// WebToffee registers auto-apply/BOGO hooks late in the request; re-remove them right before
// each totals calc (priority 0, before our resolver at 20) so they never fire.
add_action( 'woocommerce_before_calculate_totals', 'mf_resolver_disable_wt_runtime', 0 );

/* ------------------------------------------------------------------ *
 * 2. Free-gift threshold: evaluate on PRE-discount subtotal
 * ------------------------------------------------------------------ *
 * The gift stays on its native mf-free-gift coupon for now (stable once the war is gone).
 * Engine discounts lower line prices, which would lower the subtotal the coupon's minimum is
 * checked against and could evict the gift. Evaluate the gift coupon's minimum against the
 * pre-discount subtotal (excluding the gift's own line) so promotions can never evict it.
 */
add_filter( 'woocommerce_coupon_validate_minimum_amount', function ( $below, $coupon, $subtotal ) {
	if ( ! mf_resolver_enabled() || ! is_object( $coupon ) ) {
		return $below;
	}
	$code = $coupon->get_code();
	if ( 0 !== strpos( $code, 'mf-free-gift-' ) || ! function_exists( 'WC' ) || ! WC()->cart ) {
		return $below;
	}
	$gift_pid = (int) str_replace( 'mf-free-gift-', '', $code );
	$pre = 0.0;
	foreach ( WC()->cart->get_cart() as $item ) {
		if ( (int) $item['product_id'] === $gift_pid ) {
			continue; // exclude the gift's own line from the threshold
		}
		$pre += mf_resolver_base_price( $item ) * (int) $item['quantity'];
	}
	return $coupon->get_minimum_amount() > $pre;
}, 10, 3 );

/* ------------------------------------------------------------------ *
 * 3. Resolve: build lines + rules, call the engine, apply as prices
 * ------------------------------------------------------------------ */

add_action( 'woocommerce_before_calculate_totals', 'mf_resolve_promotions', 20 );

function mf_resolve_promotions( $cart ) {
	if ( ! mf_resolver_enabled() || ! $cart || ! is_object( $cart ) ) {
		return;
	}
	if ( is_admin() && ! defined( 'DOING_AJAX' ) && ! defined( 'REST_REQUEST' ) && ! defined( 'MF_RESOLVER_CLI' ) ) {
		return;
	}

	$lines = mf_resolver_build_lines( $cart );
	$rules = mf_resolver_build_rules( $cart );
	if ( empty( $lines ) ) {
		$GLOBALS['mf_active_promotions'] = array();
		return;
	}

	$engine = new PromotionEngine( function_exists( 'wc_get_price_decimals' ) ? wc_get_price_decimals() : 2 );
	$result = $engine->resolve( $lines, $rules );

	foreach ( $cart->get_cart() as $key => $item ) {
		$cut = $result->discountForLine( (string) $key );
		if ( $cut <= 0 ) {
			continue;
		}
		$qty  = max( 1, (int) $item['quantity'] );
		$base = mf_resolver_base_price( $item );
		$new  = ( ( $base * $qty ) - $cut ) / $qty;
		if ( $new < 0 ) {
			$new = 0;
		}
		$item['data']->set_price( round( $new, function_exists( 'wc_get_price_decimals' ) ? wc_get_price_decimals() : 2 ) );
	}

	// Build the chip list, but do NOT double-represent a promotion that the customer applied as
	// a typed code (e.g. a manual BOGO): WooCommerce already shows that as a removable coupon
	// chip, so adding an engine chip for the same code would duplicate it. Only truly automatic
	// promotions (not in the applied-coupon set) get an engine chip.
	$applied_codes = array_map( 'strtolower', (array) $cart->get_applied_coupons() );
	$active = array();
	foreach ( $result->applied as $p ) {
		if ( in_array( strtolower( (string) $p['id'] ), $applied_codes, true ) ) {
			continue; // already shown as a coupon chip
		}
		$active[] = array(
			'code'      => $p['id'],
			'label'     => $p['label'],
			'amount'    => $p['amount'],
			'removable' => false,
		);
	}
	$GLOBALS['mf_active_promotions'] = $active;
}

/* ------------------------------------------------------------------ *
 * 4. WooCommerce -> engine translation
 * ------------------------------------------------------------------ */

/** @return Line[] */
function mf_resolver_build_lines( $cart ) {
	$lines = array();
	$gift_pids = mf_resolver_applied_gift_pids();
	foreach ( $cart->get_cart() as $key => $item ) {
		$pid = (int) $item['product_id'];
		$lines[] = Line::fromArray( array(
			'key'          => (string) $key,
			'product_id'   => $pid,
			'variation_id' => (int) ( $item['variation_id'] ?? 0 ),
			'price'        => mf_resolver_base_price( $item ),
			'qty'          => (int) $item['quantity'],
			'category_ids' => function_exists( 'wc_get_product_cat_ids' ) ? wc_get_product_cat_ids( $pid ) : array(),
			'is_bundle'    => ! empty( $item['bb_group_key'] ),
			'is_gift'      => in_array( $pid, $gift_pids, true ) || ! empty( $item['_mf_gift'] ),
		) );
	}
	return $lines;
}

/** @return Rule[] */
function mf_resolver_build_rules( $cart ) {
	// Lean approach: Smart Coupons stays the authoring tool; the engine reads its live config
	// and only replaces the auto-apply + BOGO runtime that fought the Store API.
	mf_resolver_version_guard();
	$rules = array();

	// --- Automatic percent / fixed coupons ---
	$auto_ids = get_posts( array(
		'post_type' => 'shop_coupon', 'post_status' => 'publish', 'numberposts' => -1,
		'meta_key' => '_wt_make_auto_coupon', 'meta_value' => '1', 'fields' => 'ids', 'no_found_rows' => true,
	) );
	$discounts = new WC_Discounts( $cart );
	foreach ( $auto_ids as $id ) {
		$coupon = new WC_Coupon( $id );
		$dtype  = $coupon->get_discount_type();
		if ( ! in_array( $dtype, array( 'percent', 'fixed_product', 'fixed_cart' ), true ) ) {
			continue; // BOGO handled below; other exotic types skipped
		}
		// Honor full WC validity (email/usage/date/etc.) at selection time; the engine then
		// handles line-level scope + deterministic pricing.
		if ( is_wp_error( $discounts->is_coupon_valid( $coupon ) ) ) {
			continue;
		}
		$type_map = array(
			'percent'       => Rule::TYPE_AUTO_PERCENT,
			'fixed_product' => Rule::TYPE_AUTO_FIXED_PRODUCT,
			'fixed_cart'    => Rule::TYPE_AUTO_FIXED_CART,
		);
		$rules[] = Rule::fromArray( array_merge(
			array(
				'id'          => $coupon->get_code(),
				'label'       => mf_resolver_label( $coupon ),
				'type'        => $type_map[ $dtype ],
				'amount'      => (float) $coupon->get_amount(),
				'priority'    => (int) ( get_post_meta( $id, '_mf_promo_priority', true ) ?: 20 ),
				'exclusivity' => 'yes' === get_post_meta( $id, '_mf_promo_exclusive', true ) ? Rule::EXCL_EXCLUSIVE : Rule::EXCL_UNIVERSAL,
				'min_subtotal' => $coupon->get_minimum_amount() ? (float) $coupon->get_minimum_amount() : null,
			),
			mf_resolver_coupon_scope( $id, $coupon )
		) );
	}

	// --- BOGO (auto, or manual code the customer applied) ---
	$applied = $cart->get_applied_coupons();
	$bogo_ids = get_posts( array(
		'post_type' => 'shop_coupon', 'post_status' => 'publish', 'numberposts' => -1,
		'meta_key' => 'discount_type', 'meta_value' => 'wbte_sc_bogo', 'fields' => 'ids', 'no_found_rows' => true,
	) );
	foreach ( $bogo_ids as $id ) {
		$code    = wc_get_coupon_code_by_id( $id );
		$is_auto = '1' === get_post_meta( $id, '_wt_make_auto_coupon', true );
		if ( ! $is_auto && ! in_array( $code, $applied, true ) ) {
			continue; // manual BOGO not applied by the customer
		}
		$rule = mf_resolver_build_bogo_rule( $id, $code );
		if ( null === $rule ) {
			continue; // unsupported/giveaway mode or unreadable — logged, safely skipped
		}
		$rules[] = $rule;
	}

	return $rules;
}

/** Map a coupon's product/category/collection scope to engine Rule scope fields. */
function mf_resolver_coupon_scope( $id, $coupon ) {
	$scope_products   = array_map( 'intval', $coupon->get_product_ids() );
	$scope_categories = array_map( 'intval', $coupon->get_product_categories() );
	$excl_products    = array_map( 'intval', $coupon->get_excluded_product_ids() );
	$excl_categories  = array_map( 'intval', $coupon->get_excluded_product_categories() );

	if ( function_exists( 'mf_get_products_in_collections' ) ) {
		$inc = get_post_meta( $id, '_mf_coupon_collections', true );
		if ( $inc ) {
			$scope_products = array_merge( $scope_products, mf_get_products_in_collections( array_filter( array_map( 'trim', explode( ',', $inc ) ) ) ) );
		}
		$exc = get_post_meta( $id, '_mf_coupon_exclude_collections', true );
		if ( $exc ) {
			$excl_products = array_merge( $excl_products, mf_get_products_in_collections( array_filter( array_map( 'trim', explode( ',', $exc ) ) ) ) );
		}
	}
	return array(
		'scope_products'    => array_values( array_unique( $scope_products ) ),
		'scope_categories'  => $scope_categories,
		'exclude_products'  => array_values( array_unique( $excl_products ) ),
		'exclude_categories' => $excl_categories,
	);
}

/**
 * Build an engine BOGO Rule from a WebToffee BOGO coupon, or null (skip+log) for a giveaway
 * mode not yet ported. This is the ONLY place WebToffee BOGO meta is read.
 */
function mf_resolver_build_bogo_rule( $id, $code ) {
	$m = function ( $k ) use ( $id ) {
		return get_post_meta( $id, $k, true );
	};

	$type = $m( 'wbte_sc_bogo_type' );
	$gets = $m( 'wbte_sc_bogo_customer_gets' );

	if ( 'wbte_sc_bogo_cheap_expensive' === $type ) {
		$select = ( 'wbte_sc_bogo_customer_gets_expensive' === $m( 'wbte_sc_bogo_customer_gets_cheap_exp' ) ) ? 'expensive' : 'cheapest';
	} elseif ( 'wbte_sc_bogo_bxgx' === $type && 'same_product' === $gets ) {
		$select = 'same';
	} else {
		// Giveaway of a different / chosen product needs cart-add + choose UI (Phase 3).
		mf_resolver_log( "BOGO {$id} ({$code}): mode type='{$type}' gets='{$gets}' not yet ported — skipped (fail-safe)." );
		return null;
	}

	// Discount type.
	$gets_with = $m( 'wbte_sc_bogo_customer_gets_with' );
	if ( 'wbte_sc_bogo_customer_gets_with_final_price' === $gets_with ) {
		$discount_type = 'final';
	} else {
		$dt = $m( 'wbte_sc_bogo_customer_gets_discount_type' );
		if ( 'wbte_sc_bogo_customer_gets_free' === $dt ) {
			$discount_type = 'free';
		} elseif ( 'wbte_sc_bogo_customer_gets_with_perc_discount' === $dt ) {
			$discount_type = 'perc';
		} else {
			$discount_type = 'price';
		}
	}

	$apply_raw = $m( 'wbte_sc_bogo_apply_offer' );
	$apply = 'once';
	if ( 'wbte_sc_bogo_apply_repeatedly' === $apply_raw ) {
		$apply = 'repeatedly';
	} elseif ( 'wbte_sc_bogo_apply_custom' === $apply_raw ) {
		$apply = 'custom';
	}

	$custom = array();
	if ( 'custom' === $apply ) {
		$mins  = array_map( 'trim', explode( ',', (string) $m( 'wbte_sc_bogo_apply_custom_min' ) ) );
		$maxs  = array_map( 'trim', explode( ',', (string) $m( 'wbte_sc_bogo_apply_custom_max' ) ) );
		$times = array_map( 'trim', explode( ',', (string) $m( 'wbte_sc_bogo_apply_custom_times' ) ) );
		foreach ( $mins as $i => $min ) {
			$custom[] = array( 'min' => (float) $min, 'max' => (float) ( $maxs[ $i ] ?? 0 ), 'times' => (int) ( $times[ $i ] ?? 0 ) );
		}
	}

	$bogo = array(
		'select'        => $select,
		'discount_type' => $discount_type,
		'perc'          => (float) $m( 'wbte_sc_bogo_customer_gets_discount_perc' ),
		'price'         => (float) $m( 'wbte_sc_bogo_customer_gets_discount_price' ),
		'final'         => (float) $m( 'wbte_sc_bogo_customer_gets_final_price' ),
		'gets_qty'      => (int) $m( 'wbte_sc_bogo_customer_gets_qty' ),
		'apply'         => $apply,
		'repeat_times'  => (int) $m( 'wbte_sc_bogo_repeatedly_times' ),
		'triggers'      => ( 'wbte_sc_bogo_triggers_amount' === $m( 'wbte_sc_bogo_triggers_when' ) ) ? 'amount' : 'qty',
		'min_qty'       => (int) $m( '_wbte_sc_bogo_min_qty' ),
		'min_amount'    => (float) $m( '_wbte_sc_bogo_min_amount' ),
		'custom'        => $custom,
	);

	// Scope = WebToffee's native product/category restrictions PLUS our custom BOGO
	// collection restrictions (_mf_bogo_collections). When the engine runs, WebToffee's
	// BOGO runtime (which used to enforce the collection filter via
	// wbte_sc_alter_items_to_validate) is disabled, so the engine must enforce it here.
	$scope_products  = mf_resolver_ids( $m( 'wbte_sc_bogo_product_ids' ) );
	$exclude_products = mf_resolver_ids( $m( 'wbte_sc_bogo_exclude_product_ids' ) );
	if ( function_exists( 'mf_get_products_in_collections' ) ) {
		$inc = $m( '_mf_bogo_collections' );
		if ( $inc ) {
			$scope_products = array_merge( $scope_products, mf_get_products_in_collections( array_filter( array_map( 'trim', explode( ',', $inc ) ) ) ) );
		}
		$exc = $m( '_mf_bogo_exclude_collections' );
		if ( $exc ) {
			$exclude_products = array_merge( $exclude_products, mf_get_products_in_collections( array_filter( array_map( 'trim', explode( ',', $exc ) ) ) ) );
		}
	}

	$label = $m( 'wbte_sc_bogo_coupon_name' );
	return Rule::fromArray( array(
		'id'          => $code,
		'label'       => $label ?: strtoupper( (string) $code ),
		'type'        => Rule::TYPE_BOGO,
		'priority'    => (int) ( get_post_meta( $id, '_mf_promo_priority', true ) ?: 30 ),
		'exclusivity' => 'yes' === get_post_meta( $id, '_mf_promo_exclusive', true ) ? Rule::EXCL_EXCLUSIVE : Rule::EXCL_UNIVERSAL,
		'bogo'        => $bogo,
		'scope_products'     => array_values( array_unique( $scope_products ) ),
		'scope_categories'   => mf_resolver_ids( $m( 'wbte_sc_bogo_product_categories' ) ),
		'exclude_products'   => array_values( array_unique( $exclude_products ) ),
		'exclude_categories' => mf_resolver_ids( $m( 'wbte_sc_bogo_exclude_product_categories' ) ),
	) );
}

/* ------------------------------------------------------------------ *
 * 5. Helpers
 * ------------------------------------------------------------------ */

/** Product ids referenced by currently-applied mf-free-gift-* coupons. */
function mf_resolver_applied_gift_pids() {
	$pids = array();
	if ( function_exists( 'WC' ) && WC()->cart ) {
		foreach ( WC()->cart->get_applied_coupons() as $code ) {
			if ( 0 === strpos( $code, 'mf-free-gift-' ) ) {
				$pids[] = (int) str_replace( 'mf-free-gift-', '', $code );
			}
		}
	}
	return $pids;
}

/** Unmutated base = the _price postmeta (SALE price when on sale, else regular). */
function mf_resolver_base_price( $item ) {
	$pid = ! empty( $item['variation_id'] ) ? (int) $item['variation_id'] : (int) $item['product_id'];
	$price = get_post_meta( $pid, '_price', true );
	if ( '' === $price ) {
		$price = get_post_meta( $pid, '_regular_price', true );
	}
	return (float) $price;
}

function mf_resolver_label( $coupon ) {
	$name = get_post_meta( $coupon->get_id(), 'wbte_sc_bogo_coupon_name', true );
	return $name ? $name : strtoupper( $coupon->get_code() );
}

function mf_resolver_ids( $raw ) {
	if ( is_array( $raw ) ) {
		return array_map( 'intval', $raw );
	}
	if ( '' === $raw || null === $raw ) {
		return array();
	}
	return array_values( array_filter( array_map( 'intval', array_map( 'trim', explode( ',', (string) $raw ) ) ) ) );
}

function mf_resolver_version_guard() {
	static $checked = false;
	if ( $checked ) {
		return;
	}
	$checked = true;
	$live = get_option( 'wbte_sc_activation_hook_version', '' );
	if ( $live && version_compare( $live, MF_WT_TESTED_VERSION, '!=' ) ) {
		mf_resolver_log( "WebToffee version {$live} differs from tested " . MF_WT_TESTED_VERSION . " — verify the BOGO meta reader before trusting BOGO discounts." );
	}
}

/* ------------------------------------------------------------------ *
 * 6. Expose active promotions in the Store API cart response (chips)
 * ------------------------------------------------------------------ */

add_action( 'woocommerce_blocks_loaded', function () {
	if ( ! function_exists( 'woocommerce_store_api_register_endpoint_data' ) ) {
		return;
	}
	woocommerce_store_api_register_endpoint_data( array(
		'endpoint'        => 'cart',
		'namespace'       => 'mellow-fellow-promotions',
		'data_callback'   => function () {
			return array( 'promotions' => isset( $GLOBALS['mf_active_promotions'] ) ? $GLOBALS['mf_active_promotions'] : array() );
		},
		'schema_callback' => function () {
			return array(
				'promotions' => array(
					'description' => 'Automatic promotions applied by the resolver (locked cart chips).',
					'type'        => 'array',
					'readonly'    => true,
				),
			);
		},
	) );
} );
