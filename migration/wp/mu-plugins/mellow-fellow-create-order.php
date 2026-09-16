<?php
/**
 * Plugin Name: Mellow Fellow - Create Order REST Endpoint
 * Description: Creates WooCommerce orders from explicit line items, bypassing
 *              session-based cart resolution. Used by the headless checkout to
 *              decouple order creation from any specific cart session mechanism.
 * Version: 1.0.1
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'rest_api_init', function() {
    register_rest_route( 'mf/v1', '/create-order', [
        'methods'             => 'POST',
        'callback'            => 'mf_create_order',
        'permission_callback' => 'mf_verify_faust_secret',
    ] );
} );

// Bundle Builder's own class-bb-cart.php already hides its _bb_bundle_id/
// _bb_group_key/_bb_mode/etc via this same filter — these are the meta keys
// this file writes on top of those, only ever read programmatically by the
// order-confirmation page. The "Part of bundle" admin note (also from
// class-bb-cart.php) already covers what an admin needs to see.
add_filter( 'woocommerce_hidden_order_itemmeta', function ( $hidden_keys ) {
    $hidden_keys[] = 'Bundle';
    $hidden_keys[] = '_bb_group_original_total';
    $hidden_keys[] = '_bb_group_set_count';
    $hidden_keys[] = '_bb_group_image_url';
    $hidden_keys[] = '_bb_group_image_alt';
    return $hidden_keys;
} );

function mf_verify_faust_secret( WP_REST_Request $request ) {
    if ( defined( 'FAUSTWP_SECRET_KEY' ) ) {
        $secret = FAUSTWP_SECRET_KEY;
    } else {
        $settings = get_option( 'faustwp_settings' );
        $secret = is_array( $settings ) ? ( $settings['secret_key'] ?? '' ) : '';
    }
    if ( ! $secret ) return false;

    $auth = $request->get_header( 'Authorization' );
    if ( ! $auth ) return false;

    $token = preg_replace( '/^Bearer\s+/i', '', $auth );
    return hash_equals( $secret, $token );
}

/**
 * Validates a create-order payload and independently re-confirms Real ID
 * verification. Shared by mf_create_order() and the Sezzle gateway bridge
 * (see mellow-fellow-sezzle-gateway-bridge.php), so both entry points into
 * order creation enforce the same checks.
 *
 * @return WP_REST_Response|null WP_REST_Response to return immediately on
 *                                failure, or null if the payload is valid.
 */
function mf_validate_order_payload( $body ) {
    $billing = $body['billing'] ?? [];
    $items   = $body['items']   ?? [];

    if ( empty( $items ) ) {
        return new WP_REST_Response( [
            'success' => false,
            'message' => 'No line items provided',
        ], 400 );
    }

    $billing_email = sanitize_email( $billing['email'] ?? '' );
    if ( ! $billing_email || ! is_email( $billing_email ) ) {
        return new WP_REST_Response( [
            'success' => false,
            'message' => 'A valid billing email is required',
        ], 400 );
    }

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

    return null;
}

/**
 * Builds a WC_Order from the same payload shape mf_create_order() accepts —
 * line items, addresses, shipping, coupons, bundle discount, payment method,
 * meta, and pre-computed cart totals — but stops short of finalizing payment
 * (no payment_complete(), no final save of payment status). Callers decide
 * what "done" means for their flow: mf_create_order() marks it paid
 * immediately (card, where payment is already resolved by the time this
 * runs); the Sezzle gateway bridge leaves it pending and hands it to
 * WC_Gateway_Sezzlepay::process_payment(), which completes it later via its
 * own callback once the shopper actually approves.
 *
 * Throws Exception on failure (order creation error) — callers catch and
 * build their own response shape.
 *
 * @return WC_Order
 */
function mf_build_order_from_payload( $body, $status ) {
    $billing  = $body['billing']  ?? [];
    $shipping = $body['shipping'] ?? $billing;
    $items    = $body['items']    ?? [];

    $transaction_id   = sanitize_text_field( $body['transactionId'] ?? '' );
    $payment_method   = sanitize_text_field( $body['paymentMethod'] ?? 'authorize_net' );
    $payment_method_title = sanitize_text_field( $body['paymentMethodTitle'] ?? 'Credit Card (Authorize.net)' );
    $coupon_codes     = $body['couponCodes'] ?? [];
    $shipping_lines   = $body['shippingLines'] ?? [];
    $meta_data        = $body['metaData'] ?? [];
    $customer_id      = absint( $body['customerId'] ?? 0 );
    $cart_item_totals = $body['cartItemTotals'] ?? [];
    $cart_coupons     = $body['cartCoupons'] ?? [];
    $bundle_discount_total = floatval( $body['bundleDiscountTotal'] ?? 0 );

    $order = wc_create_order( [
        'customer_id' => $customer_id,
        'status'      => $status,
    ] );

    if ( is_wp_error( $order ) ) {
        throw new Exception( $order->get_error_message() );
    }

    // Build a lookup of cart-computed totals keyed by product ID
        $cart_totals_map = [];
        foreach ( $cart_item_totals as $ct ) {
            $pid = absint( $ct['productId'] ?? 0 );
            if ( $pid ) {
                $cart_totals_map[ $pid ] = $ct;
            }
        }
        $has_cart_totals = ! empty( $cart_totals_map );

        // Add line items
        foreach ( $items as $item ) {
            $product_id   = absint( $item['productId'] ?? 0 );
            $variation_id = absint( $item['variationId'] ?? 0 );
            $quantity     = max( 1, absint( $item['quantity'] ?? 1 ) );

            $product = $variation_id
                ? wc_get_product( $variation_id )
                : wc_get_product( $product_id );

            if ( ! $product ) continue;

            $add_args = array();

            $ct = $cart_totals_map[ $product_id ] ?? null;
            if ( ! $ct && $variation_id ) {
                $ct = $cart_totals_map[ $variation_id ] ?? null;
            }
            if ( $ct && isset( $ct['lineSubtotal'] ) && isset( $ct['lineTotal'] ) ) {
                $add_args['subtotal'] = floatval( $ct['lineSubtotal'] );
                $add_args['total']    = floatval( $ct['lineTotal'] );
            } elseif ( isset( $item['unitPrice'] ) && is_numeric( $item['unitPrice'] ) ) {
                $unit_total = floatval( $item['unitPrice'] ) * $quantity;
                $add_args['subtotal'] = $unit_total;
                $add_args['total']    = $unit_total;
            }

            // Bundle discounts overwrite the product's own price (no coupon),
            // so subtotal/total above are already equal — regularUnitPrice
            // restores the gap for a correct strikethrough/discount total.
            $regular_unit_price = isset( $item['regularUnitPrice'] ) ? floatval( $item['regularUnitPrice'] ) : 0;
            if ( $regular_unit_price > 0 && isset( $add_args['total'] ) ) {
                $regular_line_total = $regular_unit_price * $quantity;
                if ( $regular_line_total > $add_args['total'] ) {
                    $add_args['subtotal'] = $regular_line_total;
                }
            }

            $item_id = $order->add_product( $product, $quantity, $add_args );

            // Tag the free-gift line so downstream systems can identify it — it's
            // a $0 line with a line discount, not a coupon, so it's otherwise
            // indistinguishable from a bundle discount. The Acumatica note builder
            // reads _mf_free_gift to record what was given away.
            if ( $item_id && ! is_wp_error( $item_id ) && ! empty( $item['isFreeGift'] ) ) {
                $gift_item = $order->get_item( $item_id );
                if ( $gift_item ) {
                    $gift_item->add_meta_data( '_mf_free_gift', 1 );
                    $gift_item->save();
                }
            }

            // Tags this line as part of a bundle — 'Bundle' and the '_bb_'
            // keys below are all hidden from the admin order screen (filter above).
            $bundle_name = sanitize_text_field( $item['bundleName'] ?? '' );
            if ( $item_id && ! is_wp_error( $item_id ) && $bundle_name ) {
                $order_item = $order->get_item( $item_id );
                if ( $order_item ) {
                    $order_item->add_meta_data( 'Bundle', $bundle_name );

                    $bundle_group_key = sanitize_text_field( $item['bundleGroupKey'] ?? '' );
                    if ( $bundle_group_key ) {
                        $order_item->add_meta_data( '_bb_group_key', $bundle_group_key );
                    }

                    // Resolves Bundle Builder's own "Part of bundle" admin note.
                    $bundle_id = intval( $item['bundleId'] ?? 0 );
                    if ( $bundle_id ) {
                        $order_item->add_meta_data( '_bb_bundle_id', $bundle_id );
                    }

                    // LineItem.bbMode masks a mystery bundle's contents.
                    $bundle_mode = sanitize_key( $item['bundleMode'] ?? '' );
                    if ( in_array( $bundle_mode, [ 'fixed', 'mystery' ], true ) ) {
                        $order_item->add_meta_data( '_bb_mode', $bundle_mode );
                    }

                    // Curated original total for "fixed"/"mystery"; absent for "byob".
                    if ( isset( $item['bundleGroupOriginalTotal'] ) && is_numeric( $item['bundleGroupOriginalTotal'] ) ) {
                        $order_item->add_meta_data( '_bb_group_original_total', floatval( $item['bundleGroupOriginalTotal'] ) );
                    }

                    // Bundle's own quantity. Also _bb_fixed_bundle_qty, which
                    // reduce_fixed_bundle_stock()/restore_fixed_bundle_stock()
                    // (class-bb-cart.php) need to touch the wrapper's stock.
                    if ( isset( $item['bundleGroupSetCount'] ) && is_numeric( $item['bundleGroupSetCount'] ) ) {
                        $set_count = intval( $item['bundleGroupSetCount'] );
                        $order_item->add_meta_data( '_bb_group_set_count', $set_count );
                        $order_item->add_meta_data( '_bb_fixed_bundle_qty', $set_count );
                    }

                    // Bundle's own image — component lines have no relation to it.
                    $bundle_image_url = esc_url_raw( $item['bundleImageUrl'] ?? '' );
                    if ( $bundle_image_url ) {
                        $order_item->add_meta_data( '_bb_group_image_url', $bundle_image_url );
                        $order_item->add_meta_data( '_bb_group_image_alt', sanitize_text_field( $item['bundleImageAlt'] ?? '' ) );
                    }

                    $order_item->save();
                }
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

        // Coupons — when cart-computed totals are available, add coupons manually
        // with their pre-calculated discount amounts. This avoids re-running coupon
        // logic that depends on cart-session hooks (BOGO, free gifts, etc.).
        $cart_coupons_map = [];
        foreach ( $cart_coupons as $cc ) {
            $cc_code = sanitize_text_field( $cc['code'] ?? '' );
            if ( $cc_code ) {
                $cart_coupons_map[ $cc_code ] = floatval( $cc['discount'] ?? 0 );
            }
        }

        foreach ( $coupon_codes as $code ) {
            $code = sanitize_text_field( $code );
            if ( ! $code ) continue;

            if ( $has_cart_totals && isset( $cart_coupons_map[ $code ] ) ) {
                $coupon_item = new WC_Order_Item_Coupon();
                $coupon_item->set_code( $code );
                $coupon_item->set_discount( $cart_coupons_map[ $code ] );
                $coupon_item->set_discount_tax( 0 );
                $order->add_item( $coupon_item );
            } else {
                $order->apply_coupon( $code );
            }
        }

        // Already baked into line totals — purely a visible "Coupon(s) used"
        // line, and lets the unattributed gap-absorption below attribute the
        // bundle's share instead of a real zero-discount coupon.
        if ( $bundle_discount_total > 0.01 ) {
            $bundle_discount_item = new WC_Order_Item_Coupon();
            $bundle_discount_item->set_code( 'Bundle Discount' );
            $bundle_discount_item->set_discount( $bundle_discount_total );
            $bundle_discount_item->set_discount_tax( 0 );
            $order->add_item( $bundle_discount_item );
        }

        // Payment details
        $order->set_payment_method( $payment_method );
        $order->set_payment_method_title( $payment_method_title );
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

        if ( $has_cart_totals ) {
            // When we have pre-computed cart totals, skip calculate_totals() because
            // it runs calculate_coupons() which re-applies coupon logic without cart
            // session context — BOGO/free-gift discounts get zeroed out and line
            // totals are overwritten back to pre-discount values.
            $items_total    = 0;
            $discount_total = 0;
            foreach ( $order->get_items() as $item ) {
                $items_total    += floatval( $item->get_total() );
                $discount_total += floatval( $item->get_subtotal() ) - floatval( $item->get_total() );
            }

            // BOGO/smart-coupon discounts may be embedded in line totals but report
            // 0 on the coupon object. Attribute any gap to zero-discount coupons so
            // the admin order view shows the correct discount value per coupon.
            $coupon_discount_sum = 0;
            foreach ( $order->get_items( 'coupon' ) as $ci ) {
                $coupon_discount_sum += floatval( $ci->get_discount() );
            }
            $unattributed = round( $discount_total - $coupon_discount_sum, 2 );
            if ( $unattributed > 0.01 ) {
                foreach ( $order->get_items( 'coupon' ) as $ci ) {
                    if ( floatval( $ci->get_discount() ) < 0.01 ) {
                        $ci->set_discount( $unattributed );
                        $ci->save();
                        break;
                    }
                }
            }

            $shipping_total = 0;
            foreach ( $order->get_items( 'shipping' ) as $ship ) {
                $shipping_total += floatval( $ship->get_total() );
            }
            $order->set_discount_total( max( 0, $discount_total ) );
            $order->set_shipping_total( $shipping_total );
            $order->set_total( $items_total + $shipping_total );
        } else {
            $order->calculate_totals();
        }

        $order->save();

        return $order;
}

function mf_create_order( WP_REST_Request $request ) {
    $body = $request->get_json_params();

    $invalid = mf_validate_order_payload( $body );
    if ( $invalid ) {
        return $invalid;
    }

    try {
        // 'pending', not 'processing' — creating it already-processing (before
        // items/totals exist) fires the processing email on an empty $0 order,
        // and payment_complete() below only transitions pending/on-hold/failed,
        // so it would silently no-op (no paid date, no payment note).
        $order = mf_build_order_from_payload( $body, 'pending' );

        $transaction_id = sanitize_text_field( $body['transactionId'] ?? '' );
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
