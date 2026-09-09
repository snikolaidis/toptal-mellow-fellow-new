<?php
/**
 * Plugin Name: Mellow Fellow - Promotions Admin (unified editor)
 * Description: One screen to author every promotion type (auto %/fixed, BOGO, free gift) on
 *   the mf_promotion post type. Fields map 1:1 to the canonical promotion array; saving writes
 *   the same meta the engine reads, so what marketing configures is exactly what applies.
 * Version: 0.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/* ---------------------------- list columns ---------------------------- */

add_filter( 'manage_mf_promotion_posts_columns', function ( $cols ) {
	$new = array( 'cb' => $cols['cb'] ?? '', 'title' => 'Name' );
	$new['mf_type']    = 'Type';
	$new['mf_trigger'] = 'Trigger';
	$new['mf_prio']    = 'Priority';
	$new['mf_excl']    = 'Stacking';
	$new['mf_status']  = 'Status';
	return $new;
} );

add_action( 'manage_mf_promotion_posts_custom_column', function ( $col, $post_id ) {
	switch ( $col ) {
		case 'mf_type':    echo esc_html( get_post_meta( $post_id, '_mf_type', true ) ); break;
		case 'mf_trigger': echo esc_html( get_post_meta( $post_id, '_mf_trigger', true ) ?: 'automatic' ); break;
		case 'mf_prio':    echo (int) get_post_meta( $post_id, '_mf_priority', true ); break;
		case 'mf_excl':    echo esc_html( get_post_meta( $post_id, '_mf_exclusivity', true ) ?: 'universal' ); break;
		case 'mf_status':  echo 'publish' === get_post_status( $post_id ) ? '<strong style="color:#008a20">Active</strong>' : 'Inactive'; break;
	}
}, 10, 2 );

/* ---------------------------- editor metabox --------------------------- */

add_action( 'add_meta_boxes', function () {
	add_meta_box( 'mf_promo_editor', 'Promotion', 'mf_promotions_render_editor', 'mf_promotion', 'normal', 'high' );
} );

function mf_promotions_render_editor( $post ) {
	wp_nonce_field( 'mf_promo_save', 'mf_promo_nonce' );
	$g = function ( $k, $d = '' ) use ( $post ) {
		$v = get_post_meta( $post->ID, $k, true );
		return '' === $v ? $d : $v;
	};
	$bogo = (array) ( $g( '_mf_bogo', array() ) ?: array() );
	$gift = (array) ( $g( '_mf_gift', array() ) ?: array() );
	$type = $g( '_mf_type', 'auto_percent' );

	$types = array(
		'auto_percent'       => 'Automatic % off',
		'auto_fixed_product' => 'Automatic $ off each item',
		'auto_fixed_cart'    => 'Automatic $ off cart',
		'bogo'               => 'BOGO (buy X get…)',
		'free_gift'          => 'Free gift',
	);

	$cats = get_terms( array( 'taxonomy' => 'product_cat', 'hide_empty' => false, 'number' => 500 ) );
	$colls = get_terms( array( 'taxonomy' => 'collection', 'hide_empty' => false, 'number' => 500 ) );
	$sel_cats  = array_map( 'intval', (array) $g( '_mf_scope_categories', array() ) );
	$exc_cats  = array_map( 'intval', (array) $g( '_mf_exclude_categories', array() ) );
	$sel_colls = (array) $g( '_mf_scope_collections', array() );
	$exc_colls = (array) $g( '_mf_exclude_collections', array() );

	$row = function ( $label, $html ) {
		echo '<p style="margin:10px 0;"><label style="display:inline-block;width:200px;font-weight:600;vertical-align:top;">' . esc_html( $label ) . '</label>' . $html . '</p>';
	};
	$multi = function ( $name, $terms, $selected, $by_slug = false ) {
		$out = '<select name="' . esc_attr( $name ) . '[]" multiple size="5" style="min-width:320px;">';
		foreach ( $terms as $t ) {
			$val = $by_slug ? $t->slug : $t->term_id;
			$is  = in_array( $by_slug ? $t->slug : (int) $t->term_id, $selected, ! $by_slug ) ? ' selected' : '';
			$out .= '<option value="' . esc_attr( $val ) . '"' . $is . '>' . esc_html( $t->name ) . '</option>';
		}
		return $out . '</select>';
	};
	?>
	<style>.mf-sec{border-top:1px solid #e2e4e7;margin-top:14px;padding-top:6px}.mf-sec h4{margin:6px 0}</style>

	<?php $row( 'Type', mf_promo_select( 'mf_type', $types, $type ) ); ?>
	<?php $row( 'Trigger', mf_promo_select( 'mf_trigger', array( 'automatic' => 'Automatic (applies when eligible)', 'code' => 'Customer enters a code' ), $g( '_mf_trigger', 'automatic' ) )
		. ' <span class="mf-code">code: <input type="text" name="mf_code" value="' . esc_attr( $g( '_mf_code' ) ) . '" /></span>' ); ?>
	<?php $row( 'Priority (lower first)', '<input type="number" name="mf_priority" value="' . esc_attr( $g( '_mf_priority', 10 ) ) . '" style="width:90px" />' ); ?>
	<?php $row( 'Stacking', mf_promo_select( 'mf_exclusivity', array( 'universal' => 'Stacks with others', 'exclusive' => 'Exclusive (nothing else on its items)' ), $g( '_mf_exclusivity', 'universal' ) ) ); ?>

	<div class="mf-when" data-when="auto_percent,auto_fixed_product,auto_fixed_cart">
		<?php $row( 'Amount (% or $)', '<input type="number" step="0.01" name="mf_amount" value="' . esc_attr( $g( '_mf_amount', 0 ) ) . '" style="width:120px" />' ); ?>
		<?php $row( 'Minimum cart subtotal', '<input type="number" step="0.01" name="mf_min_subtotal" value="' . esc_attr( $g( '_mf_min_subtotal' ) ) . '" style="width:120px" placeholder="none" />' ); ?>
	</div>

	<div class="mf-sec"><h4>Scope (leave empty = whole store)</h4>
		<?php $row( 'Products (IDs, comma)', '<input type="text" name="mf_scope_products" value="' . esc_attr( implode( ',', array_map( 'intval', (array) $g( '_mf_scope_products', array() ) ) ) ) . '" style="width:320px" />' ); ?>
		<?php $row( 'Categories', $multi( 'mf_scope_categories', $cats, $sel_cats ) ); ?>
		<?php $row( 'Collections', $multi( 'mf_scope_collections', $colls, $sel_colls, true ) ); ?>
	</div>
	<div class="mf-sec"><h4>Exclusions</h4>
		<?php $row( 'Products (IDs, comma)', '<input type="text" name="mf_exclude_products" value="' . esc_attr( implode( ',', array_map( 'intval', (array) $g( '_mf_exclude_products', array() ) ) ) ) . '" style="width:320px" />' ); ?>
		<?php $row( 'Categories', $multi( 'mf_exclude_categories', $cats, $exc_cats ) ); ?>
		<?php $row( 'Collections', $multi( 'mf_exclude_collections', $colls, $exc_colls, true ) ); ?>
	</div>

	<div class="mf-when mf-sec" data-when="bogo"><h4>BOGO</h4>
		<?php $row( 'Free item selection', mf_promo_select( 'mf_bogo_select', array( 'cheapest' => 'Cheapest qualifying', 'expensive' => 'Most expensive qualifying', 'same' => 'Same product bought' ), $bogo['select'] ?? 'cheapest' ) ); ?>
		<?php $row( 'Discount', mf_promo_select( 'mf_bogo_discount_type', array( 'free' => 'Free (100%)', 'perc' => '% off', 'price' => '$ off', 'final' => 'Final price' ), $bogo['discount_type'] ?? 'free' ) ); ?>
		<?php $row( '% / $ / final value', '<input type="number" step="0.01" name="mf_bogo_perc" placeholder="%" value="' . esc_attr( $bogo['perc'] ?? '' ) . '" style="width:80px" /> '
			. '<input type="number" step="0.01" name="mf_bogo_price" placeholder="$ off" value="' . esc_attr( $bogo['price'] ?? '' ) . '" style="width:80px" /> '
			. '<input type="number" step="0.01" name="mf_bogo_final" placeholder="final $" value="' . esc_attr( $bogo['final'] ?? '' ) . '" style="width:80px" />' ); ?>
		<?php $row( 'Free qty per offer', '<input type="number" name="mf_bogo_gets_qty" value="' . esc_attr( $bogo['gets_qty'] ?? 1 ) . '" style="width:80px" />' ); ?>
		<?php $row( 'Apply', mf_promo_select( 'mf_bogo_apply', array( 'once' => 'Once', 'repeatedly' => 'Repeatedly' ), $bogo['apply'] ?? 'once' ) ); ?>
		<?php $row( 'Trigger by', mf_promo_select( 'mf_bogo_triggers', array( 'qty' => 'Quantity', 'amount' => 'Amount' ), $bogo['triggers'] ?? 'qty' ) ); ?>
		<?php $row( 'Buy qty / amount (min)', '<input type="number" name="mf_bogo_min_qty" placeholder="min qty" value="' . esc_attr( $bogo['min_qty'] ?? '' ) . '" style="width:90px" /> '
			. '<input type="number" step="0.01" name="mf_bogo_min_amount" placeholder="min $" value="' . esc_attr( $bogo['min_amount'] ?? '' ) . '" style="width:90px" />' ); ?>
		<?php $row( 'Repeat cap (0 = unlimited)', '<input type="number" name="mf_bogo_repeat_times" value="' . esc_attr( $bogo['repeat_times'] ?? 0 ) . '" style="width:80px" />' ); ?>
	</div>

	<div class="mf-when mf-sec" data-when="free_gift"><h4>Free gift</h4>
		<?php $row( 'Threshold (pre-discount $)', '<input type="number" step="0.01" name="mf_gift_threshold" value="' . esc_attr( $gift['threshold'] ?? 100 ) . '" style="width:120px" />' ); ?>
		<p style="color:#757575">The gift item itself is chosen by the shopper in the cart drawer; this sets when it unlocks.</p>
	</div>

	<p style="color:#757575" class="mf-sec">Publish = active. Save as Draft = inactive. Set the engine source to <code>mf_promotion</code> to run these live.</p>

	<script>
	(function(){
		function sync(){
			var t = document.querySelector('[name=mf_type]').value;
			document.querySelectorAll('.mf-when').forEach(function(el){
				el.style.display = el.getAttribute('data-when').split(',').indexOf(t) > -1 ? '' : 'none';
			});
			var trig = document.querySelector('[name=mf_trigger]').value;
			var c = document.querySelector('.mf-code'); if(c) c.style.display = (trig==='code') ? '' : 'none';
		}
		document.querySelector('[name=mf_type]').addEventListener('change', sync);
		document.querySelector('[name=mf_trigger]').addEventListener('change', sync);
		sync();
	})();
	</script>
	<?php
}

function mf_promo_select( $name, $options, $current ) {
	$out = '<select name="' . esc_attr( $name ) . '">';
	foreach ( $options as $v => $label ) {
		$out .= '<option value="' . esc_attr( $v ) . '"' . selected( $current, $v, false ) . '>' . esc_html( $label ) . '</option>';
	}
	return $out . '</select>';
}

/* ------------------------------- save ------------------------------- */

add_action( 'save_post_mf_promotion', function ( $post_id, $post ) {
	if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
		return;
	}
	if ( ! isset( $_POST['mf_promo_nonce'] ) || ! wp_verify_nonce( sanitize_key( $_POST['mf_promo_nonce'] ), 'mf_promo_save' ) ) {
		return;
	}
	if ( ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}
	$p = mf_promotions_admin_array_from_post( $_POST );
	if ( function_exists( 'mf_promotion_write_meta' ) ) {
		mf_promotion_write_meta( $post_id, $p );
	}
}, 10, 2 );

/**
 * Build the canonical promotion array from posted admin fields. Pure enough to unit-test:
 * resolves collection slugs to product ids (merged into scope), matching the importer.
 */
function mf_promotions_admin_array_from_post( array $in ) {
	$ids = function ( $v ) {
		if ( is_array( $v ) ) {
			return array_values( array_filter( array_map( 'intval', $v ) ) );
		}
		return array_values( array_filter( array_map( 'intval', array_map( 'trim', explode( ',', (string) $v ) ) ) ) );
	};
	$scope_products  = $ids( $in['mf_scope_products'] ?? '' );
	$exclude_products = $ids( $in['mf_exclude_products'] ?? '' );
	$scope_colls   = array_map( 'sanitize_title', (array) ( $in['mf_scope_collections'] ?? array() ) );
	$exclude_colls = array_map( 'sanitize_title', (array) ( $in['mf_exclude_collections'] ?? array() ) );
	if ( function_exists( 'mf_get_products_in_collections' ) ) {
		if ( $scope_colls ) {
			$scope_products = array_merge( $scope_products, mf_get_products_in_collections( $scope_colls ) );
		}
		if ( $exclude_colls ) {
			$exclude_products = array_merge( $exclude_products, mf_get_products_in_collections( $exclude_colls ) );
		}
	}

	$type = sanitize_text_field( $in['mf_type'] ?? 'auto_percent' );
	$bogo = null;
	if ( 'bogo' === $type ) {
		$bogo = array(
			'select'        => sanitize_text_field( $in['mf_bogo_select'] ?? 'cheapest' ),
			'discount_type' => sanitize_text_field( $in['mf_bogo_discount_type'] ?? 'free' ),
			'perc'          => (float) ( $in['mf_bogo_perc'] ?? 0 ),
			'price'         => (float) ( $in['mf_bogo_price'] ?? 0 ),
			'final'         => (float) ( $in['mf_bogo_final'] ?? 0 ),
			'gets_qty'      => (int) ( $in['mf_bogo_gets_qty'] ?? 1 ),
			'apply'         => sanitize_text_field( $in['mf_bogo_apply'] ?? 'once' ),
			'repeat_times'  => (int) ( $in['mf_bogo_repeat_times'] ?? 0 ),
			'triggers'      => sanitize_text_field( $in['mf_bogo_triggers'] ?? 'qty' ),
			'min_qty'       => (int) ( $in['mf_bogo_min_qty'] ?? 0 ),
			'min_amount'    => (float) ( $in['mf_bogo_min_amount'] ?? 0 ),
			'custom'        => array(),
		);
	}
	$gift = ( 'free_gift' === $type ) ? array( 'threshold' => (float) ( $in['mf_gift_threshold'] ?? 0 ) ) : null;
	$min  = ( '' === ( $in['mf_min_subtotal'] ?? '' ) ) ? null : (float) $in['mf_min_subtotal'];

	return array(
		'source_id'          => 0, // authored in our admin, not imported
		'code'               => sanitize_text_field( $in['mf_code'] ?? '' ),
		'type'               => $type,
		'trigger'            => ( ( $in['mf_trigger'] ?? 'automatic' ) === 'code' ) ? 'code' : 'automatic',
		'priority'           => (int) ( $in['mf_priority'] ?? 10 ),
		'exclusivity'        => ( ( $in['mf_exclusivity'] ?? 'universal' ) === 'exclusive' ) ? 'exclusive' : 'universal',
		'amount'             => (float) ( $in['mf_amount'] ?? 0 ),
		'min_subtotal'       => $min,
		'scope_products'     => array_values( array_unique( $scope_products ) ),
		'scope_categories'   => $ids( $in['mf_scope_categories'] ?? array() ),
		'exclude_products'   => array_values( array_unique( $exclude_products ) ),
		'exclude_categories' => $ids( $in['mf_exclude_categories'] ?? array() ),
		'scope_collections'  => $scope_colls,
		'exclude_collections' => $exclude_colls,
		'bogo'               => $bogo,
		'gift'               => $gift,
	);
}
