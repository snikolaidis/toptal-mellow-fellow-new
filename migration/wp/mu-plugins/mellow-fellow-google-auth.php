<?php
/**
 * Plugin Name: Mellow Fellow Google Auth
 * Description: Google authentication bridge for the Mellow Fellow headless Next.js frontend.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Log a message to debug.log when WP_DEBUG_LOG is enabled.
 */
function mf_google_auth_log($message) {
    if (defined('WP_DEBUG_LOG') && WP_DEBUG_LOG) {
        error_log('[MF Google Auth] ' . $message);
    }
}

/**
 * Register REST endpoint:
 *
 * POST /wp-json/mellow-fellow/v1/google-auth
 */
add_action('rest_api_init', function () {
    register_rest_route(
        'mellow-fellow/v1',
        '/google-auth',
        [
            'methods'  => 'POST',
            'callback' => 'mf_google_auth',
			'permission_callback' => 'mf_google_auth_permission',        ]
    );
});

function mf_google_auth_permission(WP_REST_Request $request) {

    $secret = $request->get_header('X-MF-Google-Secret');

    if (
        !defined('MF_GOOGLE_AUTH_SECRET') ||
        empty(MF_GOOGLE_AUTH_SECRET)
    ) {
        mf_google_auth_log('Rejected request: MF_GOOGLE_AUTH_SECRET is not configured on this site.');

        return new WP_Error(
            'server_configuration_error',
            'Google authentication secret is not configured.',
            ['status' => 500]
        );
    }

    if (
        empty($secret) ||
        !hash_equals(MF_GOOGLE_AUTH_SECRET, $secret)
    ) {
        mf_google_auth_log('Rejected request: missing or invalid X-MF-Google-Secret header.');

        return new WP_Error(
            'forbidden',
            'Invalid authentication.',
            ['status' => 403]
        );
    }

    mf_google_auth_log('Permission check passed.');

    return true;
}

/**
 * Google authentication handler.
 */


function mf_google_auth(WP_REST_Request $request) {

    $email = sanitize_email(
        $request->get_param('email')
    );

    $first_name = sanitize_text_field(
        $request->get_param('firstName')
    );

    $last_name = sanitize_text_field(
        $request->get_param('lastName')
    );

    $google_id = sanitize_text_field(
        $request->get_param('googleId')
    );

    mf_google_auth_log("Request received for email={$email}, googleId={$google_id}.");

    if (!$email || !$google_id) {
        mf_google_auth_log('Rejected request: missing email or googleId.');

        return new WP_Error(
            'missing_data',
            'Google user information is required.',
            ['status' => 400]
        );
    }

    /*
     * Find existing WordPress user by email.
     */
    $user = get_user_by('email', $email);

    /*
     * Existing user.
     */
    if ($user) {
        mf_google_auth_log("Matched existing user ID {$user->ID} for email={$email}.");

        /*
         * Make sure this user is a WooCommerce customer
         * when WooCommerce is available.
         */
        if (function_exists('wc_update_new_customer_past_orders')) {
            // WooCommerce is active.
        }

        return new WP_REST_Response(
            [
                'success' => true,
                'existing_user' => true,
                'user' => [
                    'id' => $user->ID,
                    'email' => $user->user_email,
                    'firstName' => get_user_meta(
                        $user->ID,
                        'first_name',
                        true
                    ),
                    'lastName' => get_user_meta(
                        $user->ID,
                        'last_name',
                        true
                    ),
                ],
            ],
            200
        );
    }

    /*
     * Create a new WordPress/WooCommerce customer.
     */
    $username = sanitize_user(
        current(
            explode('@', $email)
        )
    );

    /*
     * Make username unique.
     */
    $original_username = $username;
    $counter = 1;

    while (username_exists($username)) {
        $username =
            $original_username . $counter;
        $counter++;
    }

    /*
     * Generate a strong random password.
     *
     * Google authentication is used instead of
     * asking the customer for this password.
     */
    $password = wp_generate_password(
        32,
        true,
        true
    );

    $user_id = wp_create_user(
        $username,
        $password,
        $email
    );

    if (is_wp_error($user_id)) {
        mf_google_auth_log("User creation failed for email={$email}: " . $user_id->get_error_message());

        return new WP_Error(
            'user_creation_failed',
            $user_id->get_error_message(),
            ['status' => 400]
        );
    }

    mf_google_auth_log("Created new user ID {$user_id} for email={$email}.");

    /*
     * Set customer information.
     */
    wp_update_user(
        [
            'ID' => $user_id,
            'first_name' => $first_name,
            'last_name' => $last_name,
            'display_name' => trim(
                $first_name . ' ' . $last_name
            ),
        ]
    );

    /*
     * Set WooCommerce customer role.
     */
    $user = new WP_User($user_id);

    $user->set_role('customer');

    /*
     * Store Google identity mapping.
     */
    update_user_meta(
        $user_id,
        '_mellow_fellow_google_id',
        $google_id
    );

    return new WP_REST_Response(
        [
            'success' => true,
            'existing_user' => false,
            'user' => [
                'id' => $user_id,
                'email' => $email,
                'firstName' => $first_name,
                'lastName' => $last_name,
            ],
        ],
        200
    );
}
