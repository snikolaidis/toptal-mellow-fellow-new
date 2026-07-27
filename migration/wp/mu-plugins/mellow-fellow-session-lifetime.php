<?php
/* Plugin Name: Mellow Fellow Session Lifetime */

if (!defined('ABSPATH')) {
    exit;
}

// Extend WooCommerce session expiration from 48 hours to 7 days,
// matching the wc_cart_token cookie lifetime set by the headless proxy.
add_filter('wc_session_expiration', function () {
    return 7 * DAY_IN_SECONDS;
});
