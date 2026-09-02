<?php
/* Plugin Name: Mellow Fellow Free Gift */

if (!defined('ABSPATH')) {
    exit;
}

// Only one free-gift coupon may ever be active. When a gift coupon is applied,
// remove any other mf-free-gift-* coupons — prevents double gift discounts when
// a stale session's coupon survives alongside a newly picked gift.
add_action('woocommerce_applied_coupon', function ($code) {
    if (strpos($code, 'mf-free-gift-') !== 0 || !function_exists('WC') || !WC()->cart) {
        return;
    }
    foreach (WC()->cart->get_applied_coupons() as $applied) {
        if ($applied !== $code && strpos($applied, 'mf-free-gift-') === 0) {
            WC()->cart->remove_coupon($applied);
        }
    }
});

add_action('rest_api_init', function () {
    register_rest_route('mellow-fellow/v1', '/free-gift', array(
        'methods' => 'POST',
        'permission_callback' => '__return_true',
        'callback' => 'mellow_fellow_free_gift',
    ));

    register_rest_route('mellow-fellow/v1', '/gift-product-ids', array(
        'methods' => 'GET',
        'permission_callback' => '__return_true',
        'callback' => function ($request) {
            $slugs_param = $request->get_param('collections');
            // is_string: this route declares no args, so collections[]=x would fatal.
            if (empty($slugs_param) || !is_string($slugs_param)) {
                return new WP_REST_Response(array('ids' => array()), 200);
            }
            $slugs = array_filter(array_map('trim', explode(',', $slugs_param)));
            if (empty($slugs) || !function_exists('mf_get_products_in_collections')) {
                return new WP_REST_Response(array('ids' => array()), 200);
            }
            $ids = mf_get_products_in_collections($slugs);
            return new WP_REST_Response(array('ids' => array_values($ids)), 200);
        },
    ));
});

function mellow_fellow_free_gift($request) {
    $product_id = (int) $request->get_param('product_id');
    if (!$product_id) {
        return new WP_REST_Response(array('error' => 'missing_product_id'), 400);
    }

    if (!function_exists('wc_get_coupon_id_by_code') || !class_exists('WC_Coupon') || !function_exists('wc_get_product')) {
        return new WP_REST_Response(array('error' => 'woo_unavailable'), 500);
    }

    $product = wc_get_product($product_id);
    if (!$product) {
        return new WP_REST_Response(array('error' => 'product_not_found'), 404);
    }

    $offers = function_exists('mf_cart_offers_get') ? mf_cart_offers_get() : array('free_gift_threshold' => 100, 'free_gift_max_price' => 10);
    $min = (float) ($offers['free_gift_threshold'] ?? 100);
    $max_price = (float) ($offers['free_gift_max_price'] ?? 10);

    $price = (float) $product->get_price();
    if ($price <= 0 || $price > $max_price) {
        return new WP_REST_Response(array('error' => 'not_eligible'), 400);
    }

    $collections_raw = $offers['free_gift_collections'] ?? '';
    $collection_slugs = !empty($collections_raw) ? array_filter(array_map('trim', explode(',', $collections_raw))) : [];
    if (!empty($collection_slugs) && function_exists('mf_get_products_in_collections')) {
        $allowed_ids = mf_get_products_in_collections($collection_slugs);
        if (!in_array($product_id, $allowed_ids)) {
            return new WP_REST_Response(array('error' => 'not_in_collection'), 400);
        }
    }

    $code = 'mf-free-gift-' . $product_id;
    $existing = wc_get_coupon_id_by_code($code);
    if ($existing) {
        return new WP_REST_Response(array('code' => $code, 'id' => $existing), 200);
    }

    $coupon = new WC_Coupon();
    $coupon->set_code($code);
    $coupon->set_discount_type('percent');
    $coupon->set_amount(100);
    $coupon->set_product_ids(array($product_id));
    $coupon->set_minimum_amount($min);
    $coupon->set_limit_usage_to_x_items(1);
    $coupon->set_individual_use(false);
    $coupon->update_meta_data('_mf_free_gift', 1);
    $id = $coupon->save();

    if (!$id) {
        return new WP_REST_Response(array('error' => 'create_failed'), 500);
    }

    return new WP_REST_Response(array('code' => $code, 'id' => $id), 200);
}
