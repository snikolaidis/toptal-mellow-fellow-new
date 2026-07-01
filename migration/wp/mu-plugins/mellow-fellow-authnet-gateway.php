<?php
/* Plugin Name: Mellow Fellow Authorize.Net (Headless) */

if (!defined('ABSPATH')) {
    exit;
}

function mellow_fellow_authnet_creds() {
    $login = defined('AUTHORIZE_API_LOGIN_ID') ? AUTHORIZE_API_LOGIN_ID : getenv('AUTHORIZE_API_LOGIN_ID');
    $key = defined('AUTHORIZE_TRANSACTION_KEY') ? AUTHORIZE_TRANSACTION_KEY : getenv('AUTHORIZE_TRANSACTION_KEY');
    $env = defined('AUTHORIZE_ENVIRONMENT') ? AUTHORIZE_ENVIRONMENT : getenv('AUTHORIZE_ENVIRONMENT');
    return array(
        'login' => $login ?: '',
        'key' => $key ?: '',
        'url' => ($env === 'production')
            ? 'https://api.authorize.net/xml/v1/request.api'
            : 'https://apitest.authorize.net/xml/v1/request.api',
    );
}

function mellow_fellow_authnet_charge_profile($profile_id, $payment_profile_id, $amount, $invoice) {
    $creds = mellow_fellow_authnet_creds();
    if (!$creds['login'] || !$creds['key'] || !$profile_id || !$payment_profile_id) {
        return new WP_Error('authnet_config', 'Authorize.net not configured or missing saved profile.');
    }

    $payload = array(
        'createTransactionRequest' => array(
            'merchantAuthentication' => array(
                'name' => $creds['login'],
                'transactionKey' => $creds['key'],
            ),
            'transactionRequest' => array(
                'transactionType' => 'authCaptureTransaction',
                'amount' => number_format((float) $amount, 2, '.', ''),
                'profile' => array(
                    'customerProfileId' => (string) $profile_id,
                    'paymentProfile' => array(
                        'paymentProfileId' => (string) $payment_profile_id,
                    ),
                ),
                'order' => array(
                    'invoiceNumber' => substr((string) $invoice, 0, 20),
                    'description' => 'Subscription renewal',
                ),
            ),
        ),
    );

    $response = wp_remote_post($creds['url'], array(
        'timeout' => 30,
        'headers' => array('Content-Type' => 'application/json'),
        'body' => wp_json_encode($payload),
    ));

    if (is_wp_error($response)) {
        return $response;
    }

    $body = json_decode(preg_replace('/^\xEF\xBB\xBF/', '', wp_remote_retrieve_body($response)), true);
    $result_code = isset($body['messages']['resultCode']) ? $body['messages']['resultCode'] : '';
    $trans = isset($body['transactionResponse']) ? $body['transactionResponse'] : array();

    if ($result_code === 'Ok' && isset($trans['responseCode']) && $trans['responseCode'] === '1') {
        return array('transId' => isset($trans['transId']) ? $trans['transId'] : '');
    }

    $msg = 'Renewal charge was declined.';
    if (!empty($trans['errors'][0]['errorText'])) {
        $msg = $trans['errors'][0]['errorText'];
    } elseif (!empty($body['messages']['message'][0]['text'])) {
        $msg = $body['messages']['message'][0]['text'];
    }
    return new WP_Error('authnet_declined', $msg);
}

add_action('plugins_loaded', function () {
    if (!class_exists('WC_Payment_Gateway')) {
        return;
    }

    class MF_AuthorizeNet_Headless_Gateway extends WC_Payment_Gateway {
        public function __construct() {
            $this->id                 = 'authorize_net';
            $this->method_title       = 'Authorize.net (Headless)';
            $this->method_description = 'One-time orders are charged in the Next.js storefront before the order is created. Subscription renewals are charged here using the saved Authorize.net customer profile.';
            $this->has_fields         = false;
            $this->supports           = array(
                'products',
                'subscriptions',
                'subscription_cancellation',
                'subscription_suspension',
                'subscription_reactivation',
                'subscription_amount_changes',
                'subscription_date_changes',
                'multiple_subscriptions',
            );

            $this->init_form_fields();
            $this->init_settings();

            $this->enabled = $this->get_option('enabled', 'yes');
            $this->title   = $this->get_option('title', 'Credit Card (Authorize.net)');

            add_action(
                'woocommerce_update_options_payment_gateways_' . $this->id,
                array($this, 'process_admin_options')
            );
            add_action(
                'woocommerce_scheduled_subscription_payment_' . $this->id,
                array($this, 'process_scheduled_subscription_payment'),
                10,
                2
            );
        }

        public function init_form_fields() {
            $this->form_fields = array(
                'enabled' => array(
                    'title'   => 'Enable/Disable',
                    'type'    => 'checkbox',
                    'label'   => 'Enable Authorize.net (headless)',
                    'default' => 'yes',
                ),
                'title' => array(
                    'title'       => 'Title',
                    'type'        => 'text',
                    'description' => 'Label shown to customers and stored on the order.',
                    'default'     => 'Credit Card (Authorize.net)',
                    'desc_tip'    => true,
                ),
            );
        }

        public function process_payment($order_id) {
            $order = wc_get_order($order_id);

            if (!$order->is_paid()) {
                $order->payment_complete();
            }

            return array(
                'result'   => 'success',
                'redirect' => $this->get_return_url($order),
            );
        }

        public function process_scheduled_subscription_payment($amount_to_charge, $renewal_order) {
            $profile_id = '';
            $payment_profile_id = '';

            if (function_exists('wcs_get_subscriptions_for_renewal_order')) {
                $subs = wcs_get_subscriptions_for_renewal_order($renewal_order);
                foreach ($subs as $sub) {
                    $profile_id = $sub->get_meta('_authnet_customer_profile_id');
                    $payment_profile_id = $sub->get_meta('_authnet_payment_profile_id');
                    if ($profile_id && $payment_profile_id) {
                        break;
                    }
                }
            }

            if (!$profile_id || !$payment_profile_id) {
                $profile_id = $renewal_order->get_meta('_authnet_customer_profile_id');
                $payment_profile_id = $renewal_order->get_meta('_authnet_payment_profile_id');
            }

            $result = mellow_fellow_authnet_charge_profile(
                $profile_id,
                $payment_profile_id,
                $amount_to_charge,
                $renewal_order->get_order_number()
            );

            if (is_wp_error($result)) {
                $renewal_order->update_status('failed', 'Authorize.net renewal failed: ' . $result->get_error_message());
                return;
            }

            $trans_id = isset($result['transId']) ? $result['transId'] : '';
            if ($trans_id) {
                $renewal_order->set_transaction_id($trans_id);
            }
            $renewal_order->payment_complete($trans_id);
            $renewal_order->add_order_note('Authorize.net renewal charged (transaction ' . $trans_id . ').');
        }
    }
});

add_filter('woocommerce_payment_gateways', function ($gateways) {
    $gateways[] = 'MF_AuthorizeNet_Headless_Gateway';
    return $gateways;
});
