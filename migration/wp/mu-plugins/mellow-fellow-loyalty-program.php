<?php
/**
 * Plugin Name: Mellow Fellow Loyalty Program
 * Description: WPGraphQL fields for loyalty program display data (VIP tiers, earn rules, referral) via the Yotpo Loyalty API.
 * Version: 1.1.0
 */

if (!defined('ABSPATH')) {
    exit;
}

function mellow_fellow_loyalty_program_creds() {
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

function mellow_fellow_loyalty_program_get($path) {
    list($guid, $api) = mellow_fellow_loyalty_program_creds();
    if (!$api) {
        return null;
    }
    $cacheable = strpos($path, 'vip_tiers') === 0 || strpos($path, 'campaigns') === 0;
    $key = 'mf_loyalty_' . md5($path);
    if ($cacheable) {
        $cached = get_transient($key);
        if (is_array($cached)) {
            return $cached;
        }
    }
    $url = add_query_arg(array('guid' => $guid, 'api_key' => $api), 'https://loyalty.yotpo.com/api/v2/' . $path);
    $r = wp_remote_get($url, array('timeout' => 20));
    if (is_wp_error($r)) {
        return null;
    }
    $data = json_decode(wp_remote_retrieve_body($r), true);
    if ($cacheable && is_array($data)) {
        set_transient($key, $data, 10 * MINUTE_IN_SECONDS);
    }
    return $data;
}

add_action('graphql_register_types', function () {
    register_graphql_object_type('LoyaltyVipTier', array(
        'fields' => array(
            'name' => array('type' => 'String'),
            'rangeText' => array('type' => 'String'),
            'spendCents' => array('type' => 'Int'),
            'multiplier' => array('type' => 'String'),
            'isBase' => array('type' => 'Boolean'),
        ),
    ));

    register_graphql_object_type('LoyaltyEarnRule', array(
        'fields' => array(
            'title' => array('type' => 'String'),
            'rewardText' => array('type' => 'String'),
            'ctaText' => array('type' => 'String'),
        ),
    ));

    register_graphql_object_type('LoyaltyReferralInfo', array(
        'fields' => array(
            'link' => array('type' => 'String'),
            'rewardText' => array('type' => 'String'),
            'shareText' => array('type' => 'String'),
        ),
    ));

    register_graphql_object_type('LoyaltyProgramInfo', array(
        'fields' => array(
            'authenticated' => array('type' => 'Boolean'),
            'firstName' => array('type' => 'String'),
            'pointsBalance' => array('type' => 'Int'),
            'currentTier' => array('type' => 'String'),
            'totalSpentCents' => array('type' => 'Int'),
            'vipTiers' => array('type' => array('list_of' => 'LoyaltyVipTier')),
            'earnRules' => array('type' => array('list_of' => 'LoyaltyEarnRule')),
            'referral' => array('type' => 'LoyaltyReferralInfo'),
        ),
    ));

    register_graphql_field('RootQuery', 'loyaltyProgram', array(
        'type' => 'LoyaltyProgramInfo',
        'resolve' => function () {
            $tiersRaw = mellow_fellow_loyalty_program_get('vip_tiers');
            $campRaw = mellow_fellow_loyalty_program_get('campaigns');

            $tiers = array();
            if (is_array($tiersRaw)) {
                foreach ($tiersRaw as $t) {
                    if (!is_array($t)) {
                        continue;
                    }
                    $entry = isset($t['entry_threshold']) && is_array($t['entry_threshold']) ? $t['entry_threshold'] : array();
                    $tiers[] = array(
                        'name' => isset($t['name']) ? $t['name'] : '',
                        'rangeText' => isset($t['description']) ? $t['description'] : '',
                        'spendCents' => isset($entry['amount_spent_cents']) ? (int) $entry['amount_spent_cents'] : 0,
                        'multiplier' => isset($t['points_multiplier']) ? (string) $t['points_multiplier'] : '',
                        'isBase' => isset($t['type']) && $t['type'] === 'BaseTier',
                    );
                }
            }

            $rules = array();
            $seenTitles = array();
            $referral = array('link' => null, 'rewardText' => null, 'shareText' => null);
            if (is_array($campRaw)) {
                foreach ($campRaw as $c) {
                    if (!is_array($c)) {
                        continue;
                    }
                    $title = isset($c['title']) ? $c['title'] : '';
                    if (isset($c['type']) && $c['type'] === 'ReferralCampaign') {
                        $referral['rewardText'] = isset($c['reward_text']) ? $c['reward_text'] : null;
                        $referral['shareText'] = isset($c['share_text']) ? $c['share_text'] : null;
                        continue;
                    }
                    if (stripos($title, 'products to your cart') !== false || stripos($title, 'survey') !== false) {
                        continue;
                    }
                    $norm = trim(preg_replace('/\s*\(.*\)\s*$/', '', $title));
                    if ($norm === '' || isset($seenTitles[$norm])) {
                        continue;
                    }
                    $seenTitles[$norm] = true;
                    $rules[] = array(
                        'title' => $norm,
                        'rewardText' => isset($c['reward_text']) ? $c['reward_text'] : '',
                        'ctaText' => isset($c['cta_text']) ? $c['cta_text'] : '',
                    );
                }
            }

            $authenticated = false;
            $firstName = null;
            $points = 0;
            $tier = null;
            $spent = 0;

            $user = wp_get_current_user();
            if ($user && $user->ID) {
                $authenticated = true;
                $cust = mellow_fellow_loyalty_program_get('customers?customer_email=' . rawurlencode($user->user_email));
                if (is_array($cust)) {
                    $points = isset($cust['points_balance']) ? (int) $cust['points_balance'] : 0;
                    $spent = isset($cust['total_spend_cents']) ? (int) $cust['total_spend_cents'] : 0;
                    $firstName = isset($cust['first_name']) ? $cust['first_name'] : null;
                    if (isset($cust['vip_tier_name'])) {
                        $tier = $cust['vip_tier_name'];
                    } elseif (isset($cust['vip_tier']) && is_array($cust['vip_tier']) && isset($cust['vip_tier']['name'])) {
                        $tier = $cust['vip_tier']['name'];
                    }
                    if (isset($cust['perks_redeem_link'])) {
                        $referral['link'] = $cust['perks_redeem_link'];
                    } elseif (isset($cust['referral_link'])) {
                        $referral['link'] = $cust['referral_link'];
                    }
                }
            }

            return array(
                'authenticated' => $authenticated,
                'firstName' => $firstName,
                'pointsBalance' => $points,
                'currentTier' => $tier,
                'totalSpentCents' => $spent,
                'vipTiers' => $tiers,
                'earnRules' => $rules,
                'referral' => $referral,
            );
        },
    ));
});
