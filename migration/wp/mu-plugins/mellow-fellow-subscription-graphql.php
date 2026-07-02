<?php
/* Plugin Name: Mellow Fellow Subscription GraphQL */

if (!defined('ABSPATH')) {
    exit;
}

function mellow_fellow_subscription_product_id($source) {
    if (is_object($source)) {
        if (!empty($source->ID)) {
            return (int) $source->ID;
        }
        if (!empty($source->databaseId)) {
            return (int) $source->databaseId;
        }
        if (method_exists($source, 'get_id')) {
            return (int) $source->get_id();
        }
    }
    return 0;
}

function mellow_fellow_subscription_schemes_from_meta($product_id) {
    $schemes = get_post_meta($product_id, '_wcsatt_schemes', true);
    if (!is_array($schemes) || empty($schemes)) {
        return array();
    }
    $out = array();
    foreach ($schemes as $s) {
        if (!is_array($s)) {
            continue;
        }
        $out[] = array(
            'id' => isset($s['id']) ? (string) $s['id'] : '',
            'period' => isset($s['subscription_period']) ? (string) $s['subscription_period'] : '',
            'interval' => isset($s['subscription_period_interval']) ? (int) $s['subscription_period_interval'] : 1,
            'length' => isset($s['subscription_length']) ? (int) $s['subscription_length'] : 0,
            'trialPeriod' => isset($s['subscription_trial_period']) ? (string) $s['subscription_trial_period'] : '',
            'trialLength' => isset($s['subscription_trial_length']) ? (int) $s['subscription_trial_length'] : 0,
            'pricingMethod' => isset($s['subscription_pricing_method']) ? (string) $s['subscription_pricing_method'] : '',
            'regularPrice' => isset($s['subscription_regular_price']) ? (string) $s['subscription_regular_price'] : '',
            'salePrice' => isset($s['subscription_sale_price']) ? (string) $s['subscription_sale_price'] : '',
        );
    }
    return $out;
}

function mellow_fellow_subscription_schemes($product_id) {
    $out = mellow_fellow_subscription_schemes_from_meta($product_id);
    if (!empty($out)) {
        return $out;
    }
    if (class_exists('WCS_ATT_Product_Schemes') && function_exists('wc_get_product')
        && method_exists('WCS_ATT_Product_Schemes', 'get_product_subscription_schemes')) {
        try {
            $product = wc_get_product($product_id);
            if ($product) {
                $resolved = WCS_ATT_Product_Schemes::get_product_subscription_schemes($product);
                if (is_array($resolved)) {
                    foreach ($resolved as $scheme) {
                        if (is_object($scheme) && method_exists($scheme, 'get_period') && method_exists($scheme, 'get_interval')) {
                            $out[] = array(
                                'id' => method_exists($scheme, 'get_key') ? (string) $scheme->get_key() : '',
                                'period' => (string) $scheme->get_period(),
                                'interval' => (int) $scheme->get_interval(),
                                'length' => method_exists($scheme, 'get_length') ? (int) $scheme->get_length() : 0,
                                'trialPeriod' => method_exists($scheme, 'get_trial_period') ? (string) $scheme->get_trial_period() : '',
                                'trialLength' => method_exists($scheme, 'get_trial_length') ? (int) $scheme->get_trial_length() : 0,
                                'pricingMethod' => method_exists($scheme, 'get_pricing_mode') ? (string) $scheme->get_pricing_mode() : '',
                                'regularPrice' => '',
                                'salePrice' => '',
                            );
                        }
                    }
                }
            }
        } catch (\Throwable $e) {
            return array();
        }
    }
    return $out;
}

add_action('graphql_register_types', function () {
    register_graphql_object_type('MFSubscriptionScheme', array(
        'description' => 'A subscription plan attached to a product via All Products for WooCommerce Subscriptions.',
        'fields' => array(
            'id' => array('type' => 'String'),
            'period' => array('type' => 'String'),
            'interval' => array('type' => 'Int'),
            'length' => array('type' => 'Int'),
            'trialPeriod' => array('type' => 'String'),
            'trialLength' => array('type' => 'Int'),
            'pricingMethod' => array('type' => 'String'),
            'regularPrice' => array('type' => 'String'),
            'salePrice' => array('type' => 'String'),
        ),
    ));

    register_graphql_field('Product', 'subscriptionSchemes', array(
        'type' => array('list_of' => 'MFSubscriptionScheme'),
        'description' => 'Subscription plans available for this product.',
        'resolve' => function ($source) {
            $id = mellow_fellow_subscription_product_id($source);
            return $id ? mellow_fellow_subscription_schemes($id) : array();
        },
    ));

    register_graphql_field('Product', 'hasSubscriptionPlans', array(
        'type' => 'Boolean',
        'description' => 'Whether this product offers any subscription plan.',
        'resolve' => function ($source) {
            $id = mellow_fellow_subscription_product_id($source);
            return $id ? !empty(mellow_fellow_subscription_schemes($id)) : false;
        },
    ));

    register_graphql_field('Product', 'forceSubscription', array(
        'type' => 'Boolean',
        'description' => 'Whether this product can only be purchased as a subscription (no one-time purchase).',
        'resolve' => function ($source) {
            $id = mellow_fellow_subscription_product_id($source);
            return $id ? (get_post_meta($id, '_wcsatt_force_subscription', true) === 'yes') : false;
        },
    ));
});
