<?php
/**
 * Plugin Name: Mellow Fellow - Acumatica Retry Endpoint
 * Description: REST endpoint to retry pushing orders to Acumatica.
 * Version: 1.0.1
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', function() {
    register_rest_route( 'mf-acu/v1', '/stress-test', array(
        'methods'             => 'POST',
        'permission_callback' => function() { return current_user_can( 'manage_options' ); },
        'callback'            => function() {
            if ( ! function_exists( 'mf_acu_login' ) || ! function_exists( 'mf_acu_logout' ) ) {
                return new WP_Error( 'plugin_missing', 'Core plugin not loaded', array( 'status' => 500 ) );
            }

            delete_transient( MF_ACU_SESSION_KEY );
            wp_cache_delete( MF_ACU_LOGIN_LOCK_KEY, 'transient' );
            delete_transient( MF_ACU_LOGIN_LOCK_KEY );

            $before_log = get_option( MF_ACU_LOG_OPTION, array() );
            $before_count = 0;
            foreach ( $before_log as $entry ) {
                if ( strpos( $entry['message'], 'Session created (pooled' ) !== false ) {
                    $before_count++;
                }
            }

            $urls = array();
            $concurrent = 5;
            $mh = curl_multi_init();
            $handles = array();

            $test_url = rest_url( 'mf-acu/v1/stress-test-worker' );
            $cookies_raw = array();
            foreach ( $_COOKIE as $k => $v ) {
                $cookies_raw[] = "$k=$v";
            }
            $cookie_header = implode( '; ', $cookies_raw );
            $nonce = wp_create_nonce( 'wp_rest' );

            for ( $i = 0; $i < $concurrent; $i++ ) {
                $ch = curl_init();
                curl_setopt( $ch, CURLOPT_URL, $test_url );
                curl_setopt( $ch, CURLOPT_POST, true );
                curl_setopt( $ch, CURLOPT_RETURNTRANSFER, true );
                curl_setopt( $ch, CURLOPT_TIMEOUT, 30 );
                curl_setopt( $ch, CURLOPT_SSL_VERIFYPEER, false );
                curl_setopt( $ch, CURLOPT_HTTPHEADER, array(
                    'X-WP-Nonce: ' . $nonce,
                    'Cookie: ' . $cookie_header,
                ) );
                curl_multi_add_handle( $mh, $ch );
                $handles[] = $ch;
            }

            do {
                $status = curl_multi_exec( $mh, $active );
                if ( $active ) curl_multi_select( $mh );
            } while ( $active && $status === CURLM_OK );

            $worker_results = array();
            foreach ( $handles as $ch ) {
                $body = curl_multi_getcontent( $ch );
                $worker_results[] = json_decode( $body, true );
                curl_multi_remove_handle( $mh, $ch );
                curl_close( $ch );
            }
            curl_multi_close( $mh );

            $after_log = get_option( MF_ACU_LOG_OPTION, array() );
            $after_count = 0;
            foreach ( $after_log as $entry ) {
                if ( strpos( $entry['message'], 'Session created (pooled' ) !== false ) {
                    $after_count++;
                }
            }

            $sessions_created = $after_count - $before_count;
            $workers_ok = 0;
            foreach ( $worker_results as $wr ) {
                if ( isset( $wr['got_session'] ) && $wr['got_session'] ) $workers_ok++;
            }

            $session = get_transient( MF_ACU_SESSION_KEY );
            if ( $session && is_array( $session ) ) {
                mf_acu_logout( $session );
            }

            return array(
                'concurrent_requests' => $concurrent,
                'sessions_created'    => $sessions_created,
                'workers_got_session' => $workers_ok,
                'pass'                => $sessions_created <= 1 && $workers_ok === $concurrent,
                'detail'              => $sessions_created <= 1
                    ? "All $concurrent requests shared 1 session — pooling works"
                    : "Created $sessions_created sessions instead of 1 — lock may not be atomic",
            );
        },
    ) );

    register_rest_route( 'mf-acu/v1', '/stress-test-worker', array(
        'methods'             => 'POST',
        'permission_callback' => function() { return current_user_can( 'manage_options' ); },
        'callback'            => function() {
            if ( ! function_exists( 'mf_acu_login' ) ) {
                return array( 'got_session' => false, 'error' => 'core not loaded' );
            }
            $session = mf_acu_login();
            return array(
                'got_session' => ! is_wp_error( $session ),
                'error'       => is_wp_error( $session ) ? $session->get_error_message() : '',
            );
        },
    ) );

    register_rest_route( 'mf-acu/v1', '/push/(?P<order_id>\d+)', array(
        'methods'             => 'POST',
        'permission_callback' => function() { return current_user_can( 'manage_woocommerce' ); },
        'callback'            => function( $request ) {
            $order_id = (int) $request['order_id'];

            $rate_key = 'mf_acu_push_rate_' . $order_id;
            if ( get_transient( $rate_key ) ) {
                return new WP_Error( 'rate_limited', 'Please wait before retrying this order.', array( 'status' => 429 ) );
            }
            set_transient( $rate_key, 1, 30 );

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

            $order  = wc_get_order( $order_id );
            $status = $order->get_meta( '_acumatica_push_status' ) ?: 'pending';

            $response = array(
                'order_id' => $order_id,
                'status'   => $status,
                'nbr'      => $order->get_meta( '_acumatica_order_nbr' ) ?: '',
                'pushed'   => $order->get_meta( '_acumatica_order_pushed' ) ?: 'no',
            );

            if ( 'success' !== $status ) {
                $response['error'] = 'Push failed. Check Settings > Acumatica Sync for details.';
            }

            return $response;
        },
    ) );

} );
