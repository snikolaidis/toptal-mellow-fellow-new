<?php
/* Plugin Name: Mellow Fellow Password Reset URL */

if (!defined('ABSPATH')) {
    exit;
}

function mellow_fellow_frontend_url() {
    $faust = get_option('faustwp_settings');
    if (is_array($faust) && !empty($faust['frontend_uri'])) {
        return rtrim($faust['frontend_uri'], '/');
    }
    return '';
}

add_filter('retrieve_password_message', function ($message, $key, $user_login, $user_data) {
    $frontend = mellow_fellow_frontend_url();
    if (!$frontend) {
        return $message;
    }

    $reset_url = $frontend . '/reset-password?key=' . rawurlencode($key)
        . '&login=' . rawurlencode($user_login);

    $site = wp_specialchars_decode(get_option('blogname'), ENT_QUOTES);

    $lines = array(
        'Someone requested a password reset for your ' . $site . ' account.',
        '',
        'If this was you, set a new password here:',
        $reset_url,
        '',
        'If you did not request this, you can ignore this email and your password will stay the same.',
    );

    return implode("\n", $lines) . "\n";
}, 10, 4);
