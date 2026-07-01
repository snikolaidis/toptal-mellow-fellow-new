<?php
/**
 * Plugin Name: Mellow Fellow - CIM Payment Profile Storage
 * Description: REST endpoints for storing/retrieving Authorize.net CIM payment profiles
 *              in WordPress user meta. Used by the headless Next.js checkout.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', 'mf_cim_register_routes' );

function mf_cim_register_routes() {
    // Save a payment profile to user meta
    register_rest_route( 'mf/v1', '/payment-profiles', [
        'methods'             => 'POST',
        'callback'            => 'mf_cim_save_profile',
        'permission_callback' => 'mf_cim_verify_request',
    ] );

    // Get saved cards for a user
    register_rest_route( 'mf/v1', '/payment-profiles/(?P<user_id>\d+)', [
        'methods'             => 'GET',
        'callback'            => 'mf_cim_get_profiles',
        'permission_callback' => 'mf_cim_verify_request',
    ] );

    // Delete a specific payment profile
    register_rest_route( 'mf/v1', '/payment-profiles/(?P<user_id>\d+)/(?P<profile_id>[a-zA-Z0-9]+)', [
        'methods'             => 'DELETE',
        'callback'            => 'mf_cim_delete_profile',
        'permission_callback' => 'mf_cim_verify_request',
    ] );
}

/**
 * Verify the request is authorized. Accepts either:
 * - WordPress cookie auth (for admin/testing)
 * - Faust.js secret key in Authorization header (for Next.js server)
 */
function mf_cim_verify_request( $request ) {
    // Allow logged-in WordPress users
    if ( is_user_logged_in() ) {
        return true;
    }

    // Check for Faust secret key
    $auth = $request->get_header( 'Authorization' );
    if ( $auth && strpos( $auth, 'Bearer ' ) === 0 ) {
        $provided = substr( $auth, 7 );
        // Check against Faust secret key (stored in options by FaustWP plugin)
        $faust_secret = get_option( 'faustwp_secret_key', '' );
        if ( $faust_secret && hash_equals( $faust_secret, $provided ) ) {
            return true;
        }
        // Also check the constant if defined
        if ( defined( 'FAUSTWP_SECRET_KEY' ) && hash_equals( FAUSTWP_SECRET_KEY, $provided ) ) {
            return true;
        }
    }

    // Also check X-FaustWP-Secret header (used by Faust.js internals)
    $faust_header = $request->get_header( 'X-FaustWP-Secret' );
    if ( $faust_header ) {
        $faust_secret = get_option( 'faustwp_secret_key', '' );
        if ( $faust_secret && hash_equals( $faust_secret, $faust_header ) ) {
            return true;
        }
    }

    return new WP_Error( 'rest_forbidden', 'Unauthorized', [ 'status' => 401 ] );
}

/**
 * Save a CIM profile to user meta.
 *
 * Request body:
 * {
 *   "userId": 123,
 *   "customerProfileId": "12345",
 *   "paymentProfileId": "67890",
 *   "last4": "1111",
 *   "cardType": "Visa",
 *   "expDate": "XXXX"
 * }
 */
function mf_cim_save_profile( $request ) {
    $body    = $request->get_json_params();
    $user_id = intval( $body['userId'] ?? 0 );

    if ( ! $user_id || ! get_user_by( 'ID', $user_id ) ) {
        return new WP_Error( 'invalid_user', 'User not found', [ 'status' => 404 ] );
    }

    $customer_profile_id = sanitize_text_field( $body['customerProfileId'] ?? '' );
    $payment_profile_id  = sanitize_text_field( $body['paymentProfileId'] ?? '' );

    if ( ! $customer_profile_id || ! $payment_profile_id ) {
        return new WP_Error( 'missing_data', 'customerProfileId and paymentProfileId required', [ 'status' => 400 ] );
    }

    // Store the customer profile ID
    update_user_meta( $user_id, '_authnet_customer_profile_id', $customer_profile_id );

    // Add payment profile to the list
    $profiles = get_user_meta( $user_id, '_authnet_payment_profiles', true );
    if ( ! is_array( $profiles ) ) {
        $profiles = [];
    }

    // Check for duplicate
    $exists = false;
    foreach ( $profiles as $p ) {
        if ( $p['paymentProfileId'] === $payment_profile_id ) {
            $exists = true;
            break;
        }
    }

    if ( ! $exists ) {
        $profiles[] = [
            'paymentProfileId' => $payment_profile_id,
            'last4'            => sanitize_text_field( $body['last4'] ?? '' ),
            'cardType'         => sanitize_text_field( $body['cardType'] ?? '' ),
            'expDate'          => sanitize_text_field( $body['expDate'] ?? '' ),
            'createdAt'        => time(),
        ];
        update_user_meta( $user_id, '_authnet_payment_profiles', $profiles );
    }

    return new WP_REST_Response( [
        'success'           => true,
        'customerProfileId' => $customer_profile_id,
        'paymentProfileId'  => $payment_profile_id,
        'totalProfiles'     => count( $profiles ),
    ], 200 );
}

/**
 * Get saved payment profiles for a user.
 */
function mf_cim_get_profiles( $request ) {
    $user_id = intval( $request->get_param( 'user_id' ) );

    if ( ! $user_id || ! get_user_by( 'ID', $user_id ) ) {
        return new WP_Error( 'invalid_user', 'User not found', [ 'status' => 404 ] );
    }

    $customer_profile_id = get_user_meta( $user_id, '_authnet_customer_profile_id', true );
    $profiles            = get_user_meta( $user_id, '_authnet_payment_profiles', true );

    return new WP_REST_Response( [
        'success'           => true,
        'customerProfileId' => $customer_profile_id ?: null,
        'paymentProfiles'   => is_array( $profiles ) ? $profiles : [],
    ], 200 );
}

/**
 * Delete a specific payment profile from user meta.
 */
function mf_cim_delete_profile( $request ) {
    $user_id    = intval( $request->get_param( 'user_id' ) );
    $profile_id = sanitize_text_field( $request->get_param( 'profile_id' ) );

    if ( ! $user_id || ! get_user_by( 'ID', $user_id ) ) {
        return new WP_Error( 'invalid_user', 'User not found', [ 'status' => 404 ] );
    }

    $profiles = get_user_meta( $user_id, '_authnet_payment_profiles', true );
    if ( ! is_array( $profiles ) ) {
        return new WP_REST_Response( [ 'success' => true, 'message' => 'No profiles to delete' ], 200 );
    }

    $profiles = array_values( array_filter( $profiles, function( $p ) use ( $profile_id ) {
        return $p['paymentProfileId'] !== $profile_id;
    } ) );

    update_user_meta( $user_id, '_authnet_payment_profiles', $profiles );

    // If no profiles left, clean up the customer profile ID too
    if ( empty( $profiles ) ) {
        delete_user_meta( $user_id, '_authnet_customer_profile_id' );
    }

    return new WP_REST_Response( [
        'success'        => true,
        'profileDeleted' => $profile_id,
        'remaining'      => count( $profiles ),
    ], 200 );
}
