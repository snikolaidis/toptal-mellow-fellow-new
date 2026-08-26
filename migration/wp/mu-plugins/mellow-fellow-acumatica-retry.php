<?php
/**
 * Plugin Name: Mellow Fellow - Acumatica Retry Endpoint
 * Description: REST endpoint to retry pushing orders to Acumatica.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', function() {
    register_rest_route( 'mf-acu/v1', '/push/(?P<order_id>\d+)', array(
        'methods'             => 'POST',
        'permission_callback' => function() { return current_user_can( 'manage_woocommerce' ); },
        'callback'            => function( $request ) {
            $order_id = (int) $request['order_id'];

            if ( ! function_exists( 'wc_get_order' ) ) {
                return new WP_Error( 'wc_missing', 'WooCommerce not loaded', array( 'status' => 500 ) );
            }

            $order = wc_get_order( $order_id );
            if ( ! $order ) {
                return new WP_Error( 'not_found', 'Order not found', array( 'status' => 404 ) );
            }

            $order->delete_meta_data( '_acumatica_order_pushed' );
            $order->delete_meta_data( '_acumatica_push_status' );
            $order->delete_meta_data( '_acumatica_push_error' );
            $order->delete_meta_data( '_acumatica_customer_id' );
            $order->update_meta_data( '_acumatica_push_attempts', 0 );
            $order->save();

            if ( ! function_exists( 'mf_acu_push_order' ) ) {
                return new WP_Error( 'plugin_missing', 'Acumatica orders plugin not loaded', array( 'status' => 500 ) );
            }

            if ( function_exists( 'mf_acu_log' ) ) {
                mf_acu_log( "REST push triggered for order $order_id", 'retry' );
            }

            mf_acu_push_order( $order_id );

            $order = wc_get_order( $order_id );
            return array(
                'order_id' => $order_id,
                'status'   => $order->get_meta( '_acumatica_push_status' ) ?: 'pending',
                'error'    => $order->get_meta( '_acumatica_push_error' ) ?: '',
                'nbr'      => $order->get_meta( '_acumatica_order_nbr' ) ?: '',
                'pushed'   => $order->get_meta( '_acumatica_order_pushed' ) ?: 'no',
            );
        },
    ) );
} );
