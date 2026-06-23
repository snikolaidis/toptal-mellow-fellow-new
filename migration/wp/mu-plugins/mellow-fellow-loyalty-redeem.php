<?php
/**
 * Plugin Name: Mellow Fellow Loyalty Redeem
 * Description: WPGraphQL field and mutation to fetch loyalty points and redemption options and redeem them via the Yotpo Loyalty API.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

function mellow_fellow_loyalty_redeem_creds() {
    $api = defined('YOTPO_LOYALTY_API_KEY') && YOTPO_LOYALTY_API_KEY
        ? YOTPO_LOYALTY_API_KEY
        : (getenv('YOTPO_LOYALTY_API_KEY') ?: get_option('yotpo_loyalty_api_key'));
    $guid = defined('YOTPO_LOYALTY_GUID') && YOTPO_LOYALTY_GUID
        ? YOTPO_LOYALTY_GUID
        : (getenv('YOTPO_LOYALTY_GUID') ?: get_option('yotpo_loyalty_guid'));
    if (!$guid) {
        $guid = 'AJUs08zwC9wlMRyimafHsw';
    }
    return array($guid, $api);
}

function mellow_fellow_loyalty_yotpo_get($path) {
    list($guid, $api) = mellow_fellow_loyalty_redeem_creds();
    if (!$api) {
        return null;
    }
    $url = add_query_arg(array('guid' => $guid, 'api_key' => $api), 'https://loyalty.yotpo.com/api/v2/' . $path);
    $r = wp_remote_get($url, array('timeout' => 20));
    if (is_wp_error($r)) {
        return null;
    }
    return json_decode(wp_remote_retrieve_body($r), true);
}

function mellow_fellow_loyalty_ensure_coupon($code, $data, $optionId, $email, $pointsToRedeem = 0) {
    if (!$code || !function_exists('wc_get_coupon_id_by_code') || !class_exists('WC_Coupon')) {
        return;
    }
    if (wc_get_coupon_id_by_code($code)) {
        return;
    }

    $amount = null;
    $type = 'fixed_cart';

    $opts = mellow_fellow_loyalty_yotpo_get('redemption_options');
    if (is_array($opts)) {
        foreach ($opts as $o) {
            if (isset($o['id']) && (int) $o['id'] === (int) $optionId) {
                $dt = isset($o['discount_type']) ? (string) $o['discount_type'] : '';
                $rate = isset($o['discount_rate_cents']) && is_numeric($o['discount_rate_cents']) ? (float) $o['discount_rate_cents'] : 0;
                if ($dt === 'generic_variable' && $pointsToRedeem > 0 && $rate > 0) {
                    $amount = ((float) $pointsToRedeem * $rate) / 100;
                    $type = 'fixed_cart';
                } elseif (isset($o['discount_amount_cents']) && is_numeric($o['discount_amount_cents']) && (float) $o['discount_amount_cents'] > 0) {
                    $amount = (float) $o['discount_amount_cents'] / 100;
                    $type = 'fixed_cart';
                } elseif (isset($o['discount_value_cents']) && is_numeric($o['discount_value_cents']) && (float) $o['discount_value_cents'] > 0) {
                    $amount = (float) $o['discount_value_cents'] / 100;
                    $type = 'fixed_cart';
                } elseif (isset($o['discount_percentage']) && is_numeric($o['discount_percentage'])) {
                    $amount = (float) $o['discount_percentage'];
                    $type = 'percent';
                }
                break;
            }
        }
    }

    if ($amount === null || $amount <= 0) {
        error_log('[MF loyalty] ensure_coupon could not resolve amount for option ' . $optionId . ' code=' . $code);
        return;
    }

    $coupon = new WC_Coupon();
    $coupon->set_code($code);
    $coupon->set_discount_type($type);
    $coupon->set_amount($amount);
    $coupon->set_usage_limit(1);
    $coupon->update_meta_data('_yotpo_loyalty_coupon', 1);
    $coupon->save();
}

add_action('graphql_register_types', function () {
    register_graphql_object_type('LoyaltyRedemptionOption', array(
        'fields' => array(
            'id' => array('type' => 'Int'),
            'name' => array('type' => 'String'),
            'points' => array('type' => 'Int'),
            'costText' => array('type' => 'String'),
            'isVariable' => array('type' => 'Boolean'),
            'rateCents' => array('type' => 'Int'),
        ),
    ));

    register_graphql_object_type('LoyaltyRedemptionInfo', array(
        'fields' => array(
            'authenticated' => array('type' => 'Boolean'),
            'pointsBalance' => array('type' => 'Int'),
            'options' => array('type' => array('list_of' => 'LoyaltyRedemptionOption')),
        ),
    ));

    register_graphql_field('RootQuery', 'loyaltyRedemption', array(
        'type' => 'LoyaltyRedemptionInfo',
        'resolve' => function () {
            $user = wp_get_current_user();
            if (!$user || !$user->ID) {
                return array('authenticated' => false, 'pointsBalance' => 0, 'options' => array());
            }

            $cust = mellow_fellow_loyalty_yotpo_get('customers?customer_email=' . rawurlencode($user->user_email));
            $points = is_array($cust) && isset($cust['points_balance']) ? (int) $cust['points_balance'] : 0;

            $opts = mellow_fellow_loyalty_yotpo_get('redemption_options');
            $out = array();
            if (is_array($opts)) {
                foreach ($opts as $o) {
                    $dt = isset($o['discount_type']) ? (string) $o['discount_type'] : '';
                    if (strpos($dt, 'generic') === 0) {
                        $rate = isset($o['discount_rate_cents']) && is_numeric($o['discount_rate_cents']) ? (int) $o['discount_rate_cents'] : 0;
                        $out[] = array(
                            'id' => isset($o['id']) ? (int) $o['id'] : 0,
                            'name' => isset($o['name']) ? $o['name'] : '',
                            'points' => isset($o['amount']) ? (int) $o['amount'] : 0,
                            'costText' => isset($o['cost_text']) ? $o['cost_text'] : '',
                            'isVariable' => ($dt === 'generic_variable'),
                            'rateCents' => $rate,
                        );
                    }
                }
            }

            return array('authenticated' => true, 'pointsBalance' => $points, 'options' => $out);
        },
    ));

    register_graphql_mutation('redeemLoyaltyOption', array(
        'inputFields' => array(
            'optionId' => array('type' => array('non_null' => 'Int')),
            'pointsToRedeem' => array('type' => 'Int'),
        ),
        'outputFields' => array(
            'success' => array('type' => 'Boolean'),
            'code' => array('type' => 'String'),
            'message' => array('type' => 'String'),
        ),
        'mutateAndGetPayload' => function ($input) {
            $user = wp_get_current_user();
            if (!$user || !$user->ID) {
                return array('success' => false, 'code' => null, 'message' => 'not_authenticated');
            }

            list($guid, $api) = mellow_fellow_loyalty_redeem_creds();
            if (!$api) {
                return array('success' => false, 'code' => null, 'message' => 'no_api_key');
            }

            $url = add_query_arg(array('guid' => $guid, 'api_key' => $api), 'https://loyalty.yotpo.com/api/v2/redemptions');
            $payload = array(
                'customer_email' => $user->user_email,
                'redemption_option_id' => (int) $input['optionId'],
                'delay_points_deduction' => true,
                'currency' => 'USD',
            );
            $pointsToRedeem = isset($input['pointsToRedeem']) ? (int) $input['pointsToRedeem'] : 0;
            if ($pointsToRedeem > 0) {
                $payload['points_to_redeem'] = $pointsToRedeem;
            }

            $r = wp_remote_post($url, array(
                'timeout' => 25,
                'headers' => array('Content-Type' => 'application/json'),
                'body' => wp_json_encode($payload),
            ));

            if (is_wp_error($r)) {
                return array('success' => false, 'code' => null, 'message' => $r->get_error_message());
            }

            $status = wp_remote_retrieve_response_code($r);
            $data = json_decode(wp_remote_retrieve_body($r), true);

            if ($status >= 200 && $status < 300 && is_array($data) && !empty($data['code'])) {
                mellow_fellow_loyalty_ensure_coupon((string) $data['code'], $data, (int) $input['optionId'], $user->user_email, $pointsToRedeem);
                return array('success' => true, 'code' => $data['code'], 'message' => null);
            }

            $msg = is_array($data) && isset($data['error']) ? $data['error'] : ('http_' . $status);
            return array('success' => false, 'code' => null, 'message' => $msg);
        },
    ));
});
