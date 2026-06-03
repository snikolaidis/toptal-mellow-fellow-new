<?php
/**
 * Plugin Name: Mellow Fellow Authorize.Net (Headless)
 * Description: No-op WooCommerce gateway used as the order container for the headless storefront. The Authorize.net charge is processed server-side by Next.js before the order is created; this gateway never charges the card.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('plugins_loaded', function () {
    if (!class_exists('WC_Payment_Gateway')) {
        return;
    }

    class MF_AuthorizeNet_Headless_Gateway extends WC_Payment_Gateway {
        public function __construct() {
            $this->id                 = 'authorize_net';
            $this->method_title       = 'Authorize.net (Headless)';
            $this->method_description = 'Server-side Authorize.net charge handled by the Next.js storefront before the order reaches WooCommerce. This gateway only records the order and never charges the card itself. Keep this as the only enabled payment method.';
            $this->has_fields         = false;
            $this->supports           = ['products'];

            $this->init_form_fields();
            $this->init_settings();

            $this->enabled = $this->get_option('enabled', 'yes');
            $this->title   = $this->get_option('title', 'Credit Card (Authorize.net)');

            add_action(
                'woocommerce_update_options_payment_gateways_' . $this->id,
                [$this, 'process_admin_options']
            );
        }

        public function init_form_fields() {
            $this->form_fields = [
                'enabled' => [
                    'title'   => 'Enable/Disable',
                    'type'    => 'checkbox',
                    'label'   => 'Enable Authorize.net (headless)',
                    'default' => 'yes',
                ],
                'title' => [
                    'title'       => 'Title',
                    'type'        => 'text',
                    'description' => 'Label shown to customers and stored on the order.',
                    'default'     => 'Credit Card (Authorize.net)',
                    'desc_tip'    => true,
                ],
            ];
        }

        public function process_payment($order_id) {
            $order = wc_get_order($order_id);

            if (!$order->is_paid()) {
                $order->payment_complete();
            }

            return [
                'result'   => 'success',
                'redirect' => $this->get_return_url($order),
            ];
        }
    }
});

add_filter('woocommerce_payment_gateways', function ($gateways) {
    $gateways[] = 'MF_AuthorizeNet_Headless_Gateway';
    return $gateways;
});
