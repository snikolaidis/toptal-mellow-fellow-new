<?php
/**
 * Plugin Name: Mellow Fellow - Real ID Order Guard
 * Description: Server-side enforcement of Real ID (getverdict.com) identity
 *              verification before a WooCommerce order is created.
 *
 * Why this exists: the headless checkout (Next.js) only enforces Real ID
 * verification in the browser - src/components/RealIdVerification.tsx tracks
 * verification state client-side, and src/pages/checkout.tsx simply disables
 * the Pay button until it's satisfied. That is not a real security boundary:
 * the order-creation endpoint this hooks into (mf/v1/create-order, see
 * mellow-fellow-create-order.php) can be called directly - bypassing the
 * checkout UI entirely - with no server-side check that identity verification
 * ever happened. This plugin closes that gap by independently re-confirming,
 * server-side, that the check id submitted with the order is real, belongs to
 * the same email as the order's billing address, and has actually reached a
 * verified state - before the order is allowed to be created.
 *
 * This does NOT re-verify or affect Authorize.net charging in any way (that is
 * already fully enforced server-side in src/pages/api/checkout.ts, confirmed
 * separately) - this plugin is specifically about identity verification.
 *
 * Emergency off-switch (no deploy needed): if this ever needs to be disabled
 * (e.g. getverdict.com outage blocking legitimate orders), run:
 *   wp option update mf_realid_order_guard_enabled 0
 * Enforcement is ON by default (the option defaults to enabled if unset).
 *
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_filter( 'mf_realid_order_allowed', 'mf_realid_guard_order', 10, 3 );

/**
 * @param true|WP_Error $allowed    Whatever an earlier filter callback returned.
 * @param string         $check_id  The Real ID check id submitted with the order.
 * @param array          $billing   The order's billing address (for the email).
 * @return true|WP_Error            true to allow order creation to proceed,
 *                                  WP_Error to reject it (mf_create_order turns
 *                                  this into a 403 response).
 */
function mf_realid_guard_order( $allowed, $check_id, $billing ) {
	// An earlier callback on this filter already rejected the order - don't override it.
	if ( is_wp_error( $allowed ) ) {
		error_log( '[MF RealID Guard] Skipping - order already rejected upstream: ' . $allowed->get_error_code() );
		return $allowed;
	}

	if ( ! get_option( 'mf_realid_order_guard_enabled', true ) ) {
		error_log( '[MF RealID Guard] DISABLED via mf_realid_order_guard_enabled option - allowing order without verification.' );
		return $allowed;
	}

	$check_id = sanitize_text_field( (string) $check_id );
	$email    = sanitize_email( $billing['email'] ?? '' );

	error_log( '[MF RealID Guard] Checking order - check_id=' . ( $check_id ?: '(none)' ) . ' email=' . ( $email ?: '(none)' ) );

	if ( ! $check_id || ! $email ) {
		error_log( '[MF RealID Guard] Rejected: missing check_id or billing email - check_id=' . ( $check_id ?: '(none)' ) . ' email=' . ( $email ?: '(none)' ) );
		return new WP_Error(
			'realid_missing',
			'ID verification is required to complete this order.'
		);
	}

	$check = mf_realid_fetch_check( $check_id );

	if ( ! $check || empty( $check['email'] ) ) {
		error_log( '[MF RealID Guard] Rejected: could not fetch/confirm check_id=' . $check_id . ' (unverifiable)' );
		return new WP_Error(
			'realid_unverifiable',
			'We could not confirm your ID verification. Please try again.'
		);
	}

	if ( strtolower( trim( (string) $check['email'] ) ) !== strtolower( trim( $email ) ) ) {
		error_log( '[MF RealID Guard] Rejected: email mismatch for check_id=' . $check_id . ' - order email=' . $email . ', check email=' . $check['email'] );
		return new WP_Error(
			'realid_mismatch',
			'ID verification does not match this order.'
		);
	}

	// Mirrors STRONGLY_VERIFIED_STEPS in src/components/RealIdVerification.tsx -
	// 'opened'/'delivered' are set the instant a check is created, before anything
	// is actually verified, so they must never be accepted here.
	$verified_steps = array( 'completed', 'in_review', 'manually_approved' );
	$step           = $check['step'] ?? null;
	$status         = $check['status'] ?? null;

	if ( ! in_array( $step, $verified_steps, true ) && ! in_array( $status, $verified_steps, true ) ) {
		error_log( '[MF RealID Guard] Rejected: check_id=' . $check_id . ' has not reached a verified state - step=' . ( $step ?? '(none)' ) . ' status=' . ( $status ?? '(none)' ) );
		return new WP_Error(
			'realid_not_verified',
			'ID verification has not been completed for this order.'
		);
	}

	error_log( '[MF RealID Guard] Allowed: check_id=' . $check_id . ' verified (step=' . ( $step ?? '(none)' ) . ' status=' . ( $status ?? '(none)' ) . ') and matches order email=' . $email );

	return true;
}

/**
 * Fetch a Real ID check by id, entirely server-side.
 *
 * The identity-verification-for-woocommerce plugin's own REST route
 * (real-id/v1/checks/{id}) requires the manage_real_id capability, which this
 * request - authenticated only via the Faust shared secret, no WP user
 * session - does not have. Rather than reaching into that plugin's internal
 * PHP classes (tight coupling to code we don't own), dispatch the same route
 * internally via rest_do_request(), briefly acting as an existing
 * administrator for just this one call, then immediately restoring whatever
 * user context was active before.
 */
function mf_realid_fetch_check( $check_id ) {
	$admins = get_users( array(
		'role'   => 'administrator',
		'number' => 1,
		'fields' => 'ID',
	) );

	if ( empty( $admins ) ) {
		error_log( '[MF RealID Guard] No administrator account found - cannot authenticate the internal real-id/v1/checks/{id} lookup for check_id=' . $check_id );
		return null;
	}

	$previous_user_id = get_current_user_id();
	wp_set_current_user( $admins[0] );

	try {
		$request  = new WP_REST_Request( 'GET', '/real-id/v1/checks/' . rawurlencode( $check_id ) );
		$response = rest_do_request( $request );
		if ( $response->is_error() ) {
			error_log( '[MF RealID Guard] real-id/v1/checks/' . $check_id . ' returned an error status=' . $response->get_status() );
		}
		// get_data() can come back as a stdClass (identity-verification-for-woocommerce's
		// get_check() does json_decode() without the associative-array flag) or an array
		// depending on the upstream response shape - normalize to an array either way.
		$data = json_decode( wp_json_encode( $response->get_data() ), true );
	} finally {
		wp_set_current_user( $previous_user_id );
	}

	if ( ! is_array( $data ) ) {
		error_log( '[MF RealID Guard] real-id/v1/checks/' . $check_id . ' returned unparseable data.' );
		return null;
	}

	return $data['check'] ?? $data;
}
