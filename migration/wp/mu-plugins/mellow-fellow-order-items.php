<?php
/**
 * Plugin Name: Mellow Fellow Order Items
 * Description: Guest-safe lookup of an order's line items, keyed by order ID + order key.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'mellow-fellow/v1',
			'/order-items',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'mf_get_order_items',
				'permission_callback' => '__return_true',
			)
		);
	}
);

/**
 * Return the line items for one order, authorized by the order's own
 * key - the same guest-access model WooCommerce itself uses for the
 * "order received" page - rather than by any session/login state,
 * since this must work for guest checkouts too. order_id alone is
 * not a secret (sequential), so the key is what actually authorizes
 * the request; it's compared with hash_equals() to avoid leaking
 * timing information.
 */
function mf_get_order_items( WP_REST_Request $request ) {

	$order_id = absint( $request->get_param( 'order_id' ) );
	$key      = (string) $request->get_param( 'key' );

	if ( ! $order_id || '' === $key ) {
		return new WP_Error(
			'order_items_bad_request',
			'order_id and key are required.',
			array( 'status' => 400 )
		);
	}

	if ( ! function_exists( 'wc_get_order' ) ) {
		return new WP_Error(
			'order_items_unavailable',
			'WooCommerce is not available.',
			array( 'status' => 500 )
		);
	}

	$order = wc_get_order( $order_id );

	if ( ! $order || ! hash_equals( (string) $order->get_order_key(), $key ) ) {
		return new WP_Error(
			'order_items_unauthorized',
			'Invalid order or key.',
			array( 'status' => 403 )
		);
	}

	$items = array();

	foreach ( $order->get_items() as $item ) {

		$product = $item->get_product();
		$image   = '';

		if ( $product ) {
			$image_id = $product->get_image_id();

			if ( $image_id ) {
				$image = wp_get_attachment_image_url( $image_id, 'thumbnail' ) ?: '';
			}
		}

		$quantity = (int) $item->get_quantity();

		$items[] = array(
			'id'        => $item->get_id(),
			'productId' => $item->get_product_id(),
			'name'      => $item->get_name(),
			'quantity'  => $quantity,
			'price'     => $quantity > 0 ? round( (float) $item->get_total() / $quantity, 2 ) : (float) $item->get_total(),
			'total'     => (float) $item->get_total(),
			'image'     => $image,
		);
	}

	$date_created = $order->get_date_created();

	/*
	 * Seconds since the order was created, computed entirely here via
	 * Unix timestamps (getTimestamp() is always UTC-based regardless
	 * of any timezone the DateTime object displays itself in).
	 *
	 * Deliberately NOT exposing an absolute "date created" string for
	 * the caller to diff against its own clock: this site's WC_DateTime
	 * ->date('c') formatting does not reliably reflect true UTC (it
	 * was observed several hours off from a known-correct UTC value
	 * written directly to date_created_gmt) - a duration computed from
	 * two timestamps on the *same* clock sidesteps that entirely,
	 * whatever its root cause.
	 */
	$age_seconds = $date_created
		? ( new DateTime( 'now', new DateTimeZone( 'UTC' ) ) )->getTimestamp() - $date_created->getTimestamp()
		: null;

	return rest_ensure_response(
		array(
			'success'      => true,
			'items'        => $items,
			// Exposed so /api/checkout (Next.js) and order-confirmation
			// can validate/display a time-boxed shipping waiver on a
			// follow-up "forgot something?" order - safe to return
			// since this whole endpoint is already gated on the
			// order's own key.
			'ageSeconds'   => $age_seconds,
			'billingEmail' => $order->get_billing_email(),
		)
	);
}
