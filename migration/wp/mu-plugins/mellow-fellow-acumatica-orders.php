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
// Some paths take an order straight to "completed" (e.g. all-virtual carts, or a
// manual status jump) without ever passing through "processing". Cover that too —
// the per-order duplicate guards make a second schedule a no-op.
add_action( 'woocommerce_order_status_completed', 'mf_acu_schedule_order_push', 30, 1 );

/* ── fallback sweep: catch orders that never got pushed ──────────────
 * The push is async (Action Scheduler runs on WP Engine's ~1-minute cron), so a
 * brand-new order pushes within a minute or two, not instantly — that's expected
 * and does not block checkout. This recurring sweep is the safety net for the
 * cases async alone can miss: a status hook that never fired, an Action Scheduler
 * job dropped on a deploy/restart, or a transient failure. It re-schedules any
 * recent order that still has no Acumatica SO number. Already-pushed orders (SO
 * number set) and permanently-failed orders (max attempts) are skipped, so it
 * never duplicates and never hammers a broken order. */
add_action( 'init', function () {
    if ( function_exists( 'as_has_scheduled_action' ) && ! as_has_scheduled_action( 'mf_acu_sweep_unpushed' ) ) {
        as_schedule_recurring_action( time() + 300, 15 * MINUTE_IN_SECONDS, 'mf_acu_sweep_unpushed', array(), 'mellow-fellow-acumatica' );
    }
} );

add_action( 'mf_acu_sweep_unpushed', 'mf_acu_sweep_unpushed_orders' );

function mf_acu_sweep_unpushed_orders() {
    if ( ! function_exists( 'mf_acu_environment_ok' ) || ! mf_acu_environment_ok() ) {
        return;
    }
    if ( ! function_exists( 'wc_get_orders' ) ) {
        return;
    }
    $order_ids = wc_get_orders( array(
        'status'       => array( 'wc-processing', 'wc-completed', 'wc-on-hold' ),
        'limit'        => 20,
        'date_created' => '>' . ( time() - 7 * DAY_IN_SECONDS ),
        'return'       => 'ids',
        'meta_query'   => array(
            // Never successfully pushed (no SO number recorded).
            array( 'key' => '_acumatica_order_nbr', 'compare' => 'NOT EXISTS' ),
        ),
    ) );
    foreach ( (array) $order_ids as $oid ) {
        $order = wc_get_order( $oid );
        if ( ! $order ) {
            continue;
        }
        // Skip orders that exhausted their retries — those need manual attention,
        // not an endless re-push loop.
        if ( 'failed' === $order->get_meta( '_acumatica_push_status' ) ) {
            continue;
        }
        // Skip if a push is already queued for it.
        if ( function_exists( 'as_next_scheduled_action' ) && as_next_scheduled_action( MF_ACU_ORDER_HOOK, array( $oid ) ) ) {
            continue;
        }
        mf_acu_log( "Sweep: re-scheduling unpushed order $oid", 'orders' );
        mf_acu_schedule_order_push( $oid );
    }
}

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

    // Authoritative duplicate guard. A successful push records an Acumatica SO
    // number; if one exists we NEVER create another — even when the "pushed" flag
    // was cleared. (The manual retry endpoint clears that flag to allow re-pushing
    // a FAILED order, but a failed order never received an SO number.) This makes a
    // double "Push to Acumatica" click — or a manual push racing the async job —
    // impossible to turn into a duplicate Sales Order.
    $existing_nbr = $order->get_meta( '_acumatica_order_nbr' );
    if ( $existing_nbr ) {
        mf_acu_log( "Order $order_id already has Acumatica SO $existing_nbr — skipping to prevent duplicate", 'orders' );
        return;
    }

    if ( mf_acu_circuit_is_open() ) {
        mf_acu_order_fail( $order_id, 'Circuit breaker is open' );
        return;
    }

    // Atomic cross-process claim: the async job and a manual push must never both
    // be in flight for the same order (the window before either records the SO
    // number). wp_cache_add is atomic on the object cache (Memcache is active), so
    // exactly one process wins the claim; the other backs off. Auto-expires in
    // 5 min so a crashed push can't wedge the order.
    if ( ! wp_cache_add( 'lock_' . $order_id, time(), 'mf_acu_push', 300 ) ) {
        mf_acu_log( "Order $order_id push already in progress (locked) — skipping", 'orders' );
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

    $result  = mf_acu_rest_put( mf_acu_endpoint() . '/SalesOrder', $payload, $session );

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

    // Immediate inventory re-sync of just this order's SKUs. Acumatica allocates on SO
    // creation (Available drops), so we mirror the new Available back within a minute
    // instead of waiting up to 15 for the delta sweep. Scheduled (not inline) so it never
    // slows the push; a 60s delay lets allocation settle. The 15-min delta remains the
    // backstop if this job is dropped.
    $order_skus = array();
    foreach ( $order->get_items() as $line_item ) {
        $p = $line_item->get_product();
        if ( $p && $p->get_sku() ) {
            $order_skus[ $p->get_sku() ] = true;
        }
    }
    $order_skus = array_keys( $order_skus );
    if ( ! empty( $order_skus ) && function_exists( 'as_schedule_single_action' ) && defined( 'MF_ACU_RESYNC_HOOK' ) ) {
        as_schedule_single_action( time() + 60, MF_ACU_RESYNC_HOOK, array( $order_skus ), 'mellow-fellow-acumatica' );
    }

    wp_cache_delete( 'lock_' . $order_id, 'mf_acu_push' );
}

/* ── prepayment creation ────────────────────────────────────────── */

function mf_acu_create_prepayment( $order, $customer_id, $acu_order_nbr, $session ) {
    $order_total = (float) $order->get_total();
    if ( $order_total <= 0 || ! $acu_order_nbr ) {
        return '';
    }

    $payment_method = mf_acu_config( 'PAYMENT_METHOD', 'CCECOMM' );
    $cash_account   = mf_acu_config( 'CASH_ACCOUNT', '1097' );
    $order_id       = $order->get_id();

    $payment_payload = array(
        'Type'             => array( 'value' => 'Prepayment' ),
        'CustomerID'       => array( 'value' => $customer_id ),
        'PaymentMethod'    => array( 'value' => $payment_method ),
        'CashAccount'      => array( 'value' => $cash_account ),
        'PaymentAmount'    => array( 'value' => $order_total ),
        'Hold'             => array( 'value' => true ),
        'Description'      => array( 'value' => 'WooCommerce Order #' . $order->get_order_number() ),
    );

    $transaction_id = $order->get_transaction_id();
    if ( $transaction_id ) {
        $payment_payload['PaymentRef'] = array( 'value' => (string) $transaction_id );
    }

    mf_acu_log( "Creating prepayment for order $order_id ($acu_order_nbr): \${$order_total} via $payment_method", 'orders' );

    $result = mf_acu_rest_put( mf_acu_endpoint() . '/Payment', $payment_payload, $session );

    if ( is_wp_error( $result ) ) {
        mf_acu_log( "Payment creation failed for order $order_id: " . $result->get_error_message(), 'orders' );
        $order->add_order_note( 'Acumatica payment creation failed: ' . $result->get_error_message(), false, true );
        return '';
    }

    $ref_nbr = isset( $result['ReferenceNbr']['value'] ) ? $result['ReferenceNbr']['value'] : '';
    $order->update_meta_data( '_acumatica_payment_ref', $ref_nbr );
    $order->save();

    mf_acu_log( "Payment $ref_nbr created for order $order_id ($acu_order_nbr)", 'orders' );

    $apply_payload = array(
        'Type'          => array( 'value' => 'Prepayment' ),
        'ReferenceNbr'  => array( 'value' => $ref_nbr ),
        'OrdersToApply' => array(
            array(
                'OrderType'  => array( 'value' => mf_acu_order_type() ),
                'OrderNbr'   => array( 'value' => $acu_order_nbr ),
                'AmountPaid' => array( 'value' => $order_total ),
            ),
        ),
    );

    $apply_result = mf_acu_rest_put( mf_acu_endpoint() . '/Payment', $apply_payload, $session );

    if ( is_wp_error( $apply_result ) ) {
        mf_acu_log( "Payment $ref_nbr created but order application failed: " . $apply_result->get_error_message(), 'orders' );
        $order->add_order_note( "Acumatica prepayment $ref_nbr created but could not attach to $acu_order_nbr: " . $apply_result->get_error_message(), false, true );
    } else {
        mf_acu_log( "Payment $ref_nbr applied to order $acu_order_nbr", 'orders' );
    }

    return $ref_nbr;
}

/* ── failure handling with retry ─────────────────────────────────── */

function mf_acu_order_fail( $order_id, $error_msg ) {
    // Release the push claim so a later retry (manual or the fallback sweep) can
    // proceed. Harmless if the lock was never acquired for this order.
    wp_cache_delete( 'lock_' . $order_id, 'mf_acu_push' );

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
        mf_acu_endpoint() . '/Customer?' . http_build_query( array( '$filter' => "Email eq '$escaped'", '$top' => 1, '$select' => 'CustomerID' ) ),
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

    $result = mf_acu_rest_put( mf_acu_endpoint() . '/Customer', $payload, $session );

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

/**
 * Scheme B discount classification: a coupon is document-level (applies to the
 * whole order) only when it carries NO product/category restriction. Product %,
 * BOGO, and free-gift coupons are restricted to specific lines → line-level.
 */
function mf_acu_coupon_is_document_level( $code ) {
    if ( ! function_exists( 'wc_get_coupon_id_by_code' ) || ! class_exists( 'WC_Coupon' ) ) {
        return false;
    }
    $id = wc_get_coupon_id_by_code( $code );
    if ( ! $id ) return false;

    $coupon = new WC_Coupon( $id );
    $type   = (string) $coupon->get_discount_type();

    // Inherently line-level types, and our free-gift coupons (one product).
    if ( 'fixed_product' === $type || strpos( $type, 'bogo' ) !== false ) return false;
    if ( strpos( (string) $code, 'mf-free-gift-' ) === 0 ) return false;

    // Any product/category restriction makes it line-level.
    if ( ! empty( $coupon->get_product_ids() ) || ! empty( $coupon->get_product_categories() )
        || ! empty( $coupon->get_excluded_product_ids() ) || ! empty( $coupon->get_excluded_product_categories() ) ) {
        return false;
    }

    // Order-wide percent / fixed_cart with no restriction → document-level.
    return true;
}

/**
 * Fulfillment warehouse for a product line, from the AUTHORITATIVE ACF
 * 'warehouse_code' field on the product (MFNC / MFFL / AB). Falls back to the
 * parent product for variations. Returns '' when unset — in which case we omit
 * WarehouseID and Acumatica applies the item's own default warehouse (no breakage).
 * The three codes in use are all valid, active Acumatica WarehouseIDs, so they map
 * 1:1 with no translation table.
 */
function mf_acu_product_warehouse( $product ) {
    if ( ! $product ) return '';
    $code = trim( (string) $product->get_meta( 'warehouse_code' ) );
    if ( '' === $code && $product->is_type( 'variation' ) ) {
        $parent = wc_get_product( $product->get_parent_id() );
        if ( $parent ) {
            $code = trim( (string) $parent->get_meta( 'warehouse_code' ) );
        }
    }
    return $code;
}

/**
 * Dynamic fulfillment-warehouse routing for an order line.
 *
 * WooCommerce shows a single, cross-warehouse stock number (sum of Available across the
 * sellable warehouses), so an item can be "in stock" on the site while its ACF-preferred
 * warehouse has zero. Forcing the SO line to that empty warehouse makes Acumatica throw a
 * "quantity available will go negative" / over-allocation hold. So we route to a warehouse
 * that actually has the item:
 *   1. the product's ACF warehouse_code, if it is sellable and has Available > 0;
 *   2. otherwise the sellable warehouse with the most Available (> 0);
 *   3. otherwise the ACF code as-is (or '' → Acumatica item default) so the SO still
 *      creates and ops can resolve the shortage in Acumatica.
 *
 * Falls back to the ACF code whenever the inventory plugin / availability read is
 * unavailable, so the order push never depends on the inventory feed being up.
 *
 * @param string                    $sku
 * @param string                    $preferred_code ACF warehouse_code (may be '').
 * @param array<string,float>|null  $avail          Pre-fetched warehouse=>qty map for this
 *                                                   SKU (from one batched OData read for the
 *                                                   whole order). When null, falls back to a
 *                                                   single-SKU read.
 * @return string
 */
function mf_acu_route_warehouse( $sku, $preferred_code, $avail = null ) {
    $preferred_code = trim( (string) $preferred_code );

    if ( ! function_exists( 'mf_acu_sellable_warehouses' ) ) {
        return $preferred_code;
    }

    if ( null === $avail ) {
        if ( ! function_exists( 'mf_acu_sku_warehouse_availability' ) ) {
            return $preferred_code;
        }
        $avail = mf_acu_sku_warehouse_availability( $sku );
    }
    if ( is_wp_error( $avail ) || ! is_array( $avail ) ) {
        return $preferred_code;
    }

    $sellable = mf_acu_sellable_warehouses();

    // 1. Honor the preferred warehouse when it can actually fill the line.
    if ( '' !== $preferred_code
        && in_array( $preferred_code, $sellable, true )
        && isset( $avail[ $preferred_code ] )
        && (float) $avail[ $preferred_code ] > 0 ) {
        return $preferred_code;
    }

    // 2. Otherwise pick the sellable warehouse with the most Available.
    $best_wh  = '';
    $best_qty = 0.0;
    foreach ( $sellable as $wh ) {
        $qty = isset( $avail[ $wh ] ) ? (float) $avail[ $wh ] : 0.0;
        if ( $qty > $best_qty ) {
            $best_qty = $qty;
            $best_wh  = $wh;
        }
    }

    if ( '' !== $best_wh && $best_wh !== $preferred_code ) {
        mf_acu_log( sprintf(
            'Routing %s to %s (ACF preferred %s had no Available)',
            $sku, $best_wh, $preferred_code !== '' ? $preferred_code : '(none)'
        ), 'orders' );
        return $best_wh;
    }

    // 3. Nothing sellable has stock — keep the preferred code (or item default) and let
    //    Acumatica flag the shortage.
    return $preferred_code;
}

function mf_acu_build_sales_order_payload( $order, $customer_id = '' ) {
    // Scheme B: sum order-wide (document-level) coupon discounts. These become
    // an Acumatica document discount instead of sitting on the line items.
    $document_discount = 0.0;
    foreach ( $order->get_items( 'coupon' ) as $coupon_item ) {
        if ( mf_acu_coupon_is_document_level( $coupon_item->get_code() ) ) {
            $document_discount += (float) $coupon_item->get_discount();
        }
    }
    $document_discount = round( $document_discount, 2 );

    // Pre-fetch per-warehouse availability for every SKU in the order in ONE batched
    // OData call (not one per line), so dynamic routing below adds a single request to
    // Acumatica regardless of line count. Empty map when the inventory plugin isn't
    // loaded or the read fails → routing falls back to the ACF warehouse_code per line.
    $order_skus = array();
    foreach ( $order->get_items() as $scan_item ) {
        $scan_product = $scan_item->get_product();
        if ( $scan_product && $scan_product->get_sku() ) {
            $order_skus[ $scan_product->get_sku() ] = true;
        }
    }
    $avail_all = array();
    if ( ! empty( $order_skus ) && function_exists( 'mf_acu_skus_warehouse_availability' ) ) {
        $fetched = mf_acu_skus_warehouse_availability( array_keys( $order_skus ) );
        if ( ! is_wp_error( $fetched ) && is_array( $fetched ) ) {
            $avail_all = $fetched;
        }
    }

    // Collect sellable lines first — need the subtotal sum to spread the
    // document discount proportionally, matching how WooCommerce distributes it.
    $rows = array();
    $total_subtotal = 0.0;
    foreach ( $order->get_items() as $item ) {
        $product = $item->get_product();
        if ( ! $product ) continue;
        $sku = $product->get_sku();
        if ( ! $sku ) continue;
        $subtotal = (float) $item->get_subtotal();
        $rows[] = array(
            'sku'       => $sku,
            'qty'       => (float) $item->get_quantity(),
            'subtotal'  => $subtotal,
            'line_disc' => round( $subtotal - (float) $item->get_total(), 2 ),
            // Dynamic routing: prefer the product's ACF warehouse_code, but fall back to
            // whichever sellable warehouse actually has the item, so Acumatica never gets a
            // line forced onto an empty warehouse. Uses the batched availability map.
            'warehouse' => mf_acu_route_warehouse(
                $sku,
                mf_acu_product_warehouse( $product ),
                isset( $avail_all[ $sku ] ) ? $avail_all[ $sku ] : array()
            ),
        );
        $total_subtotal += $subtotal;
    }

    // Shift each line's proportional share of the document discount OUT of the
    // line discount so it lands at document level. Push the exact amount
    // actually shifted (remainder on the last line, clamped per line) so the
    // Acumatica order total still reconciles to WooCommerce to the penny.
    $shifted_total = 0.0;
    if ( $document_discount > 0 && $total_subtotal > 0 ) {
        $last = count( $rows ) - 1;
        foreach ( $rows as $i => $row ) {
            $share = ( $i === $last )
                ? round( $document_discount - $shifted_total, 2 )
                : round( $document_discount * ( $row['subtotal'] / $total_subtotal ), 2 );
            $share = max( 0.0, min( $share, $rows[ $i ]['line_disc'] ) );
            $rows[ $i ]['line_disc'] = round( $rows[ $i ]['line_disc'] - $share, 2 );
            $shifted_total += $share;
        }
        $shifted_total = round( $shifted_total, 2 );
    }

    $lines = array();
    foreach ( $rows as $row ) {
        $line = array(
            'InventoryID'   => array( 'value' => $row['sku'] ),
            'OrderQty'      => array( 'value' => $row['qty'] ),
            'UnitPrice'     => array( 'value' => (float) ( $row['subtotal'] / max( 1, $row['qty'] ) ) ),
            'ExtendedPrice' => array( 'value' => $row['subtotal'] ),
        );
        // Authoritative fulfillment warehouse from the product's ACF warehouse_code.
        // Overrides Acumatica's item-default warehouse. Omitted when unset, so those
        // lines still fall back to the Acumatica default.
        if ( ! empty( $row['warehouse'] ) ) {
            $line['WarehouseID'] = array( 'value' => $row['warehouse'] );
        }
        if ( $row['line_disc'] > 0 ) {
            $line['DiscountAmount'] = array( 'value' => $row['line_disc'] );
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

    // Order-wide (Scheme B) discount, shifted off the lines above, as a manual
    // Acumatica document discount. Uses the exact shifted total so the order
    // total reconciles to WooCommerce.
    if ( $shifted_total > 0 ) {
        $payload['DiscountDetails'] = array(
            array(
                'Type'           => array( 'value' => 'Document' ),
                'ManualDiscount' => array( 'value' => true ),
                'DiscountAmount' => array( 'value' => $shifted_total ),
            ),
        );
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

    // Free gift line(s). The gift is a $0 line item with a line discount (not a
    // coupon), so it never shows under "Coupons" above — surface it explicitly so
    // the Acumatica note records what was given away and its value. Tagged with
    // _mf_free_gift in mellow-fellow-create-order.php.
    $gift_notes = array();
    foreach ( $order->get_items() as $line_item ) {
        if ( $line_item->get_meta( '_mf_free_gift' ) ) {
            $gift_notes[] = $line_item->get_name() . ' (-$' . number_format( (float) $line_item->get_subtotal(), 2 ) . ')';
        }
    }
    if ( ! empty( $gift_notes ) ) {
        $note_parts[] = 'Free gift: ' . implode( ', ', $gift_notes );
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
                // Build URLs from the origin the admin is ACTUALLY browsing.
                // In headless WP, rest_url()/home_url() can resolve to the
                // frontend domain — sending this request cross-origin where
                // admin cookies never arrive ("cookie check failed" forever).
                // Also fetch a FRESH wp_rest nonce at click time; page-render
                // nonces go stale when the admin session changes.
                fetch(window.location.origin + '/wp-admin/admin-ajax.php?action=rest-nonce', {
                    credentials: 'same-origin'
                })
                .then(function(r){ return r.text(); })
                .then(function(freshNonce){
                    return fetch(window.location.origin + '/wp-json/mf-acu/v1/push/<?php echo (int) $oid; ?>', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: {'X-WP-Nonce': freshNonce}
                    });
                })
                .then(function(r){ return r.json().then(function(data){ return { status: r.status, data: data }; }); })
                .then(function(res){
                    var data = res.data;
                    if (data.pushed === 'yes' || data.status === 'success') {
                        msg.style.color = '#00a32a';
                        msg.textContent = 'Pushed: ' + (data.nbr || 'success');
                        msg.style.display = 'block';
                        setTimeout(function(){ location.reload(); }, 1500);
                    } else if (res.status === 401 || res.status === 403 || (data.code && data.code.indexOf('cookie') !== -1)) {
                        msg.style.color = '#d63638';
                        msg.textContent = 'Your admin session changed since this page loaded. Refresh the page and try again.';
                        msg.style.display = 'block';
                        btn.disabled = false;
                        btn.textContent = 'Push to Acumatica Now';
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

