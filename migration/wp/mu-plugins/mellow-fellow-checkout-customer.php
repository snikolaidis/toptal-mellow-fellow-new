<?php
/**
 * Plugin Name: Mellow Fellow Checkout Customer
 * Description: Provides authenticated WooCommerce customer data for the headless checkout.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * GET /wp-json/mellow-fellow/v1/checkout-customer
 */
add_action(
	'rest_api_init',
	function () {

		/*
		 * EXISTING ENDPOINT
		 * DO NOT CHANGE
		 */
		register_rest_route(
			'mellow-fellow/v1',
			'/checkout-customer',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'mf_get_checkout_customer',
				'permission_callback' => 'mf_checkout_customer_permission',
			)
		);

		/*
		 * NEW GOOGLE CUSTOMER UPDATE ENDPOINT
		 */
		register_rest_route(
			'mellow-fellow/v1',
			'/google-customer',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'mf_update_google_customer',
				'permission_callback' => 'mf_google_customer_permission',
			)
		);
	}
);

/**
 * Authenticate request.
 *
 * Supports the WordPress logged-in session first.
 * Also supports the Faust shared secret for server-to-server requests.
 */
function mf_checkout_customer_permission( WP_REST_Request $request ) {

	// Normal WordPress authenticated request.
	if ( is_user_logged_in() ) {
		return true;
	}

	// Faust secret authentication.
	$provided = $request->get_header( 'X-FaustWP-Secret' );

	if ( empty( $provided ) ) {
		$auth = $request->get_header( 'Authorization' );

		if ( $auth && preg_match( '/Bearer\s+(.+)/i', $auth, $matches ) ) {
			$provided = trim( $matches[1] );
		}
	}

	$settings = get_option( 'faustwp_settings', array() );
	$secret   = is_array( $settings ) ? ( $settings['secret_key'] ?? '' ) : '';

	if ( $secret && $provided && hash_equals( $secret, trim( $provided ) ) ) {
		return true;
	}

	return new WP_Error(
		'checkout_customer_unauthorized',
		'Authentication required.',
		array( 'status' => 401 )
	);
}

/**
 * Return WooCommerce customer data.
 */
function mf_get_checkout_customer( WP_REST_Request $request ) {

	$user_id = get_current_user_id();

	/**
	 * If the request is authenticated with the Faust secret,
	 * allow the caller to provide the WordPress user ID.
	 */
	if ( ! $user_id ) {
		$user_id = absint( $request->get_param( 'user_id' ) );
	}

	if ( ! $user_id ) {
		return new WP_Error(
			'customer_not_found',
			'Unable to determine customer.',
			array( 'status' => 404 )
		);
	}

	$user = get_user_by( 'id', $user_id );

	if ( ! $user ) {
		return new WP_Error(
			'customer_not_found',
			'Customer not found.',
			array( 'status' => 404 )
		);
	}

	/**
	 * WooCommerce customer billing fields.
	 */
	$billing = array(
		'firstName' => (string) get_user_meta( $user_id, 'billing_first_name', true ),
		'lastName'  => (string) get_user_meta( $user_id, 'billing_last_name', true ),
		'company'   => (string) get_user_meta( $user_id, 'billing_company', true ),
		'address1'  => (string) get_user_meta( $user_id, 'billing_address_1', true ),
		'address2'  => (string) get_user_meta( $user_id, 'billing_address_2', true ),
		'city'      => (string) get_user_meta( $user_id, 'billing_city', true ),
		'state'     => (string) get_user_meta( $user_id, 'billing_state', true ),
		'postcode'  => (string) get_user_meta( $user_id, 'billing_postcode', true ),
		'country'   => (string) get_user_meta( $user_id, 'billing_country', true ),
		'phone'     => (string) get_user_meta( $user_id, 'billing_phone', true ),
		'email'     => (string) get_user_meta( $user_id, 'billing_email', true ),
	);

	/**
	 * WooCommerce customer shipping fields.
	 */
	$shipping = array(
		'firstName' => (string) get_user_meta( $user_id, 'shipping_first_name', true ),
		'lastName'  => (string) get_user_meta( $user_id, 'shipping_last_name', true ),
		'company'   => (string) get_user_meta( $user_id, 'shipping_company', true ),
		'address1'  => (string) get_user_meta( $user_id, 'shipping_address_1', true ),
		'address2'  => (string) get_user_meta( $user_id, 'shipping_address_2', true ),
		'city'      => (string) get_user_meta( $user_id, 'shipping_city', true ),
		'state'     => (string) get_user_meta( $user_id, 'shipping_state', true ),
		'postcode'  => (string) get_user_meta( $user_id, 'shipping_postcode', true ),
		'country'   => (string) get_user_meta( $user_id, 'shipping_country', true ),
		'phone'     => (string) get_user_meta( $user_id, 'shipping_phone', true ),
	);

	$first_name = get_user_meta( $user_id, 'first_name', true );
	$last_name  = get_user_meta( $user_id, 'last_name', true );

	/**
	 * Fallback to WordPress profile data.
	 */
	if ( empty( $billing['firstName'] ) ) {
		$billing['firstName'] = (string) $first_name;
	}

	if ( empty( $billing['lastName'] ) ) {
		$billing['lastName'] = (string) $last_name;
	}

	if ( empty( $shipping['firstName'] ) ) {
		$shipping['firstName'] = (string) $first_name;
	}

	if ( empty( $shipping['lastName'] ) ) {
		$shipping['lastName'] = (string) $last_name;
	}

	if ( empty( $billing['email'] ) ) {
		$billing['email'] = (string) $user->user_email;
	}

	/**
	 * Main contact information used by the Next.js checkout.
	 */
	$contact = array(
		'firstName' => (string) $first_name,
		'lastName'  => (string) $last_name,
		'email'     => (string) $user->user_email,
		'phone'     => (string) get_user_meta( $user_id, 'billing_phone', true ),
	);

	if ( empty( $contact['firstName'] ) ) {
		$contact['firstName'] = $billing['firstName'];
	}

	if ( empty( $contact['lastName'] ) ) {
		$contact['lastName'] = $billing['lastName'];
	}

	if ( empty( $contact['phone'] ) ) {
		$contact['phone'] = $shipping['phone'];
	}

	return rest_ensure_response(
		array(
			'success'  => true,
			'customer' => array(
				'id'       => $user_id,
				'username' => $user->user_login,
				'email'    => $user->user_email,
				'contact'  => $contact,
				'billing'  => $billing,
				'shipping' => $shipping,
			),
		)
	);
}



/**
 * Authenticate Google customer update request.
 */
function mf_google_customer_permission( WP_REST_Request $request ) {

	$provided = $request->get_header( 'X-MF-Google-Secret' );

	$secret = defined( 'MF_GOOGLE_AUTH_SECRET' )
		? MF_GOOGLE_AUTH_SECRET
		: '';

	if (
		empty( $secret ) ||
		empty( $provided )
	) {
		return new WP_Error(
			'google_customer_unauthorized',
			'Google customer authentication required.',
			array(
				'status' => 401,
			)
		);
	}

	if (
		! hash_equals(
			$secret,
			trim( $provided )
		)
	) {
		return new WP_Error(
			'google_customer_unauthorized',
			'Invalid Google customer authentication.',
			array(
				'status' => 401,
			)
		);
	}

	return true;
}


/**
 * Update Google customer's WooCommerce address.
 */
function mf_update_google_customer(
	WP_REST_Request $request
) {

	$user_id = absint(
		$request->get_param( 'userId' )
	);

	if ( ! $user_id ) {
		return new WP_Error(
			'customer_not_found',
			'Customer ID is required.',
			array(
				'status' => 400,
			)
		);
	}

	$user = get_user_by(
		'id',
		$user_id
	);

	if ( ! $user ) {
		return new WP_Error(
			'customer_not_found',
			'Customer not found.',
			array(
				'status' => 404,
			)
		);
	}

	$data = $request->get_json_params();

	if ( ! is_array( $data ) ) {
		return new WP_Error(
			'invalid_customer_data',
			'Invalid customer data.',
			array(
				'status' => 400,
			)
		);
	}

	/*
	 * BILLING
	 */
	if (
		isset( $data['billing'] ) &&
		is_array( $data['billing'] )
	) {

		$billing = $data['billing'];

		$billing_fields = array(
			'firstName' => 'billing_first_name',
			'lastName'  => 'billing_last_name',
			'email'     => 'billing_email',
			'phone'     => 'billing_phone',
			'address1'  => 'billing_address_1',
			'address2'  => 'billing_address_2',
			'city'      => 'billing_city',
			'state'     => 'billing_state',
			'postcode'  => 'billing_postcode',
			'country'   => 'billing_country',
		);

		foreach (
			$billing_fields as $input => $meta_key
		) {

			if (
				! array_key_exists(
					$input,
					$billing
				)
			) {
				continue;
			}

			$value = $billing[ $input ];

			if ( 'email' === $input ) {
				$value = sanitize_email( $value );
			} else {
				$value = sanitize_text_field( $value );
			}

			update_user_meta(
				$user_id,
				$meta_key,
				$value
			);
		}
	}

	/*
	 * SHIPPING
	 */
	if (
		isset( $data['shipping'] ) &&
		is_array( $data['shipping'] )
	) {

		$shipping = $data['shipping'];

		$shipping_fields = array(
			'firstName' => 'shipping_first_name',
			'lastName'  => 'shipping_last_name',
			'address1'  => 'shipping_address_1',
			'address2'  => 'shipping_address_2',
			'city'      => 'shipping_city',
			'state'     => 'shipping_state',
			'postcode'  => 'shipping_postcode',
			'country'   => 'shipping_country',
			'phone'     => 'shipping_phone',
		);

		foreach (
			$shipping_fields as $input => $meta_key
		) {

			if (
				! array_key_exists(
					$input,
					$shipping
				)
			) {
				continue;
			}

			update_user_meta(
				$user_id,
				$meta_key,
				sanitize_text_field(
					$shipping[ $input ]
				)
			);
		}
	}

	/*
	 * Keep WordPress profile name synchronized.
	 */
	if (
		isset( $data['billing']['firstName'] )
	) {
		update_user_meta(
			$user_id,
			'first_name',
			sanitize_text_field(
				$data['billing']['firstName']
			)
		);
	}

	if (
		isset( $data['billing']['lastName'] )
	) {
		update_user_meta(
			$user_id,
			'last_name',
			sanitize_text_field(
				$data['billing']['lastName']
			)
		);
	}

	return rest_ensure_response(
		array(
			'success' => true,
			'user_id' => $user_id,
			'message' => 'Google customer updated successfully.',
		)
	);
}