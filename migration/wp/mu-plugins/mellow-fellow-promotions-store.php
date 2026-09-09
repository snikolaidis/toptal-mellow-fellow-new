<?php
/**
 * Plugin Name: Mellow Fellow - Promotions Store (mf_promotion CPT + reader + importer)
 * Description: Our OWN authoring store for promotions, decoupled from WebToffee. Registers the
 *   `mf_promotion` custom post type, reads active promotions into engine rules, and provides an
 *   idempotent migration importer (with dry-run) that copies WebToffee auto-apply coupons, BOGO
 *   offers, and the free-gift config into `mf_promotion` records. Never writes to shop_coupon —
 *   so no duplicate coupon codes. Expired/trashed are skipped; status is preserved.
 * Version: 0.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once __DIR__ . '/mf-promotions/src/Line.php';
require_once __DIR__ . '/mf-promotions/src/Rule.php';
require_once __DIR__ . '/mf-promotions/src/Result.php';
require_once __DIR__ . '/mf-promotions/src/PromotionEngine.php';
require_once __DIR__ . '/mf-promotions/src/PromotionMapper.php';

use MellowFellow\Promotions\PromotionMapper;

/* ------------------------------------------------------------------ *
 * Custom post type: mf_promotion  (publish = active, draft = inactive)
 * ------------------------------------------------------------------ */

add_action( 'init', 'mf_promotions_register_cpt' );
function mf_promotions_register_cpt() {
	register_post_type( 'mf_promotion', array(
		'labels'       => array(
			'name'          => 'Promotions',
			'singular_name' => 'Promotion',
			'menu_name'     => 'Promotions',
			'add_new_item'  => 'Add Promotion',
			'edit_item'     => 'Edit Promotion',
		),
		'public'       => false,
		'show_ui'      => true,
		'menu_icon'    => 'dashicons-tag',
		'menu_position' => 58,
		'supports'     => array( 'title' ),
		'capability_type' => 'shop_coupon', // reuse WooCommerce coupon caps (shop managers)
		'map_meta_cap' => true,
	) );
}

/**
 * The canonical mf_promotion array <-> WP post/meta.
 * status: publish => active, anything else => inactive.
 */
function mf_promotion_to_array( $post_id ) {
	$get = function ( $k, $default = '' ) use ( $post_id ) {
		$v = get_post_meta( $post_id, $k, true );
		return '' === $v ? $default : $v;
	};
	return array(
		'source_id'          => (int) $get( '_mf_source_id', 0 ),
		'code'               => (string) $get( '_mf_code', '' ),
		'label'              => get_the_title( $post_id ),
		'type'               => (string) $get( '_mf_type', '' ),
		'trigger'            => (string) $get( '_mf_trigger', 'automatic' ),
		'status'             => 'publish' === get_post_status( $post_id ) ? 'active' : 'inactive',
		'priority'           => (int) $get( '_mf_priority', 10 ),
		'exclusivity'        => (string) $get( '_mf_exclusivity', 'universal' ),
		'amount'             => (float) $get( '_mf_amount', 0 ),
		'min_subtotal'       => '' === get_post_meta( $post_id, '_mf_min_subtotal', true ) ? null : (float) $get( '_mf_min_subtotal' ),
		'scope_products'     => (array) $get( '_mf_scope_products', array() ),
		'scope_categories'   => (array) $get( '_mf_scope_categories', array() ),
		'exclude_products'   => (array) $get( '_mf_exclude_products', array() ),
		'exclude_categories' => (array) $get( '_mf_exclude_categories', array() ),
		'bogo'               => ( $b = $get( '_mf_bogo', null ) ) ? (array) $b : null,
		'gift'               => ( $g = $get( '_mf_gift', null ) ) ? (array) $g : null,
	);
}

/**
 * Idempotent upsert of an mf_promotion array. Keyed on _mf_source_id so re-imports update
 * rather than duplicate. Returns ['action'=>'create'|'update'|'noop', 'id'=>int].
 */
function mf_promotion_save_array( array $p, $dry_run = false ) {
	$existing = mf_promotion_find_by_source( (int) ( $p['source_id'] ?? 0 ) );
	$action   = $existing ? 'update' : 'create';
	if ( $dry_run ) {
		return array( 'action' => $action, 'id' => $existing ?: 0 );
	}

	$postarr = array(
		'ID'          => $existing ?: 0,
		'post_type'   => 'mf_promotion',
		'post_title'  => (string) ( $p['label'] ?? $p['code'] ?? 'Promotion' ),
		'post_status' => ( ( $p['status'] ?? 'active' ) === 'active' ) ? 'publish' : 'draft',
	);
	$id = wp_insert_post( $postarr );
	if ( is_wp_error( $id ) || ! $id ) {
		return array( 'action' => 'error', 'id' => 0 );
	}

	mf_promotion_write_meta( $id, $p );
	return array( 'action' => $action, 'id' => $id );
}

/**
 * Write the canonical promotion array to post meta. Shared by the importer and the admin
 * editor's save_post handler (the latter must NOT call wp_insert_post — that would recurse).
 */
function mf_promotion_write_meta( $id, array $p ) {
	update_post_meta( $id, '_mf_source_id', (int) ( $p['source_id'] ?? 0 ) );
	update_post_meta( $id, '_mf_code', (string) ( $p['code'] ?? '' ) );
	update_post_meta( $id, '_mf_type', (string) ( $p['type'] ?? '' ) );
	update_post_meta( $id, '_mf_trigger', ( ( $p['trigger'] ?? 'automatic' ) === 'code' ) ? 'code' : 'automatic' );
	update_post_meta( $id, '_mf_priority', (int) ( $p['priority'] ?? 10 ) );
	update_post_meta( $id, '_mf_exclusivity', (string) ( $p['exclusivity'] ?? 'universal' ) );
	update_post_meta( $id, '_mf_amount', (float) ( $p['amount'] ?? 0 ) );
	if ( null === ( $p['min_subtotal'] ?? null ) ) {
		delete_post_meta( $id, '_mf_min_subtotal' );
	} else {
		update_post_meta( $id, '_mf_min_subtotal', (float) $p['min_subtotal'] );
	}
	update_post_meta( $id, '_mf_scope_products', array_map( 'intval', $p['scope_products'] ?? array() ) );
	update_post_meta( $id, '_mf_scope_categories', array_map( 'intval', $p['scope_categories'] ?? array() ) );
	update_post_meta( $id, '_mf_exclude_products', array_map( 'intval', $p['exclude_products'] ?? array() ) );
	update_post_meta( $id, '_mf_exclude_categories', array_map( 'intval', $p['exclude_categories'] ?? array() ) );
	// Keep the human-facing collection selections for re-editing (resolved to product ids above).
	if ( isset( $p['scope_collections'] ) ) {
		update_post_meta( $id, '_mf_scope_collections', array_values( (array) $p['scope_collections'] ) );
	}
	if ( isset( $p['exclude_collections'] ) ) {
		update_post_meta( $id, '_mf_exclude_collections', array_values( (array) $p['exclude_collections'] ) );
	}
	if ( null === ( $p['bogo'] ?? null ) ) {
		delete_post_meta( $id, '_mf_bogo' );
	} else {
		update_post_meta( $id, '_mf_bogo', $p['bogo'] );
	}
	if ( null === ( $p['gift'] ?? null ) ) {
		delete_post_meta( $id, '_mf_gift' );
	} else {
		update_post_meta( $id, '_mf_gift', $p['gift'] );
	}
}

function mf_promotion_find_by_source( $source_id ) {
	if ( ! $source_id ) {
		return 0;
	}
	$ids = get_posts( array(
		'post_type' => 'mf_promotion', 'post_status' => array( 'publish', 'draft' ),
		'numberposts' => 1, 'fields' => 'ids', 'no_found_rows' => true,
		'meta_key' => '_mf_source_id', 'meta_value' => (int) $source_id,
	) );
	return $ids ? (int) $ids[0] : 0;
}

/* ------------------------------------------------------------------ *
 * Reader: active mf_promotion records -> engine Rule[]
 * ------------------------------------------------------------------ */

/**
 * Active promotions -> engine Rule[]. Code-triggered promotions (e.g. a manual BOGO the
 * customer must enter) are included only when their code is in $applied_codes; automatic
 * ones always. This keeps the engine pure — the trigger gate lives here in the adapter layer.
 *
 * @param string[] $applied_codes coupon codes currently applied to the cart
 * @return \MellowFellow\Promotions\Rule[]
 */
function mf_promotion_get_active_rules( $applied_codes = array() ) {
	$ids = get_posts( array(
		'post_type' => 'mf_promotion', 'post_status' => 'publish',
		'numberposts' => -1, 'fields' => 'ids', 'no_found_rows' => true,
	) );
	$applied_codes = array_map( 'strtolower', (array) $applied_codes );
	$rules = array();
	foreach ( $ids as $id ) {
		$p = mf_promotion_to_array( $id );
		if ( 'code' === ( $p['trigger'] ?? 'automatic' ) && ! in_array( strtolower( (string) $p['code'] ), $applied_codes, true ) ) {
			continue; // manual/code-triggered promotion not entered by the customer
		}
		$rules[] = PromotionMapper::toRule( $p );
	}
	return $rules;
}

/* ------------------------------------------------------------------ *
 * Importer: WebToffee/coupon config -> mf_promotion arrays (via mapper)
 * ------------------------------------------------------------------ */

/**
 * Build the list of mf_promotion arrays from the current WebToffee/coupon config.
 * Skips expired and trashed. Giveaway BOGO modes are reported as skipped (not yet ported).
 * Returns ['promotions'=>[mf_promotion arrays], 'skipped'=>[['code','reason']]].
 */
function mf_promotions_collect_from_webtoffee() {
	$promotions = array();
	$skipped    = array();

	// --- Auto-apply coupons (percent/fixed) ---
	$auto_ids = get_posts( array(
		'post_type' => 'shop_coupon', 'post_status' => array( 'publish', 'draft' ),
		'numberposts' => -1, 'fields' => 'ids', 'no_found_rows' => true,
		'meta_key' => '_wt_make_auto_coupon', 'meta_value' => '1',
	) );
	foreach ( $auto_ids as $id ) {
		$coupon = new WC_Coupon( $id );
		$dtype  = $coupon->get_discount_type();
		if ( ! in_array( $dtype, array( 'percent', 'fixed_product', 'fixed_cart' ), true ) ) {
			$skipped[] = array( 'code' => $coupon->get_code(), 'reason' => "unsupported auto type '{$dtype}'" );
			continue;
		}
		if ( mf_promotions_is_expired( $coupon ) ) {
			$skipped[] = array( 'code' => $coupon->get_code(), 'reason' => 'expired' );
			continue;
		}
		$scope = mf_promotions_coupon_scope( $id, $coupon );
		$promotions[] = PromotionMapper::fromWebToffeeAuto( array_merge( array(
			'source_id'     => $id,
			'code'          => $coupon->get_code(),
			'label'         => mf_promotions_label( $id, $coupon->get_code() ),
			'discount_type' => $dtype,
			'amount'        => (float) $coupon->get_amount(),
			'priority'      => (int) ( get_post_meta( $id, '_mf_promo_priority', true ) ?: 20 ),
			'exclusive'     => 'yes' === get_post_meta( $id, '_mf_promo_exclusive', true ),
			'min_amount'    => (float) $coupon->get_minimum_amount(),
			'status'        => 'publish' === get_post_status( $id ) ? 'active' : 'inactive',
		), $scope ) );
	}

	// --- BOGO offers ---
	$bogo_ids = get_posts( array(
		'post_type' => 'shop_coupon', 'post_status' => array( 'publish', 'draft' ),
		'numberposts' => -1, 'fields' => 'ids', 'no_found_rows' => true,
		'meta_key' => 'discount_type', 'meta_value' => 'wbte_sc_bogo',
	) );
	foreach ( $bogo_ids as $id ) {
		$code = wc_get_coupon_code_by_id( $id );
		if ( mf_promotions_bogo_expired( $id ) ) {
			$skipped[] = array( 'code' => $code, 'reason' => 'expired' );
			continue;
		}
		$meta = mf_promotions_read_bogo_meta( $id, $code );
		$p = PromotionMapper::fromWebToffeeBogo( $meta );
		if ( null === $p ) {
			$skipped[] = array( 'code' => $code, 'reason' => 'giveaway/choose-your-free mode not yet ported' );
			continue;
		}
		$promotions[] = $p;
	}

	// --- Free gift ---
	$offers = function_exists( 'mf_cart_offers_get' ) ? mf_cart_offers_get() : array();
	$threshold = (float) ( $offers['free_gift_threshold'] ?? 0 );
	if ( $threshold > 0 ) {
		$promotions[] = PromotionMapper::fromFreeGift( array(
			'source_id' => -1, // synthetic (config-based, not a coupon)
			'code'      => 'free-gift',
			'label'     => 'Free gift',
			'threshold' => $threshold,
			'status'    => ! empty( $offers['free_gift_enabled'] ) || ! isset( $offers['free_gift_enabled'] ) ? 'active' : 'inactive',
		) );
	}

	return array( 'promotions' => $promotions, 'skipped' => $skipped );
}

/** Run the import. $dry_run => report only, no writes. */
function mf_promotions_import( $dry_run = true ) {
	$collected = mf_promotions_collect_from_webtoffee();
	$report = array( 'create' => array(), 'update' => array(), 'skipped' => $collected['skipped'], 'dry_run' => (bool) $dry_run );
	foreach ( $collected['promotions'] as $p ) {
		$res = mf_promotion_save_array( $p, $dry_run );
		$row = array( 'label' => $p['label'], 'type' => $p['type'], 'status' => $p['status'], 'source_id' => $p['source_id'] );
		if ( 'update' === $res['action'] ) {
			$report['update'][] = $row;
		} elseif ( 'create' === $res['action'] ) {
			$report['create'][] = $row;
		}
	}
	return $report;
}

/* -------- importer helpers (WebToffee meta -> plain arrays) -------- */

function mf_promotions_coupon_scope( $id, $coupon ) {
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
		'scope_products'     => array_values( array_unique( $scope_products ) ),
		'scope_categories'   => $scope_categories,
		'exclude_products'   => array_values( array_unique( $excl_products ) ),
		'exclude_categories' => $excl_categories,
	);
}

function mf_promotions_read_bogo_meta( $id, $code ) {
	$keys = array(
		'wbte_sc_bogo_type', 'wbte_sc_bogo_customer_gets', 'wbte_sc_bogo_customer_gets_cheap_exp',
		'wbte_sc_bogo_customer_gets_with', 'wbte_sc_bogo_customer_gets_discount_type',
		'wbte_sc_bogo_customer_gets_discount_perc', 'wbte_sc_bogo_customer_gets_discount_price',
		'wbte_sc_bogo_customer_gets_final_price', 'wbte_sc_bogo_customer_gets_qty',
		'wbte_sc_bogo_apply_offer', 'wbte_sc_bogo_repeatedly_times', 'wbte_sc_bogo_triggers_when',
		'_wbte_sc_bogo_min_qty', '_wbte_sc_bogo_min_amount', 'wbte_sc_bogo_apply_custom_min',
		'wbte_sc_bogo_apply_custom_max', 'wbte_sc_bogo_apply_custom_times', 'wbte_sc_bogo_coupon_name',
		'wbte_sc_bogo_product_ids', 'wbte_sc_bogo_product_categories',
		'wbte_sc_bogo_exclude_product_ids', 'wbte_sc_bogo_exclude_product_categories',
		'wbte_sc_bogo_free_product_ids',
	);
	$meta = array();
	foreach ( $keys as $k ) {
		$meta[ $k ] = get_post_meta( $id, $k, true );
	}
	// Fold our custom BOGO collection restrictions into scope/exclude product ids.
	$scope_products  = mf_promotions_ids( $meta['wbte_sc_bogo_product_ids'] );
	$exclude_products = mf_promotions_ids( $meta['wbte_sc_bogo_exclude_product_ids'] );
	if ( function_exists( 'mf_get_products_in_collections' ) ) {
		$inc = get_post_meta( $id, '_mf_bogo_collections', true );
		if ( $inc ) {
			$scope_products = array_merge( $scope_products, mf_get_products_in_collections( array_filter( array_map( 'trim', explode( ',', $inc ) ) ) ) );
		}
		$exc = get_post_meta( $id, '_mf_bogo_exclude_collections', true );
		if ( $exc ) {
			$exclude_products = array_merge( $exclude_products, mf_get_products_in_collections( array_filter( array_map( 'trim', explode( ',', $exc ) ) ) ) );
		}
	}
	$meta['source_id']          = $id;
	$meta['code']               = $code;
	$meta['priority']           = (int) ( get_post_meta( $id, '_mf_promo_priority', true ) ?: 30 );
	$meta['exclusive']          = 'yes' === get_post_meta( $id, '_mf_promo_exclusive', true );
	$meta['status']             = 'publish' === get_post_status( $id ) ? 'active' : 'inactive';
	// Trigger: an auto BOGO applies automatically; a manual-code BOGO only when entered.
	$is_auto = '1' === get_post_meta( $id, '_wt_make_auto_coupon', true );
	$is_manual = 'wbte_sc_bogo_code_manual' === get_post_meta( $id, 'wbte_sc_bogo_code_condition', true );
	$meta['trigger']            = ( $is_manual && ! $is_auto ) ? 'code' : 'automatic';
	$meta['scope_products']     = array_values( array_unique( $scope_products ) );
	$meta['scope_categories']   = mf_promotions_ids( $meta['wbte_sc_bogo_product_categories'] );
	$meta['exclude_products']   = array_values( array_unique( $exclude_products ) );
	$meta['exclude_categories'] = mf_promotions_ids( $meta['wbte_sc_bogo_exclude_product_categories'] );
	return $meta;
}

function mf_promotions_label( $id, $code ) {
	$name = get_post_meta( $id, 'wbte_sc_bogo_coupon_name', true );
	return $name ? $name : strtoupper( (string) $code );
}

function mf_promotions_is_expired( $coupon ) {
	$exp = $coupon->get_date_expires();
	return $exp && $exp->getTimestamp() < time();
}

function mf_promotions_bogo_expired( $id ) {
	$exp = get_post_meta( $id, '_wbte_sc_bogo_expiry_date', true );
	if ( ! $exp ) {
		return false;
	}
	$ts = strtotime( $exp );
	return $ts && $ts < time();
}

function mf_promotions_ids( $raw ) {
	if ( is_array( $raw ) ) {
		return array_map( 'intval', $raw );
	}
	if ( '' === $raw || null === $raw ) {
		return array();
	}
	return array_values( array_filter( array_map( 'intval', array_map( 'trim', explode( ',', (string) $raw ) ) ) ) );
}

/* ------------------------------------------------------------------ *
 * WP-CLI:  wp mf-promotions import [--dry-run]
 * ------------------------------------------------------------------ */

if ( defined( 'WP_CLI' ) && WP_CLI ) {
	WP_CLI::add_command( 'mf-promotions', new class {
		/**
		 * Import WebToffee/coupon promotions into mf_promotion records.
		 *
		 * ## OPTIONS
		 * [--dry-run]  : Report what would change without writing.
		 */
		public function import( $args, $assoc ) {
			$dry = isset( $assoc['dry-run'] );
			$r = mf_promotions_import( $dry );
			WP_CLI::log( ( $dry ? '[DRY RUN] ' : '' ) . 'Promotion import' );
			WP_CLI::log( 'Create: ' . count( $r['create'] ) . '  Update: ' . count( $r['update'] ) . '  Skipped: ' . count( $r['skipped'] ) );
			foreach ( array( 'create', 'update' ) as $k ) {
				foreach ( $r[ $k ] as $row ) {
					WP_CLI::log( sprintf( '  %-6s %-10s %-8s %s', $k, $row['type'], $row['status'], $row['label'] ) );
				}
			}
			foreach ( $r['skipped'] as $row ) {
				WP_CLI::log( sprintf( '  skip   %s (%s)', $row['code'], $row['reason'] ) );
			}
			if ( ! $dry ) {
				WP_CLI::success( 'Import complete.' );
			}
		}
	} );
}
