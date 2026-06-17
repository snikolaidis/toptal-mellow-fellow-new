<?php
/**
 * Plugin Name: Mellow Fellow Loyalty Identity
 * Description: Exposes a secure Yotpo Loyalty customer identification token for the logged-in user via WPGraphQL.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('graphql_register_types', function () {
    register_graphql_object_type('LoyaltyIdentity', [
        'description' => 'Yotpo Loyalty secure customer identification for the current user',
        'fields' => [
            'authenticated' => ['type' => 'Boolean'],
            'email' => ['type' => 'String'],
            'id' => ['type' => 'String'],
            'token' => ['type' => 'String'],
            'tags' => ['type' => 'String'],
        ],
    ]);

    register_graphql_field('RootQuery', 'loyaltyIdentity', [
        'type' => 'LoyaltyIdentity',
        'description' => 'Secure Yotpo Loyalty identity for the currently authenticated user',
        'resolve' => function () {
            $user = wp_get_current_user();

            if (!$user || !$user->ID) {
                return [
                    'authenticated' => false,
                    'email' => null,
                    'id' => null,
                    'token' => null,
                    'tags' => '[]',
                ];
            }

            $api_key = defined('YOTPO_LOYALTY_API_KEY') ? YOTPO_LOYALTY_API_KEY : getenv('YOTPO_LOYALTY_API_KEY');
            if (!$api_key) {
                $api_key = get_option('yotpo_loyalty_api_key');
            }
            $email = $user->user_email;

            $token = $api_key ? hash('sha256', $email . $api_key) : null;

            return [
                'authenticated' => true,
                'email' => $email,
                'id' => (string) $user->ID,
                'token' => $token,
                'tags' => '[]',
            ];
        },
    ]);
});
