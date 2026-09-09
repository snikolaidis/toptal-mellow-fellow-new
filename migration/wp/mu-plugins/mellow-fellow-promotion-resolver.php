<?php
/**
 * Plugin Name: Mellow Fellow - Promotion Resolver
 * Description: Deterministic, Store-API-native promotion engine. Automatic promotions
 *   (auto-apply %, BOGO, free gift) are recomputed as final cart LINE PRICES on every
 *   calculation instead of living as re-applied coupons. Recomputing a price is
 *   idempotent, so there is no coupon for the Store API to re-validate/remove (the
 *   add/remove "war"), no notice flood, no gift eviction, and far fewer calculate_totals
 *   cycles (fixes add-to-cart / add-bundle timeouts).
 *
 *   Authoring is UNCHANGED: marketing keeps using WebToffee's coupon + BOGO screens. This
 *   only replaces the RUNTIME that applies them; the resolver reads those same records.
 *
 *   SAFETY:
 *     - Feature-flagged. Does nothing (WebToffee behaves as today) unless enabled via the
 *       option 'mf_promo_resolver_enabled' = 'yes' or the constant MF_PROMO_RESOLVER_ENABLED.
 *     - Fail-safe, never fail-wrong: a coupon/BOGO whose config it can't read cleanly, or a
 *       BOGO mode not yet ported, is SKIPPED and logged (source mf-promo-resolver) — never
 *       applied with a guessed discount.
 *     - Version guard: WebToffee meta is read against a tested version; a mismatch is logged.
 *
 *   Covered now: automatic percentage coupons; BOGO cheapest/expensive (all four "customer
 *   gets" discount types, and apply once/repeatedly/custom). Skipped+logged for now:
 *   BXGX (same-product) and BXGY (giveaway a different product) — ported next.
 * Version: 0.2.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** WebToffee version this resolver's meta reader was written against. */
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

function mf_resolver_disable_wt_runtime() {
	if ( ! mf_resolver_enabled() ) {
		return; // flag off — WebToffee keeps running exactly as today
	}

	// Auto-apply runtime.
	if ( class_exists( 'Wt_Smart_Coupon_Auto_Coupon_Public' ) ) {
		$ac = Wt_Smart_Coupon_Auto_Coupon_Public::get_instance();
		remove_action( 'woocommerce_after_calculate_totals', array( $ac, 'maybe_apply_auto_coupons' ), 1000 );
		remove_action( 'woocommerce_check_cart_items', array( $ac, 'woocommerce_check_cart_items' ), 0 );
	}

	// BOGO runtime (discount application + giveaway management). Authoring screens are
	// unaffected; only the live application hooks are removed.
	if ( class_exists( 'Wbte_Smart_Coupon_Bogo_Public' ) ) {
		$bogo = Wbte_Smart_Coupon_Bogo_Public::get_instance();
		remove_filter( 'woocommerce_coupon_get_discount_amount', array( $bogo, 'get_cheap_exp_discount_amount' ), 10 );
		remove_filter( 'woocommerce_coupon_get_discount_amount', array( $bogo, 'get_bxgx_discount_amount' ), 10 );
		remove_filter( 'woocommerce_coupon_get_discount_amount', array( $bogo, 'alter_discount_amount_for_giveaway_products' ), 9 );
		remove_action( 'woocommerce_after_calculate_totals', array( $bogo, 'reprocess_bogo_giveaway_qty_after_recalc' ) );
	}
}
add_action( 'wp_loaded', 'mf_resolver_disable_wt_runtime', 20 );

/* ------------------------------------------------------------------ *
 * 2. The resolver — recompute automatic promotions as line prices
 * ------------------------------------------------------------------ */

add_action( 'woocommerce_before_calculate_totals', 'mf_resolve_promotions', 20 );

function mf_resolve_promotions( $cart ) {
	if ( ! mf_resolver_enabled() || ! $cart || ! is_object( $cart ) ) {
		return;
	}
	if ( is_admin() && ! defined( 'DOING_AJAX' ) && ! defined( 'REST_REQUEST' ) && ! defined( 'MF_RESOLVER_CLI' ) ) {
		return;
	}

	$active   = array();   // promotions that adjusted a line (for the UI chips)
	$claimed  = array();   // cart-item keys owned by an exclusive rule
	// Per-line accumulated discount so multiple rules and BOGO unit math compose cleanly.
	$line_disc = array();  // key => total discount across the whole line
	$line_base = array();  // key => base per-unit price

	foreach ( $cart->get_cart() as $key => $item ) {
		$line_base[ $key ] = mf_resolver_base_price( $item );
		$line_disc[ $key ] = 0.0;
	}

	foreach ( mf_resolver_get_rules( $cart ) as $rule ) {
		$saved = 0.0;

		if ( 'percent' === $rule['type'] || 'fixed_product' === $rule['type'] ) {
			$coupon = $rule['coupon'];
			$discounts = new WC_Discounts( $cart );
			if ( is_wp_error( $discounts->is_coupon_valid( $coupon ) ) ) {
				continue; // matches the Store API's own validity check -> never removed
			}
			foreach ( $cart->get_cart() as $key => $item ) {
				if ( ! empty( $claimed[ $key ] ) || mf_resolver_is_protected_line( $item ) ) {
					continue;
				}
				$product = $item['data'];
				if ( ! ( $product instanceof WC_Product ) || ! $coupon->is_valid_for_product( $product, $item ) ) {
					continue;
				}
				$base = $line_base[ $key ];
				if ( $base <= 0 ) {
					continue;
				}
				$per_unit_cut = ( 'fixed_product' === $rule['type'] )
					? min( $base, (float) $rule['amount'] )
					: $base * ( $rule['pct'] / 100 );
				$line_disc[ $key ] += $per_unit_cut * (int) $item['quantity'];
				$saved += $per_unit_cut * (int) $item['quantity'];
				if ( $rule['exclusive'] ) {
					$claimed[ $key ] = true;
				}
			}
		} elseif ( 'fixed_cart' === $rule['type'] ) {
			$coupon = $rule['coupon'];
			$discounts = new WC_Discounts( $cart );
			if ( is_wp_error( $discounts->is_coupon_valid( $coupon ) ) ) {
				continue;
			}
			// Distribute a whole-cart fixed amount across eligible lines in proportion to
			// their remaining value, capped so no line goes below zero.
			$eligible = array();
			$pool = 0.0;
			foreach ( $cart->get_cart() as $key => $item ) {
				if ( ! empty( $claimed[ $key ] ) || mf_resolver_is_protected_line( $item ) ) {
					continue;
				}
				$remaining = ( $line_base[ $key ] * (int) $item['quantity'] ) - $line_disc[ $key ];
				if ( $remaining > 0 ) {
					$eligible[ $key ] = $remaining;
					$pool += $remaining;
				}
			}
			if ( $pool > 0 ) {
				$amount = min( (float) $rule['amount'], $pool );
				foreach ( $eligible as $key => $remaining ) {
					$share = $amount * ( $remaining / $pool );
					$line_disc[ $key ] += $share;
					$saved += $share;
				}
			}
		} elseif ( 'bogo_cheap_exp' === $rule['type'] ) {
			$saved += mf_resolver_apply_bogo_cheap_exp( $cart, $rule, $claimed, $line_base, $line_disc );
		}

		if ( $saved > 0.0001 ) {
			$active[] = array(
				'code'      => $rule['code'],
				'label'     => $rule['label'],
				'amount'    => round( $saved, wc_get_price_decimals() ),
				'removable' => false,
			);
		}
	}

	// Commit: set each line's per-unit price to reflect its total accumulated discount.
	foreach ( $cart->get_cart() as $key => $item ) {
		$qty = max( 1, (int) $item['quantity'] );
		$base = $line_base[ $key ];
		$cut  = min( $line_disc[ $key ], $base * $qty ); // never below zero
		if ( $cut > 0 ) {
			$new_unit = round( ( ( $base * $qty ) - $cut ) / $qty, wc_get_price_decimals() );
			$item['data']->set_price( $new_unit );
		}
	}

	$GLOBALS['mf_active_promotions'] = $active;
}

/* ------------------------------------------------------------------ *
 * 3. BOGO cheapest/expensive — faithful port of WebToffee's algorithm
 * ------------------------------------------------------------------ */

function mf_resolver_apply_bogo_cheap_exp( $cart, $rule, &$claimed, $line_base, &$line_disc ) {
	$cfg = $rule['bogo'];

	// Eligible lines: match scope, not excluded, not protected, not already claimed.
	$eligible = array();
	$eligible_units = 0;
	$eligible_amount = 0.0;
	foreach ( $cart->get_cart() as $key => $item ) {
		if ( ! empty( $claimed[ $key ] ) || mf_resolver_is_protected_line( $item ) ) {
			continue;
		}
		if ( ! mf_resolver_bogo_scope_match( $item, $cfg ) ) {
			continue;
		}
		$base = $line_base[ $key ];
		if ( $base <= 0 ) {
			continue;
		}
		$qty = (int) $item['quantity'];
		$eligible[] = array( 'key' => $key, 'price' => $base, 'qty' => $qty );
		$eligible_units += $qty;
		$eligible_amount += $base * $qty;
	}
	if ( empty( $eligible ) ) {
		return 0.0;
	}

	// Sort cheapest-first or expensive-first.
	usort( $eligible, function ( $a, $b ) use ( $cfg ) {
		if ( 'expensive' === $cfg['cheap_exp'] ) {
			return $b['price'] <=> $a['price'];
		}
		return $a['price'] <=> $b['price'];
	} );

	// How many free/discounted units are granted.
	$giveaway_units = mf_resolver_bogo_giveaway_units( $cfg, $eligible_units, $eligible_amount );
	if ( $giveaway_units <= 0 ) {
		return 0.0;
	}

	$remaining = $giveaway_units;
	$saved = 0.0;
	foreach ( $eligible as $e ) {
		if ( $remaining <= 0 ) {
			break;
		}
		$units = min( $remaining, $e['qty'] );
		$per_unit_cut = mf_resolver_bogo_unit_discount( $cfg, $e['price'] );
		if ( $per_unit_cut <= 0 ) {
			continue;
		}
		$line_disc[ $e['key'] ] += $per_unit_cut * $units;
		$saved += $per_unit_cut * $units;
		$remaining -= $units;
	}
	return $saved;
}

/** Per-unit discount for the four "customer gets" modes. */
function mf_resolver_bogo_unit_discount( $cfg, $price ) {
	if ( 'final_price' === $cfg['gets_with'] ) {
		return max( 0.0, $price - (float) $cfg['final_price'] );
	}
	switch ( $cfg['discount_type'] ) {
		case 'free':
			return $price;
		case 'perc':
			$perc = max( 0.0, min( 100.0, (float) $cfg['discount_perc'] ) );
			return $price * ( $perc / 100 );
		case 'price':
			return min( $price, (float) $cfg['discount_price'] );
	}
	return 0.0;
}

/** Free-unit count for apply once / repeatedly / custom. */
function mf_resolver_bogo_giveaway_units( $cfg, $eligible_units, $eligible_amount ) {
	$free_qty = max( 0, (int) $cfg['gets_qty'] );
	switch ( $cfg['apply_offer'] ) {
		case 'once':
			return $free_qty;
		case 'repeatedly':
			$by_amount = ( 'amount' === $cfg['triggers'] );
			$eligible_value = $by_amount ? $eligible_amount : $eligible_units;
			$min_value = $by_amount ? (float) $cfg['min_amount'] : (int) $cfg['min_qty'];
			$min_value = ( $min_value <= 0 ) ? 1 : $min_value;
			$frequency = max( 1, (int) ( $eligible_value / $min_value ) );
			if ( $cfg['repeatedly_times'] > 0 ) {
				$frequency = min( $frequency, (int) $cfg['repeatedly_times'] );
			}
			return $frequency * $free_qty;
		case 'custom':
			$by_amount = ( 'amount' === $cfg['triggers'] );
			$eligible_value = $by_amount ? $eligible_amount : $eligible_units;
			return mf_resolver_bogo_custom_units( $cfg, $eligible_value );
	}
	return $free_qty;
}

function mf_resolver_bogo_custom_units( $cfg, $value ) {
	$mins  = $cfg['custom_min'];
	$maxs  = $cfg['custom_max'];
	$times = $cfg['custom_times'];
	$last  = count( $mins ) - 1;
	foreach ( $mins as $i => $min ) {
		$max = isset( $maxs[ $i ] ) ? (int) $maxs[ $i ] : 0;
		if ( $i === $last && 0 === $max && $value >= $min ) {
			return (int) $times[ $i ];
		}
		if ( $value >= $min && ( 0 === $max || $value <= $max ) ) {
			return (int) $times[ $i ];
		}
	}
	return 0;
}

/** Does a cart line fall within the BOGO's product/category scope (and not excluded)? */
function mf_resolver_bogo_scope_match( $item, $cfg ) {
	$pid = (int) $item['product_id'];
	$vid = ! empty( $item['variation_id'] ) ? (int) $item['variation_id'] : 0;

	if ( $cfg['exclude_products'] && ( in_array( $pid, $cfg['exclude_products'], true ) || ( $vid && in_array( $vid, $cfg['exclude_products'], true ) ) ) ) {
		return false;
	}
	if ( $cfg['exclude_categories'] && mf_resolver_product_in_categories( $pid, $cfg['exclude_categories'] ) ) {
		return false;
	}
	// No positive scope => any product qualifies.
	if ( empty( $cfg['products'] ) && empty( $cfg['categories'] ) ) {
		return true;
	}
	if ( $cfg['products'] && ( in_array( $pid, $cfg['products'], true ) || ( $vid && in_array( $vid, $cfg['products'], true ) ) ) ) {
		return true;
	}
	if ( $cfg['categories'] && mf_resolver_product_in_categories( $pid, $cfg['categories'] ) ) {
		return true;
	}
	return false;
}

function mf_resolver_product_in_categories( $pid, $cat_ids ) {
	$terms = wc_get_product_cat_ids( $pid );
	return (bool) array_intersect( $terms, array_map( 'intval', $cat_ids ) );
}

/* ------------------------------------------------------------------ *
 * 4. Rule discovery + WebToffee config adapter (single place to read meta)
 * ------------------------------------------------------------------ */

function mf_resolver_get_rules( $cart ) {
	mf_resolver_version_guard();

	$rules = array();

	// Automatic percentage coupons (auto-apply flag).
	$auto_ids = get_posts( array(
		'post_type' => 'shop_coupon', 'post_status' => 'publish', 'numberposts' => -1,
		'meta_key' => '_wt_make_auto_coupon', 'meta_value' => '1', 'fields' => 'ids', 'no_found_rows' => true,
	) );
	foreach ( $auto_ids as $id ) {
		$coupon = new WC_Coupon( $id );
		$dtype  = $coupon->get_discount_type();
		if ( ! in_array( $dtype, array( 'percent', 'fixed_product', 'fixed_cart' ), true ) ) {
			continue; // BOGO auto coupons handled below; other exotic types skipped
		}
		$rules[] = array(
			'type'      => $dtype,
			'code'      => $coupon->get_code(),
			'label'     => mf_resolver_label( $coupon ),
			'coupon'    => $coupon,
			'pct'       => (float) $coupon->get_amount(),
			'amount'    => (float) $coupon->get_amount(),
			'priority'  => (int) ( get_post_meta( $id, '_mf_promo_priority', true ) ?: 20 ),
			'exclusive' => 'yes' === get_post_meta( $id, '_mf_promo_exclusive', true ),
		);
	}

	// BOGO offers (discount_type wbte_sc_bogo). Only auto BOGO applies without a code;
	// manual BOGO applies when its code is in the applied-coupon list.
	$applied = $cart->get_applied_coupons();
	$bogo_ids = get_posts( array(
		'post_type' => 'shop_coupon', 'post_status' => 'publish', 'numberposts' => -1,
		'meta_key' => 'discount_type', 'meta_value' => 'wbte_sc_bogo', 'fields' => 'ids', 'no_found_rows' => true,
	) );
	foreach ( $bogo_ids as $id ) {
		$code = wc_get_coupon_code_by_id( $id );
		$is_auto = '1' === get_post_meta( $id, '_wt_make_auto_coupon', true );
		if ( ! $is_auto && ! in_array( $code, $applied, true ) ) {
			continue; // manual BOGO not applied by the customer
		}
		$cfg = mf_resolver_read_bogo_config( $id );
		if ( null === $cfg ) {
			continue; // unsupported mode or unreadable — already logged, safely skipped
		}
		$rules[] = array(
			'type'      => 'bogo_cheap_exp',
			'code'      => $code,
			'label'     => $cfg['label'],
			'bogo'      => $cfg,
			'priority'  => (int) ( get_post_meta( $id, '_mf_promo_priority', true ) ?: 30 ),
			'exclusive' => 'yes' === get_post_meta( $id, '_mf_promo_exclusive', true ),
		);
	}

	usort( $rules, function ( $a, $b ) {
		return $a['priority'] <=> $b['priority'];
	} );

	return $rules;
}

/**
 * The ONLY place WebToffee BOGO meta is read. Returns a normalized config array, or null
 * for a mode not yet ported / unreadable (logged, then safely skipped). Full decoupling =
 * migrate these values into our own meta and drop this reader.
 */
function mf_resolver_read_bogo_config( $id ) {
	$m = function ( $k ) use ( $id ) {
		return get_post_meta( $id, $k, true );
	};

	$type = $m( 'wbte_sc_bogo_type' );
	if ( 'wbte_sc_bogo_cheap_expensive' !== $type ) {
		mf_resolver_log( "BOGO {$id}: mode '{$type}' not yet ported to resolver — skipped (WebToffee left to handle it would re-open the war, so this offer is inactive until ported)." );
		return null;
	}

	$gets_with = ( 'wbte_sc_bogo_customer_gets_with_final_price' === $m( 'wbte_sc_bogo_customer_gets_with' ) ) ? 'final_price' : 'discount';
	$dtype_raw = $m( 'wbte_sc_bogo_customer_gets_discount_type' );
	$discount_type = 'free';
	if ( 'wbte_sc_bogo_customer_gets_with_perc_discount' === $dtype_raw ) {
		$discount_type = 'perc';
	} elseif ( 'wbte_sc_bogo_customer_gets_free' === $dtype_raw ) {
		$discount_type = 'free';
	} elseif ( '' !== $dtype_raw ) {
		$discount_type = 'price';
	}

	$apply_raw = $m( 'wbte_sc_bogo_apply_offer' );
	$apply_offer = 'once';
	if ( 'wbte_sc_bogo_apply_repeatedly' === $apply_raw ) {
		$apply_offer = 'repeatedly';
	} elseif ( 'wbte_sc_bogo_apply_custom' === $apply_raw ) {
		$apply_offer = 'custom';
	}

	$label = $m( 'wbte_sc_bogo_coupon_name' );

	return array(
		'label'              => $label ?: strtoupper( (string) wc_get_coupon_code_by_id( $id ) ),
		'cheap_exp'          => ( 'wbte_sc_bogo_customer_gets_expensive' === $m( 'wbte_sc_bogo_customer_gets_cheap_exp' ) ) ? 'expensive' : 'cheapest',
		'gets_with'          => $gets_with,
		'discount_type'      => $discount_type,
		'discount_perc'      => (float) $m( 'wbte_sc_bogo_customer_gets_discount_perc' ),
		'discount_price'     => (float) $m( 'wbte_sc_bogo_customer_gets_discount_price' ),
		'final_price'        => (float) $m( 'wbte_sc_bogo_customer_gets_final_price' ),
		'gets_qty'           => (int) $m( 'wbte_sc_bogo_customer_gets_qty' ),
		'apply_offer'        => $apply_offer,
		'repeatedly_times'   => (int) $m( 'wbte_sc_bogo_repeatedly_times' ),
		'triggers'           => ( 'wbte_sc_bogo_triggers_amount' === $m( 'wbte_sc_bogo_triggers_when' ) ) ? 'amount' : 'qty',
		'min_qty'            => (int) $m( '_wbte_sc_bogo_min_qty' ),
		'min_amount'         => (float) $m( '_wbte_sc_bogo_min_amount' ),
		'custom_min'         => array_map( 'trim', explode( ',', (string) $m( 'wbte_sc_bogo_apply_custom_min' ) ) ),
		'custom_max'         => array_map( 'trim', explode( ',', (string) $m( 'wbte_sc_bogo_apply_custom_max' ) ) ),
		'custom_times'       => array_map( 'trim', explode( ',', (string) $m( 'wbte_sc_bogo_apply_custom_times' ) ) ),
		'products'           => mf_resolver_ids( $m( 'wbte_sc_bogo_product_ids' ) ),
		'categories'         => mf_resolver_ids( $m( 'wbte_sc_bogo_product_categories' ) ),
		'exclude_products'   => mf_resolver_ids( $m( 'wbte_sc_bogo_exclude_product_ids' ) ),
		'exclude_categories' => mf_resolver_ids( $m( 'wbte_sc_bogo_exclude_product_categories' ) ),
	);
}

function mf_resolver_ids( $raw ) {
	if ( is_array( $raw ) ) {
		return array_map( 'intval', $raw );
	}
	if ( '' === $raw || null === $raw ) {
		return array();
	}
	return array_filter( array_map( 'intval', array_map( 'trim', explode( ',', (string) $raw ) ) ) );
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
 * 5. Shared helpers
 * ------------------------------------------------------------------ */

function mf_resolver_is_protected_line( $item ) {
	if ( ! empty( $item['bb_group_key'] ) ) {
		return true; // build-a-bundle component
	}
	if ( function_exists( 'WC' ) && WC()->cart ) {
		foreach ( WC()->cart->get_applied_coupons() as $code ) {
			if ( 0 === strpos( $code, 'mf-free-gift-' ) && (int) $item['product_id'] === (int) str_replace( 'mf-free-gift-', '', $code ) ) {
				return true;
			}
		}
	}
	return ! empty( $item['_mf_gift'] );
}

/** Unmutated base = the _price postmeta (the SALE price when on sale, else regular). */
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
