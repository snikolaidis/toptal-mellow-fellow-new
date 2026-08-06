<?php
/**
 * Plugin Name: Mellow Fellow - Create Order REST Endpoint
 * Description: Creates WooCommerce orders from explicit line items, bypassing
 *              session-based cart resolution. Used by the headless checkout to
 *              decouple order creation from any specific cart session mechanism.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', function() {
    register_rest_route( 'mf/v1', '/create-order', [
        'methods'             => 'POST',
        'callback'            => 'mf_create_order',
        'permission_callback' => 'mf_verify_faust_secret',
    ] );
} );

function mf_verify_faust_secret( WP_REST_Request $request ) {
    $secret = defined( 'FAUSTWP_SECRET_KEY' )
        ? FAUSTWP_SECRET_KEY
        : get_option( 'faustwp_secret_key' );
    if ( ! $secret ) return false;

    $auth = $request->get_header( 'Authorization' );
    if ( ! $auth ) return false;

    $token = preg_replace( '/^Bearer\s+/i', '', $auth );
    return hash_equals( $secret, $token );
}

function mf_create_order( WP_REST_Request $request ) {
    $body = $request->get_json_params();

    $billing  = $body['billing']  ?? [];
    $shipping = $body['shipping'] ?? $billing;
    $items    = $body['items']    ?? [];

    if ( empty( $items ) ) {
        return new WP_REST_Response( [
            'success' => false,
            'message' => 'No line items provided',
        ], 400 );
    }

    $transaction_id = sanitize_text_field( $body['transactionId'] ?? '' );
    $payment_method = sanitize_text_field( $body['paymentMethod'] ?? 'authorize_net' );
    $coupon_codes   = $body['couponCodes'] ?? [];
    $shipping_lines = $body['shippingLines'] ?? [];
    $meta_data      = $body['metaData'] ?? [];
    $customer_id    = absint( $body['customerId'] ?? 0 );
    $realid_check_id = sanitize_text_field( $body['realIdCheckId'] ?? '' );

    /**
     * Real ID (getverdict.com) identity verification is currently enforced only
     * client-side (see RealIdVerification.tsx / checkout.tsx) - the browser just
     * disables the Pay button until verified. That's not a real security boundary:
     * anyone can call this endpoint directly and skip it entirely. This filter is
     * the server-side backstop - see mellow-fellow-realid-order-guard.php, which
     * hooks in here to independently re-confirm verification before we allow an
     * order to be created. Return a WP_Error to reject; anything else allows it.
     */
    $realid_allowed = apply_filters( 'mf_realid_order_allowed', true, $realid_check_id, $billing );
    if ( is_wp_error( $realid_allowed ) ) {
        return new WP_REST_Response( [
            'success' => false,
            'code'    => $realid_allowed->get_error_code(),
            'message' => $realid_allowed->get_error_message(),
        ], 403 );
    }

    try {
        $order = wc_create_order( [
            'customer_id' => $customer_id,
            'status'      => 'processing',
        ] );

        if ( is_wp_error( $order ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => $order->get_error_message(),
            ], 500 );
        }

        // Add line items
        foreach ( $items as $item ) {
            $product_id   = absint( $item['productId'] ?? 0 );
            $variation_id = absint( $item['variationId'] ?? 0 );
            $quantity     = max( 1, absint( $item['quantity'] ?? 1 ) );

            $product = $variation_id
                ? wc_get_product( $variation_id )
                : wc_get_product( $product_id );

            if ( ! $product ) continue;

            $item_id = $order->add_product( $product, $quantity );

            // Override price if provided (e.g. bundle discount pricing)
            if ( isset( $item['unitPrice'] ) && is_numeric( $item['unitPrice'] ) ) {
                wc_update_order_item_meta( $item_id, '_line_subtotal', floatval( $item['unitPrice'] ) * $quantity );
                wc_update_order_item_meta( $item_id, '_line_total', floatval( $item['unitPrice'] ) * $quantity );
            }
        }

        // Billing address
        $order->set_address( [
            'first_name' => sanitize_text_field( $billing['firstName'] ?? '' ),
            'last_name'  => sanitize_text_field( $billing['lastName'] ?? '' ),
            'email'      => sanitize_email( $billing['email'] ?? '' ),
            'phone'      => sanitize_text_field( $billing['phone'] ?? '' ),
            'address_1'  => sanitize_text_field( $billing['address1'] ?? '' ),
            'address_2'  => sanitize_text_field( $billing['address2'] ?? '' ),
            'city'       => sanitize_text_field( $billing['city'] ?? '' ),
            'state'      => sanitize_text_field( $billing['state'] ?? '' ),
            'postcode'   => sanitize_text_field( $billing['postcode'] ?? '' ),
            'country'    => sanitize_text_field( $billing['country'] ?? '' ),
        ], 'billing' );

        // Shipping address
        $order->set_address( [
            'first_name' => sanitize_text_field( $shipping['firstName'] ?? $billing['firstName'] ?? '' ),
            'last_name'  => sanitize_text_field( $shipping['lastName'] ?? $billing['lastName'] ?? '' ),
            'address_1'  => sanitize_text_field( $shipping['address1'] ?? $billing['address1'] ?? '' ),
            'address_2'  => sanitize_text_field( $shipping['address2'] ?? $billing['address2'] ?? '' ),
            'city'       => sanitize_text_field( $shipping['city'] ?? $billing['city'] ?? '' ),
            'state'      => sanitize_text_field( $shipping['state'] ?? $billing['state'] ?? '' ),
            'postcode'   => sanitize_text_field( $shipping['postcode'] ?? $billing['postcode'] ?? '' ),
            'country'    => sanitize_text_field( $shipping['country'] ?? $billing['country'] ?? '' ),
        ], 'shipping' );

        // Shipping lines
        foreach ( $shipping_lines as $sl ) {
            $shipping_item = new WC_Order_Item_Shipping();
            $shipping_item->set_method_title( sanitize_text_field( $sl['methodTitle'] ?? 'Shipping' ) );
            $shipping_item->set_method_id( sanitize_text_field( $sl['methodId'] ?? 'flat_rate' ) );
            $shipping_item->set_total( floatval( $sl['total'] ?? 0 ) );
            $order->add_item( $shipping_item );
        }

        // Coupons
        foreach ( $coupon_codes as $code ) {
            $code = sanitize_text_field( $code );
            if ( $code ) {
                $order->apply_coupon( $code );
            }
        }

        // Payment details
        $order->set_payment_method( $payment_method );
        $order->set_payment_method_title( 'Credit Card (Authorize.net)' );
        if ( $transaction_id ) {
            $order->set_transaction_id( $transaction_id );
        }

        // Meta data
        foreach ( $meta_data as $meta ) {
            $key = sanitize_text_field( $meta['key'] ?? '' );
            $val = sanitize_text_field( $meta['value'] ?? '' );
            if ( $key ) {
                $order->update_meta_data( $key, $val );
            }
        }

        $order->calculate_totals();
        $order->payment_complete( $transaction_id );
        $order->save();

        return new WP_REST_Response( [
            'success'     => true,
            'orderId'     => $order->get_id(),
            'orderNumber' => $order->get_order_number(),
            'total'       => $order->get_total(),
            'status'      => $order->get_status(),
        ], 201 );

    } catch ( Exception $e ) {
        return new WP_REST_Response( [
            'success' => false,
            'message' => $e->getMessage(),
        ], 500 );
    }
}
