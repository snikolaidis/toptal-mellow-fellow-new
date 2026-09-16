<?php
/**
 * Plugin Name: Mellow Fellow - Bundle Email Rows
 * Description: WooCommerce order emails otherwise list every component line
 *              of a bundle (byob/fixed/mystery alike) by its own real product
 *              name — the frontend's bundle grouping in cart/checkout/account
 *              order pages never reaches these server-rendered emails, and for
 *              a mystery bundle that also spoils its contents. This collapses
 *              every bundle's component lines into a single row showing only
 *              the bundle's own name, for customer-facing emails only — the
 *              admin "New order" notification (and the wp-admin order screen,
 *              untouched by this file) still needs the real components to
 *              pack the box.
 * Version: 1.1.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_filter( 'woocommerce_email_order_items_args', function ( $args ) {
    if ( ! empty( $args['sent_to_admin'] ) || empty( $args['items'] ) ) {
        return $args;
    }

    $items = $args['items'];
    $bundle_groups = [];

    // 'Bundle' is written for every bundle mode (byob/fixed/mystery) — see
    // mellow-fellow-create-order.php — so this covers all three, not just
    // mystery ones.
    foreach ( $items as $item_id => $item ) {
        // Forces a fresh meta read — these item objects can carry a stale,
        // pre-meta in-memory snapshot from earlier in the same request
        // (confirmed: get_meta() returns '' here without this, even though
        // the Bundle meta is already correctly saved to the DB by that point).
        $item->read_meta_data( true );
        $bundle_name = $item->get_meta( 'Bundle' );
        if ( ! $bundle_name ) continue;
        $group_key = $item->get_meta( '_bb_group_key' ) ?: ( 'bundle-name:' . $bundle_name );
        $bundle_groups[ $group_key ][] = $item_id;
    }

    if ( empty( $bundle_groups ) ) {
        return $args;
    }

    foreach ( $bundle_groups as $item_ids ) {
        $first_id   = $item_ids[0];
        $first_item = clone $items[ $first_id ];

        $bundle_name    = $first_item->get_meta( 'Bundle' ) ?: __( 'Bundle', 'woocommerce' );
        $set_count_meta = $first_item->get_meta( '_bb_group_set_count' );

        $quantity  = 0;
        $subtotal  = 0.0;
        $total     = 0.0;
        $sub_tax   = 0.0;
        $line_tax  = 0.0;
        foreach ( $item_ids as $iid ) {
            $quantity += $items[ $iid ]->get_quantity();
            $subtotal += (float) $items[ $iid ]->get_subtotal();
            $total    += (float) $items[ $iid ]->get_total();
            $sub_tax  += (float) $items[ $iid ]->get_subtotal_tax();
            $line_tax += (float) $items[ $iid ]->get_total_tax();
        }
        // The bundle's own quantity (e.g. "1 bundle"), not the summed
        // component quantity, when that meta is present.
        if ( '' !== $set_count_meta ) {
            $quantity = (int) $set_count_meta;
        }

        // Rewrite the clone in-memory only — never saved, so the real order
        // items on disk are untouched.
        $first_item->set_name( $bundle_name );
        $first_item->set_quantity( $quantity );
        $first_item->set_subtotal( $subtotal );
        $first_item->set_total( $total );
        $first_item->set_subtotal_tax( $sub_tax );
        $first_item->set_total_tax( $line_tax );
        // Zeroing the product ID stops get_product() from resolving to (and
        // showing the SKU/image of) this specific hidden component.
        $first_item->set_product_id( 0 );
        $first_item->set_variation_id( 0 );
        $first_item->add_meta_data( '_mf_bundle_email_row', '1' );

        foreach ( $item_ids as $iid ) {
            unset( $items[ $iid ] );
        }
        $items[ $first_id ] = $first_item;
    }

    $args['items'] = $items;
    return $args;
} );

// Bundle Builder's own "Part of bundle: {name}" note (class-bb-cart.php's
// woocommerce_order_item_name filter) is redundant once the row it'd attach
// to already reads "{name}" — unhook it for customer emails only.
add_action( 'woocommerce_email_before_order_table', function ( $order, $sent_to_admin ) {
    if ( $sent_to_admin || ! class_exists( 'BB_Cart' ) ) return;
    remove_filter( 'woocommerce_order_item_name', [ BB_Cart::get_instance(), 'append_bundle_parent_note_to_order_item' ], 10 );
}, 10, 2 );

add_action( 'woocommerce_email_after_order_table', function ( $order, $sent_to_admin ) {
    if ( $sent_to_admin || ! class_exists( 'BB_Cart' ) ) return;
    add_filter( 'woocommerce_order_item_name', [ BB_Cart::get_instance(), 'append_bundle_parent_note_to_order_item' ], 10, 2 );
}, 10, 2 );

// Strips every visible meta line (e.g. a component's own flavor/size
// variation) from the synthetic bundle row above — none of it belongs to
// the bundle itself, so showing it would partially unmask a component.
add_filter( 'woocommerce_order_item_get_formatted_meta_data', function ( $formatted_meta, $item ) {
    if ( $item->get_meta( '_mf_bundle_email_row' ) === '1' ) {
        return [];
    }
    return $formatted_meta;
}, 10, 2 );

// Swaps in the bundle's own image (already saved for the account order
// page's header row — see mellow-fellow-create-order.php) since the
// synthetic row's zeroed product ID leaves it with none of its own.
add_filter( 'woocommerce_order_item_thumbnail', function ( $image, $item ) {
    if ( $item->get_meta( '_mf_bundle_email_row' ) !== '1' ) {
        return $image;
    }
    $image_url = $item->get_meta( '_bb_group_image_url' );
    if ( ! $image_url ) {
        return $image;
    }
    $alt = $item->get_meta( '_bb_group_image_alt' ) ?: $item->get_name();
    return sprintf(
        '<img src="%s" alt="%s" style="width:32px;vertical-align:middle;margin-right:6px;" />',
        esc_url( $image_url ),
        esc_attr( $alt )
    );
}, 10, 2 );
