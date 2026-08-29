<?php
/**
 * Plugin Name: Mellow Fellow - Acumatica Order Push
 * Description: Pushes WooCommerce orders to Acumatica as Sales Orders (type MF,
 *              MFSO sequence) via async Action Scheduler. Never blocks the admin
 *              order status change — schedules immediately, processes within seconds.
 * Version: 1.0.0
 * Depends: mellow-fellow-acumatica-core.php
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'MF_ACU_ORDER_HOOK', 'mf_acu_push_order_async' );
define( 'MF_ACU_ORDER_MAX_ATTEMPTS', 3 );

function mf_acu_mask_email( $email ) {
    $parts = explode( '@', $email, 2 );
    if ( count( $parts ) !== 2 ) return '***';
    return substr( $parts[0], 0, 2 ) . '***@' . $parts[1];
}

/* ── hook: schedule push when order hits processing ──────────────── */

add_action( 'woocommerce_order_status_processing', 'mf_acu_schedule_order_push', 30, 1 );

function mf_acu_schedule_order_push( $order_id ) {
    $order = wc_get_order( $order_id );
    if ( ! $order ) return;

    if ( 'yes' === $order->get_meta( '_acumatica_order_pushed' ) ) return;

    if ( function_exists( 'as_schedule_single_action' ) ) {
        if ( ! as_next_scheduled_action( MF_ACU_ORDER_HOOK, array( $order_id ) ) ) {
            as_schedule_single_action( time(), MF_ACU_ORDER_HOOK, array( $order_id ) );
        }
    } else {
        wp_schedule_single_event( time(), MF_ACU_ORDER_HOOK, array( $order_id ) );
    }
}

/* ── async handler ───────────────────────────────────────────────── */

add_action( MF_ACU_ORDER_HOOK, 'mf_acu_push_order', 10, 1 );

function mf_acu_push_order( $order_id ) {
    mf_acu_log( "Push started for order $order_id", 'orders' );

    if ( ! function_exists( 'mf_acu_login' ) ) {
        mf_acu_order_fail( $order_id, 'Acumatica core plugin not loaded' );
        return;
    }

    if ( ! mf_acu_environment_ok() ) {
        mf_acu_log( "Order $order_id skipped — non-production environment (" . home_url() . ')', 'orders' );
        return;
    }

    $order = wc_get_order( $order_id );
    if ( ! $order ) {
        mf_acu_log( "Order $order_id not found, skipping push", 'orders' );
        return;
    }

    if ( 'yes' === $order->get_meta( '_acumatica_order_pushed' ) ) {
        mf_acu_log( "Order $order_id already pushed, skipping", 'orders' );
        return;
    }

    if ( mf_acu_circuit_is_open() ) {
        mf_acu_order_fail( $order_id, 'Circuit breaker is open' );
        return;
    }

    $session = mf_acu_login();
    if ( is_wp_error( $session ) ) {
        mf_acu_order_fail( $order_id, 'Auth failed: ' . $session->get_error_message() );
        mf_acu_circuit_record_failure();
        return;
    }

    $customer_id = mf_acu_resolve_customer( $order, $session );
    if ( is_wp_error( $customer_id ) ) {
        mf_acu_order_fail( $order_id, 'Customer resolution failed: ' . $customer_id->get_error_message() );
        mf_acu_circuit_record_failure();
        return;
    }

    $payload = mf_acu_build_sales_order_payload( $order, $customer_id );

    mf_acu_log( sprintf(
        'Pushing order %d: OrderType=%s, Branch=%s, CustomerID=%s, Lines=%d, SKUs=%s',
        $order_id,
        $payload['OrderType']['value'] ?? '?',
        $payload['Branch']['value'] ?? '?',
        $payload['CustomerID']['value'] ?? '?',
        count( $payload['Details'] ?? [] ),
        implode( ',', array_map( function( $l ) { return $l['InventoryID']['value'] ?? '?'; }, $payload['Details'] ?? [] ) )
    ), 'orders' );

    $result  = mf_acu_rest_put( '/entity/Default/24.200.001/SalesOrder', $payload, $session );

    if ( is_wp_error( $result ) ) {
        mf_acu_order_fail( $order_id, $result->get_error_message() );
        mf_acu_circuit_record_failure();
        return;
    }

    $acu_order_nbr = isset( $result['OrderNbr']['value'] ) ? $result['OrderNbr']['value'] : '';

    $order->update_meta_data( '_acumatica_order_pushed', 'yes' );
    $order->update_meta_data( '_acumatica_order_nbr', $acu_order_nbr );
    $order->update_meta_data( '_acumatica_push_time', time() );
    $order->update_meta_data( '_acumatica_push_status', 'success' );
    $order->update_meta_data( '_acumatica_push_error', '' );
    $order->save();

    mf_acu_circuit_record_success();

    $payment_ref = mf_acu_create_prepayment( $order, $customer_id, $acu_order_nbr, $session );

    $note_msg = sprintf( 'Acumatica Sales Order %s created.', $acu_order_nbr );
    if ( $payment_ref ) {
        $note_msg .= sprintf( ' Payment %s attached.', $payment_ref );
    }
    $order->add_order_note( $note_msg, false, true );

    mf_acu_record( 'order-push', true, "Order $order_id → $acu_order_nbr" );
    mf_acu_log( "Order $order_id pushed as $acu_order_nbr", 'orders' );
}

/* ── prepayment creation ────────────────────────────────────────── */

function mf_acu_create_prepayment( $order, $customer_id, $acu_order_nbr, $session ) {
    $order_total = (float) $order->get_total();
    if ( $order_total <= 0 || ! $acu_order_nbr ) {
        return '';
    }

    $payment_method = mf_acu_config( 'PAYMENT_METHOD', 'CREDITCARD' );
    $cash_account   = mf_acu_config( 'CASH_ACCOUNT', '1092' );
    $order_id       = $order->get_id();

    $payment_payload = array(
        'Type'          => array( 'value' => 'Prepayment' ),
        'CustomerID'    => array( 'value' => $customer_id ),
        'PaymentMethod' => array( 'value' => $payment_method ),
        'CashAccount'   => array( 'value' => $cash_account ),
        'PaymentAmount' => array( 'value' => $order_total ),
        'Hold'          => array( 'value' => false ),
        'Description'   => array( 'value' => 'WooCommerce Order #' . $order->get_order_number() ),
        'OrdersToApply' => array(
            array(
                'OrderType'  => array( 'value' => mf_acu_order_type() ),
                'OrderNbr'   => array( 'value' => $acu_order_nbr ),
                'AmountPaid' => array( 'value' => $order_total ),
            ),
        ),
    );

    $transaction_id = $order->get_transaction_id();
    if ( $transaction_id ) {
        $payment_payload['PaymentRef'] = array( 'value' => (string) $transaction_id );
    }

    mf_acu_log( "Creating prepayment for order $order_id ($acu_order_nbr): \${$order_total} via $payment_method", 'orders' );

    $result = mf_acu_rest_put( '/entity/Default/24.200.001/Payment', $payment_payload, $session );

    if ( is_wp_error( $result ) ) {
        mf_acu_log( "Payment creation failed for order $order_id: " . $result->get_error_message(), 'orders' );
        $order->add_order_note( 'Acumatica payment creation failed: ' . $result->get_error_message(), false, true );
        return '';
    }

    $ref_nbr = isset( $result['ReferenceNbr']['value'] ) ? $result['ReferenceNbr']['value'] : '';
    $order->update_meta_data( '_acumatica_payment_ref', $ref_nbr );
    $order->save();

    mf_acu_log( "Payment $ref_nbr created for order $order_id ($acu_order_nbr)", 'orders' );
    return $ref_nbr;
}

/* ── failure handling with retry ─────────────────────────────────── */

function mf_acu_order_fail( $order_id, $error_msg ) {
    $order = wc_get_order( $order_id );
    if ( ! $order ) return;

    $attempts = (int) $order->get_meta( '_acumatica_push_attempts' );
    $attempts++;

    $order->update_meta_data( '_acumatica_push_attempts', $attempts );
    $order->update_meta_data( '_acumatica_push_error', $error_msg );

    if ( $attempts >= MF_ACU_ORDER_MAX_ATTEMPTS ) {
        $order->update_meta_data( '_acumatica_push_status', 'failed' );
        $order->save();

        $order->add_order_note(
            sprintf( 'Acumatica push FAILED after %d attempts. Last error: %s', $attempts, $error_msg ),
            false,
            true
        );

        mf_acu_record( 'order-push', false, "Order $order_id failed after $attempts attempts: $error_msg" );
        mf_acu_log( "Order $order_id push failed permanently: $error_msg", 'orders' );
        return;
    }

    $order->update_meta_data( '_acumatica_push_status', 'retrying' );
    $order->save();

    $delays    = array( 300, 600, 1200 );
    $delay     = isset( $delays[ $attempts - 1 ] ) ? $delays[ $attempts - 1 ] : 1200;
    $retry_at  = time() + $delay;

    if ( function_exists( 'as_schedule_single_action' ) ) {
        as_schedule_single_action( $retry_at, MF_ACU_ORDER_HOOK, array( $order_id ) );
    } else {
        wp_schedule_single_event( $retry_at, MF_ACU_ORDER_HOOK, array( $order_id ) );
    }

    mf_acu_log( "Order $order_id attempt $attempts failed, retrying in " . ( $delay / 60 ) . " min: $error_msg", 'orders' );
}

/* ── customer lookup / create ─────────────────────────────────────── */

function mf_acu_resolve_customer( $order, $session ) {
    $email = strtolower( trim( $order->get_billing_email() ) );
    if ( ! $email ) {
        return new WP_Error( 'mf_acu_no_email', 'Order has no billing email.' );
    }

    $cached = $order->get_meta( '_acumatica_customer_id' );
    if ( $cached ) return $cached;

    $escaped = str_replace( "'", "''", $email );
    $search  = mf_acu_rest_get(
        '/entity/Default/24.200.001/Customer?' . http_build_query( array( '$filter' => "Email eq '$escaped'", '$top' => 1, '$select' => 'CustomerID' ) ),
        $session
    );

    if ( ! is_wp_error( $search ) && is_array( $search ) && ! empty( $search ) ) {
        $found_id = $search[0]['CustomerID']['value'];
        $order->update_meta_data( '_acumatica_customer_id', $found_id );
        $order->save();
        mf_acu_log( 'Customer found for ' . mf_acu_mask_email( $email ) . ": $found_id", 'orders' );
        return $found_id;
    }

    $customer_name = trim( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() );
    if ( ! $customer_name ) $customer_name = $email;

    $customer_class = mf_acu_config( 'CUSTOMER_CLASS', 'MFF' );

    $payload = array(
        'CustomerName'  => array( 'value' => $customer_name ),
        'CustomerClass' => array( 'value' => $customer_class ),
        'Email'         => array( 'value' => $email ),
        'MainContact'   => array(
            'FirstName'   => array( 'value' => $order->get_billing_first_name() ),
            'LastName'    => array( 'value' => $order->get_billing_last_name() ),
            'Email'       => array( 'value' => $email ),
            'Phone1'      => array( 'value' => $order->get_billing_phone() ),
            'CompanyName' => array( 'value' => $order->get_billing_company() ?: $customer_name ),
            'Attention'   => array( 'value' => $customer_name ),
        ),
    );

    $result = mf_acu_rest_put( '/entity/Default/24.200.001/Customer', $payload, $session );

    if ( is_wp_error( $result ) ) {
        mf_acu_log( 'Customer create failed for ' . mf_acu_mask_email( $email ) . ': ' . $result->get_error_message(), 'orders' );
        return $result;
    }

    $new_id = isset( $result['CustomerID']['value'] ) ? $result['CustomerID']['value'] : '';
    if ( ! $new_id ) {
        return new WP_Error( 'mf_acu_customer_no_id', 'Customer created but no CustomerID returned.' );
    }

    $order->update_meta_data( '_acumatica_customer_id', $new_id );
    $order->save();

    mf_acu_log( 'Customer created for ' . mf_acu_mask_email( $email ) . ": $new_id", 'orders' );
    return $new_id;
}

/* ── payload builder ─────────────────────────────────────────────── */

function mf_acu_build_sales_order_payload( $order, $customer_id = '' ) {
    $lines = array();

    foreach ( $order->get_items() as $item ) {
        $product = $item->get_product();
        if ( ! $product ) continue;

        $sku = $product->get_sku();
        if ( ! $sku ) continue;

        $line = array(
            'InventoryID'   => array( 'value' => $sku ),
            'OrderQty'      => array( 'value' => (float) $item->get_quantity() ),
            'UnitPrice'     => array( 'value' => (float) ( $item->get_subtotal() / max( 1, $item->get_quantity() ) ) ),
            'ExtendedPrice' => array( 'value' => (float) $item->get_subtotal() ),
        );

        $line_discount = round( (float) $item->get_subtotal() - (float) $item->get_total(), 2 );
        if ( $line_discount > 0 ) {
            $line['DiscountAmount'] = array( 'value' => $line_discount );
        }

        $lines[] = $line;
    }

    $billing  = array(
        'OverrideAddress' => array( 'value' => true ),
        'AddressLine1'    => array( 'value' => $order->get_billing_address_1() ),
        'AddressLine2'    => array( 'value' => $order->get_billing_address_2() ),
        'City'            => array( 'value' => $order->get_billing_city() ),
        'State'           => array( 'value' => $order->get_billing_state() ),
        'PostalCode'      => array( 'value' => $order->get_billing_postcode() ),
        'CountryID'       => array( 'value' => $order->get_billing_country() ),
    );

    $shipping = array(
        'OverrideAddress' => array( 'value' => true ),
        'AddressLine1'    => array( 'value' => $order->get_shipping_address_1() ?: $order->get_billing_address_1() ),
        'AddressLine2'    => array( 'value' => $order->get_shipping_address_2() ?: $order->get_billing_address_2() ),
        'City'            => array( 'value' => $order->get_shipping_city() ?: $order->get_billing_city() ),
        'State'           => array( 'value' => $order->get_shipping_state() ?: $order->get_billing_state() ),
        'PostalCode'      => array( 'value' => $order->get_shipping_postcode() ?: $order->get_billing_postcode() ),
        'CountryID'       => array( 'value' => $order->get_shipping_country() ?: $order->get_billing_country() ),
    );

    $billing_contact = array(
        'OverrideContact' => array( 'value' => true ),
        'BusinessName'    => array( 'value' => $order->get_billing_company() ),
        'Attention'       => array( 'value' => trim( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() ) ),
        'Email'           => array( 'value' => $order->get_billing_email() ),
        'Phone1'          => array( 'value' => $order->get_billing_phone() ),
    );

    $shipping_contact = array(
        'OverrideContact' => array( 'value' => true ),
        'Attention'       => array( 'value' => trim(
            ( $order->get_shipping_first_name() ?: $order->get_billing_first_name() ) . ' ' .
            ( $order->get_shipping_last_name() ?: $order->get_billing_last_name() )
        ) ),
    );

    $payload = array(
        'OrderType'          => array( 'value' => mf_acu_order_type() ),
        'Branch'             => array( 'value' => mf_acu_branch() ),
        'CustomerOrder'      => array( 'value' => (string) $order->get_order_number() ),
        'ExternalRef'        => array( 'value' => (string) $order->get_id() ),
        'Description'        => array( 'value' => 'WooCommerce Order #' . $order->get_order_number() ),
        'Hold'               => array( 'value' => false ),
        'Details'            => $lines,
        'BillToAddress'      => $billing,
        'ShipToAddress'      => $shipping,
        'BillToContact'      => $billing_contact,
        'ShipToContact'      => $shipping_contact,
    );

    if ( $customer_id ) {
        $payload['CustomerID'] = array( 'value' => $customer_id );
    }

    $shipping_total = (float) $order->get_shipping_total();
    if ( $shipping_total > 0 ) {
        $payload['FreightPrice'] = array( 'value' => $shipping_total );
        $payload['OverrideFreightPrice'] = array( 'value' => true );
    }

    $note_parts = array();
    $coupons = $order->get_coupon_codes();
    if ( ! empty( $coupons ) ) {
        $coupon_details = array();
        foreach ( $order->get_items( 'coupon' ) as $coupon_item ) {
            $coupon_details[] = strtoupper( $coupon_item->get_code() ) . ' (-$' . number_format( (float) $coupon_item->get_discount(), 2 ) . ')';
        }
        $note_parts[] = 'Coupons: ' . implode( ', ', $coupon_details );
    }
    $customer_note = $order->get_customer_note();
    if ( $customer_note ) {
        $note_parts[] = 'Customer note: ' . $customer_note;
    }
    $payment_title = $order->get_payment_method_title();
    if ( $payment_title ) {
        $note_parts[] = 'Payment method: ' . $payment_title;
    }
    $transaction_id = $order->get_transaction_id();
    if ( $transaction_id ) {
        $note_parts[] = 'Transaction ID: ' . $transaction_id;
    }
    if ( ! empty( $note_parts ) ) {
        $payload['note'] = array( 'value' => implode( "\n", $note_parts ) );
    }

    return $payload;
}

/* ── admin column: Acumatica status on orders list ───────────────── */

add_action( 'manage_shop_order_posts_custom_column', 'mf_acu_order_column_content', 10, 2 );
add_action( 'manage_woocommerce_page_wc-orders_custom_column', 'mf_acu_order_column_content', 10, 2 );

function mf_acu_order_column_content( $column, $order_or_id ) {
    if ( 'acumatica_status' !== $column ) return;

    $order = $order_or_id instanceof WC_Order ? $order_or_id : wc_get_order( $order_or_id );
    if ( ! $order ) return;

    $pushed = $order->get_meta( '_acumatica_order_pushed' );
    $nbr    = $order->get_meta( '_acumatica_order_nbr' );
    $status = $order->get_meta( '_acumatica_push_status' );
    $error  = $order->get_meta( '_acumatica_push_error' );

    if ( 'yes' === $pushed && $nbr ) {
        echo '<span style="color:#00a32a">&#10003; ' . esc_html( $nbr ) . '</span>';
    } elseif ( 'failed' === $status ) {
        echo '<span style="color:#d63638" title="' . esc_attr( $error ) . '">&#10007; Failed</span>';
    } elseif ( 'retrying' === $status || $error ) {
        echo '<span style="color:#dba617" title="' . esc_attr( $error ) . '">&#9888; Error</span>';
    } elseif ( $order->has_status( 'processing' ) ) {
        echo '<span style="color:#dba617">&#8230; Pending</span>';
    } else {
        echo '&mdash;';
    }
}

add_filter( 'manage_edit-shop_order_columns', 'mf_acu_add_order_column' );
add_filter( 'manage_woocommerce_page_wc-orders_columns', 'mf_acu_add_order_column' );

function mf_acu_add_order_column( $columns ) {
    $new = array();
    foreach ( $columns as $key => $label ) {
        $new[ $key ] = $label;
        if ( 'order_status' === $key ) {
            $new['acumatica_status'] = 'Acumatica';
        }
    }
    return $new;
}

/* ── order edit screen: Acumatica status metabox ─────────────────── */

add_action( 'add_meta_boxes', function() {
    $screen = class_exists( '\Automattic\WooCommerce\Utilities\OrderUtil' )
        && \Automattic\WooCommerce\Utilities\OrderUtil::custom_orders_table_usage_is_enabled()
        ? wc_get_page_screen_id( 'shop-order' )
        : 'shop_order';

    add_meta_box(
        'mf_acu_order_status',
        'Acumatica',
        'mf_acu_render_order_metabox',
        $screen,
        'side',
        'high'
    );
} );

function mf_acu_render_order_metabox( $post_or_order ) {
    $order = $post_or_order instanceof WC_Order
        ? $post_or_order
        : wc_get_order( $post_or_order->ID );
    if ( ! $order ) return;

    $pushed      = $order->get_meta( '_acumatica_order_pushed' );
    $nbr         = $order->get_meta( '_acumatica_order_nbr' );
    $status      = $order->get_meta( '_acumatica_push_status' );
    $error       = $order->get_meta( '_acumatica_push_error' );
    $time        = $order->get_meta( '_acumatica_push_time' );
    $cust_id     = $order->get_meta( '_acumatica_customer_id' );
    $payment_ref = $order->get_meta( '_acumatica_payment_ref' );
    $email       = $order->get_billing_email();

    $attempts = (int) $order->get_meta( '_acumatica_push_attempts' );

    if ( 'yes' === $pushed && $nbr ) {
        echo '<p style="color:#00a32a;font-weight:600">&#10003; Pushed</p>';
        echo '<p><strong>Order:</strong> ' . esc_html( $nbr ) . '</p>';
        if ( $cust_id ) echo '<p><strong>Customer:</strong> ' . esc_html( $cust_id ) . '</p>';
        if ( $payment_ref ) echo '<p><strong>Payment:</strong> ' . esc_html( $payment_ref ) . '</p>';
        if ( $time ) echo '<p><strong>Pushed:</strong> ' . esc_html( wp_date( 'Y-m-d H:i', (int) $time ) ) . '</p>';
    } elseif ( 'failed' === $status ) {
        echo '<p style="color:#d63638;font-weight:600">&#10007; Push Failed</p>';
        echo '<p>' . esc_html( $error ) . '</p>';
        if ( ! $email ) {
            echo '<p style="color:#d63638"><strong>Missing billing email.</strong> Add an email address and retry.</p>';
        }
    } elseif ( $error ) {
        echo '<p style="color:#dba617;font-weight:600">&#9888; Push error (attempt ' . $attempts . '/' . MF_ACU_ORDER_MAX_ATTEMPTS . ')</p>';
        echo '<p>' . esc_html( $error ) . '</p>';
    } elseif ( $order->has_status( 'processing' ) ) {
        echo '<p style="color:#dba617;font-weight:600">&#8230; Pending push</p>';
    } else {
        echo '<p>Not pushed</p>';
    }

    if ( 'yes' !== $pushed ) {
        $oid = $order->get_id();
        ?>
        <div style="margin-top:12px">
            <button type="button" id="mf-acu-push-btn" class="button button-primary" style="width:100%">Push to Acumatica Now</button>
            <p id="mf-acu-push-msg" style="margin-top:8px;display:none"></p>
        </div>
        <script>
        (function(){
            var btn = document.getElementById('mf-acu-push-btn');
            var msg = document.getElementById('mf-acu-push-msg');
            btn.addEventListener('click', function(){
                btn.disabled = true;
                btn.textContent = 'Pushing...';
                msg.style.display = 'none';
                fetch('<?php echo esc_url( rest_url( 'mf-acu/v1/push/' . (int) $oid ) ); ?>', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {'X-WP-Nonce': '<?php echo wp_create_nonce( 'wp_rest' ); ?>'}
                })
                .then(function(r){ return r.json(); })
                .then(function(data){
                    if (data.pushed === 'yes' || data.status === 'success') {
                        msg.style.color = '#00a32a';
                        msg.textContent = 'Pushed: ' + (data.nbr || 'success');
                        msg.style.display = 'block';
                        setTimeout(function(){ location.reload(); }, 1500);
                    } else {
                        msg.style.color = '#d63638';
                        msg.textContent = data.error || data.message || 'Push failed';
                        msg.style.display = 'block';
                        btn.disabled = false;
                        btn.textContent = 'Push to Acumatica Now';
                    }
                })
                .catch(function(){
                    msg.style.color = '#d63638';
                    msg.textContent = 'Request failed';
                    msg.style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = 'Push to Acumatica Now';
                });
            });
        })();
        </script>
        <?php
    }
}

/* ── dashboard notice: orders stuck in failed state ──────────────── */

add_action( 'admin_notices', function() {
    if ( ! current_user_can( 'manage_woocommerce' ) ) return;

    $screen = get_current_screen();
    if ( ! $screen ) return;

    $on_orders = in_array( $screen->id, array( 'edit-shop_order', 'woocommerce_page_wc-orders' ), true );
    $on_dash   = 'dashboard' === $screen->id;
    if ( ! $on_orders && ! $on_dash ) return;

    $args = array(
        'status'     => 'processing',
        'limit'      => -1,
        'return'     => 'ids',
        'meta_query' => array(
            array(
                'key'   => '_acumatica_push_status',
                'value' => 'failed',
            ),
        ),
    );

    $failed = wc_get_orders( $args );
    if ( empty( $failed ) ) return;

    $count = count( $failed );
    printf(
        '<div class="notice notice-error"><p><strong>%d order%s failed to push to Acumatica.</strong> Open each order and use "Push to Acumatica" to retry, or check Settings &gt; <a href="%s">Acumatica Sync</a> for details.</p></div>',
        $count,
        $count > 1 ? 's' : '',
        esc_url( admin_url( 'options-general.php?page=mf-acumatica' ) )
    );
} );

/* ── manual push from order edit screen ──────────────────────────── */

add_action( 'woocommerce_order_actions', function( $actions ) {
    $actions['mf_acu_push_order'] = 'Push to Acumatica';
    return $actions;
} );

add_action( 'woocommerce_order_action_mf_acu_push_order', function( $order ) {
    mf_acu_log( 'Order action handler fired for order ' . $order->get_id(), 'retry' );

    $order->delete_meta_data( '_acumatica_order_pushed' );
    $order->delete_meta_data( '_acumatica_push_status' );
    $order->delete_meta_data( '_acumatica_push_error' );
    $order->delete_meta_data( '_acumatica_customer_id' );
    $order->update_meta_data( '_acumatica_push_attempts', 0 );
    $order->save();

    mf_acu_push_order( $order->get_id() );
} );

