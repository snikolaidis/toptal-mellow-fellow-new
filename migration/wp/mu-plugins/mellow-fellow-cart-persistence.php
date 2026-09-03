<?php
/**
 * Plugin Name: Mellow Fellow - Cart Token Persistence
 * Description: REST endpoints for saving/restoring WooCommerce cart tokens
 *              as WordPress user meta. Enables cart persistence across login/logout.
 *              Also registers a Store API extension for atomic cart clearing.
 * Version: 1.1.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

// Disable WooCommerce's built-in persistent cart — we manage cart persistence
// ourselves via _mf_cart_token user meta and the restore-for-user flow.
// Without this, WC saves cart contents to _woocommerce_persistent_cart_1 on
// every change and restores them into new sessions, causing "zombie carts"
// that reappear after the user clears them.
add_filter( 'woocommerce_persistent_cart_enabled', '__return_false' );

// Store API cart-ops extension: atomic cart operations via a single
// POST /wc/store/v1/cart/extensions call. Handles empty_cart plus bundle
// add/remove (calling the same BB_Cart core methods the GraphQL mutations
// wrapped) — so ALL cart mutations run through the one Cart-Token session
// and the legacy WooGraphQL session (wc_session_token) can be retired.
function mf_cart_ops_error( $message ) {
    if ( class_exists( 'Automattic\WooCommerce\StoreApi\Exceptions\RouteException' ) ) {
        throw new Automattic\WooCommerce\StoreApi\Exceptions\RouteException( 'mf_cart_ops_error', esc_html( $message ), 400 );
    }
    throw new Exception( esc_html( $message ) );
}

add_action( 'woocommerce_blocks_loaded', function() {
    if ( function_exists( 'woocommerce_store_api_register_update_callback' ) ) {
        woocommerce_store_api_register_update_callback( [
            'namespace' => 'mellow-fellow/cart-ops',
            'callback'  => function( $data ) {
                $action = $data['action'] ?? '';

                if ( $action === 'empty_cart' && WC()->cart ) {
                    WC()->cart->empty_cart( true );
                    return;
                }

                if ( $action === 'add_bundle' ) {
                    if ( ! class_exists( 'BB_Cart' ) ) {
                        mf_cart_ops_error( 'Bundle builder is not available.' );
                    }
                    $bundle_id   = intval( $data['bundle_id'] ?? 0 );
                    $product_ids = array_values( array_filter( array_map( 'intval', (array) ( $data['product_ids'] ?? [] ) ) ) );
                    $result      = BB_Cart::get_instance()->add_bundle_to_cart( $bundle_id, $product_ids );
                    if ( empty( $result['success'] ) ) {
                        mf_cart_ops_error( $result['message'] ?? 'Could not add bundle to cart.' );
                    }
                    return;
                }

                if ( $action === 'remove_bundle_group' ) {
                    if ( ! class_exists( 'BB_Cart' ) ) {
                        mf_cart_ops_error( 'Bundle builder is not available.' );
                    }
                    $group_keys = array_filter( array_map( 'sanitize_text_field', (array) ( $data['group_keys'] ?? [] ) ) );
                    $removed    = 0;
                    foreach ( $group_keys as $group_key ) {
                        $removed += (int) BB_Cart::get_instance()->remove_group( $group_key );
                    }
                    if ( ! $removed ) {
                        mf_cart_ops_error( 'No bundle with that group key was found in the cart.' );
                    }
                    if ( WC()->cart ) {
                        WC()->cart->calculate_totals();
                    }
                    return;
                }
            },
        ] );
    }

    // Expose bundle-builder identity on every Store API cart item
    // (item.extensions['mellow-fellow']) so the frontend reads bundle
    // grouping from the server instead of a client-side sessionStorage map.
    if ( function_exists( 'woocommerce_store_api_register_endpoint_data' )
        && class_exists( 'Automattic\WooCommerce\StoreApi\Schemas\V1\CartItemSchema' ) ) {
        woocommerce_store_api_register_endpoint_data( [
            'endpoint'        => Automattic\WooCommerce\StoreApi\Schemas\V1\CartItemSchema::IDENTIFIER,
            'namespace'       => 'mellow-fellow',
            'data_callback'   => function ( $cart_item ) {
                return [
                    'bb_group_key'  => isset( $cart_item['bb_group_key'] ) ? (string) $cart_item['bb_group_key'] : '',
                    'bb_bundle_id'  => isset( $cart_item['bb_bundle_id'] ) ? intval( $cart_item['bb_bundle_id'] ) : 0,
                    'bb_locked'     => ! empty( $cart_item['bb_locked'] ),
                    'bb_unit_price' => isset( $cart_item['bb_unit_price'] ) ? floatval( $cart_item['bb_unit_price'] ) : null,
                ];
            },
            'schema_callback' => function () {
                return [
                    'bb_group_key'  => [ 'type' => 'string' ],
                    'bb_bundle_id'  => [ 'type' => 'integer' ],
                    'bb_locked'     => [ 'type' => 'boolean' ],
                    'bb_unit_price' => [ 'type' => [ 'number', 'null' ] ],
                ];
            },
            'schema_type'     => ARRAY_A,
        ] );
    }
} );

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
