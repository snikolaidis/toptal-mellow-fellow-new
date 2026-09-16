<?php
/**
 * Plugin Name: Mellow Fellow - Sezzle Gateway Bridge
 * Description: Bridges the headless checkout to the installed Sezzle
 *              WooCommerce plugin (sezzle-woocommerce-payment, gateway id
 *              'sezzlepay') instead of talking to Sezzle's API directly.
 *              Creates a pending order the same way mf/v1/create-order does
 *              (see mf_build_order_from_payload() there), then hands it to
 *              WC_Gateway_Sezzlepay::process_payment() — the plugin itself
 *              creates the Sezzle checkout session, verifies approval via
 *              its own ?wc-api= callback, captures funds, and marks the
 *              order paid. This file's job is just redirecting the shopper
 *              back to the Next.js frontend instead of WordPress's own
 *              theme once that's done, since nothing here should ever show
 *              a real shopper the WP-rendered checkout/thank-you pages.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', function() {
    register_rest_route( 'mf/v1', '/create-sezzle-order', [
        'methods'             => 'POST',
        'callback'            => 'mf_create_sezzle_order',
        'permission_callback' => 'mf_verify_faust_secret',
    ] );
} );

function mf_create_sezzle_order( WP_REST_Request $request ) {
    $body = $request->get_json_params();

    $invalid = mf_validate_order_payload( $body );
    if ( $invalid ) {
        return $invalid;
    }

    try {
        // 'pending', not 'processing' — payment isn't resolved yet at this
        // point (the shopper hasn't even reached Sezzle's checkout). The
        // gateway's own callback transitions this once they actually approve.
        $order = mf_build_order_from_payload( $body, 'pending' );

        $gateways = WC()->payment_gateways()->payment_gateways();
        $gateway  = $gateways['sezzlepay'] ?? null;
        if ( ! $gateway ) {
            throw new Exception( 'Sezzle is not enabled in WooCommerce.' );
        }

        // mf_build_order_from_payload() sets payment_method from the request
        // body, which the frontend can't be relied on to send as the real WC
        // gateway id — this endpoint only ever means Sezzle, so set it here.
        $order->set_payment_method( 'sezzlepay' );
        $order->set_payment_method_title( $gateway->get_title() ?: 'Sezzle' );
        $order->save();

        // Standard WC_Payment_Gateway contract — the plugin builds the Sezzle
        // session itself using the credentials already configured in
        // WooCommerce > Settings > Payments and returns where to send the
        // shopper next.
        $result = $gateway->process_payment( $order->get_id() );

        if ( empty( $result['result'] ) || 'success' !== $result['result'] || empty( $result['redirect'] ) ) {
            $notices = function_exists( 'wc_get_notices' ) ? wc_get_notices( 'error' ) : [];
            $message = ! empty( $notices[0]['notice'] )
                ? wp_strip_all_tags( $notices[0]['notice'] )
                : 'Could not start Sezzle checkout.';
            if ( function_exists( 'wc_clear_notices' ) ) {
                wc_clear_notices();
            }
            throw new Exception( $message );
        }

        return new WP_REST_Response( [
            'success'     => true,
            'orderId'     => $order->get_id(),
            'orderNumber' => $order->get_order_number(),
            'redirectUrl' => $result['redirect'],
        ], 201 );

    } catch ( Exception $e ) {
        return new WP_REST_Response( [
            'success' => false,
            'message' => $e->getMessage(),
        ], 500 );
    }
}

/**
 * Once WC_Gateway_Sezzlepay's own ?wc-api= callback verifies approval,
 * captures funds, and calls $order->payment_complete(), it redirects the
 * shopper to $this->get_return_url($order) — standard WC_Payment_Gateway
 * core, which applies this filter. Send them to the Next.js order
 * confirmation page (the order is already fully paid by this point) instead
 * of WordPress's own theme.
 */
add_filter( 'woocommerce_get_return_url', function( $return_url, $order ) {
    // Scoped to Sezzle orders only, else this also rewrites card orders' return URL.
    if ( ! $order instanceof WC_Order || 'sezzlepay' !== $order->get_payment_method() ) {
        return $return_url;
    }
    $frontend = function_exists( 'mellow_fellow_frontend_url' ) ? mellow_fellow_frontend_url() : '';
    if ( ! $frontend ) return $return_url;

    return $frontend . '/order-confirmation?' . http_build_query( [
        'orderId' => $order->get_order_number(),
        'total'   => '$' . number_format( (float) $order->get_total(), 2 ),
    ] );
}, 10, 2 );

/**
 * On a declined/cancelled Sezzle payment, the plugin redirects to
 * wc_get_checkout_url() instead of the order-aware get_return_url() above —
 * a general WooCommerce function with no order context, used site-wide on
 * this headless install (where nothing should ever land a real shopper on
 * the WP-rendered checkout), so this points every use of it at the Next.js
 * checkout. Specifically during Sezzle's own decline callback, also flag it
 * so checkout.tsx can show why the shopper landed back here (see the
 * ?sezzle=cancelled handling already built for the cancel_url case).
 */
add_filter( 'woocommerce_get_checkout_url', function( $checkout_url ) {
    $frontend = function_exists( 'mellow_fellow_frontend_url' ) ? mellow_fellow_frontend_url() : '';
    if ( ! $frontend ) return $checkout_url;

    $wc_api = isset( $_GET['wc-api'] ) ? strtolower( sanitize_text_field( wp_unslash( $_GET['wc-api'] ) ) ) : '';
    return 'wc_gateway_sezzlepay' === $wc_api
        ? $frontend . '/checkout?sezzle=cancelled'
        : $frontend . '/checkout';
} );
