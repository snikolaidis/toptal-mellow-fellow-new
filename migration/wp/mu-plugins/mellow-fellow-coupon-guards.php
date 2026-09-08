<?php
/**
 * Plugin Name: Mellow Fellow - Coupon Guards
 * Description: Defensive guards for coupon data. Strips junk entries (empty
 *              strings) from coupon email restrictions — an empty string in
 *              the "Allowed emails" field activates the restriction while
 *              matching no one, silently killing the coupon (and any BOGO
 *              giveaway items attached to it) the moment checkout validates
 *              the customer's email.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_filter( 'woocommerce_coupon_get_email_restrictions', function ( $restrictions ) {
    if ( ! is_array( $restrictions ) ) {
        return $restrictions;
    }
    return array_values( array_filter( $restrictions, function ( $email ) {
        return is_string( $email ) && trim( $email ) !== '';
    } ) );
}, 10, 1 );
