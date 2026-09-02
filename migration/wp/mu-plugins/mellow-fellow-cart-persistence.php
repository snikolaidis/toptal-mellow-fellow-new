<?php
/**
 * Plugin Name: Mellow Fellow - Cart Token Persistence
 * Description: REST endpoints for saving/restoring WooCommerce cart tokens
 *              as WordPress user meta. Enables cart persistence across login/logout.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', 'mf_cart_persistence_register_routes' );

function mf_cart_persistence_register_routes() {
    register_rest_route( 'mf/v1', '/cart-token', [
        'methods'             => 'POST',
        'callback'            => 'mf_cart_token_save',
        'permission_callback' => 'mf_cart_token_verify_request',
    ] );

    register_rest_route( 'mf/v1', '/cart-token/(?P<user_id>\d+)', [
        [
            'methods'             => 'GET',
            'callback'            => 'mf_cart_token_get',
            'permission_callback' => 'mf_cart_token_verify_request',
        ],
        [
            'methods'             => 'DELETE',
            'callback'            => 'mf_cart_token_delete',
            'permission_callback' => 'mf_cart_token_verify_request',
        ],
    ] );
}

function mf_cart_token_verify_request( $request ) {
    if ( is_user_logged_in() ) {
        return true;
    }

    $settings     = get_option( 'faustwp_settings', [] );
    $faust_secret = is_array( $settings ) ? ( $settings['secret_key'] ?? '' ) : '';

    $auth = $request->get_header( 'Authorization' );
    if ( $auth && strpos( $auth, 'Bearer ' ) === 0 ) {
        $provided = trim( substr( $auth, 7 ) );
        if ( $faust_secret && hash_equals( $faust_secret, $provided ) ) {
            return true;
        }
    }

    $faust_header = $request->get_header( 'X-FaustWP-Secret' );
    if ( $faust_header && $faust_secret && hash_equals( $faust_secret, trim( $faust_header ) ) ) {
        return true;
    }

    return new WP_Error( 'rest_forbidden', 'Unauthorized', [ 'status' => 401 ] );
}

function mf_cart_token_save( $request ) {
    $body      = $request->get_json_params();
    $user_id   = intval( $body['userId'] ?? 0 );
    $cart_token = sanitize_text_field( $body['cartToken'] ?? '' );

    if ( ! $user_id || ! get_user_by( 'ID', $user_id ) ) {
        return new WP_Error( 'invalid_user', 'User not found', [ 'status' => 404 ] );
    }

    if ( ! $cart_token ) {
        return new WP_Error( 'missing_data', 'cartToken is required', [ 'status' => 400 ] );
    }

    update_user_meta( $user_id, '_mf_cart_token', $cart_token );
    update_user_meta( $user_id, '_mf_cart_token_saved_at', time() );

    return new WP_REST_Response( [ 'success' => true ], 200 );
}

function mf_cart_token_get( $request ) {
    $user_id = intval( $request->get_param( 'user_id' ) );

    if ( ! $user_id || ! get_user_by( 'ID', $user_id ) ) {
        return new WP_Error( 'invalid_user', 'User not found', [ 'status' => 404 ] );
    }

    $cart_token = get_user_meta( $user_id, '_mf_cart_token', true );
    $saved_at   = (int) get_user_meta( $user_id, '_mf_cart_token_saved_at', true );

    if ( ! $cart_token ) {
        return new WP_REST_Response( [ 'success' => true, 'cartToken' => null ], 200 );
    }

    $seven_days = 7 * 24 * 60 * 60;
    if ( $saved_at && ( time() - $saved_at ) > $seven_days ) {
        delete_user_meta( $user_id, '_mf_cart_token' );
        delete_user_meta( $user_id, '_mf_cart_token_saved_at' );
        return new WP_REST_Response( [ 'success' => true, 'cartToken' => null ], 200 );
    }

    return new WP_REST_Response( [ 'success' => true, 'cartToken' => $cart_token ], 200 );
}

function mf_cart_token_delete( $request ) {
    $user_id = intval( $request->get_param( 'user_id' ) );

    if ( ! $user_id || ! get_user_by( 'ID', $user_id ) ) {
        return new WP_Error( 'invalid_user', 'User not found', [ 'status' => 404 ] );
    }

    delete_user_meta( $user_id, '_mf_cart_token' );
    delete_user_meta( $user_id, '_mf_cart_token_saved_at' );

    // Also clear WooCommerce's own persistent cart so it doesn't restore old
    // items into a new session when the user adds products after clearing.
    delete_user_meta( $user_id, '_woocommerce_persistent_cart_1' );

    return new WP_REST_Response( [ 'success' => true ], 200 );
}
