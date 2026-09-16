<?php
/**
 * Plugin Name: Mellow Fellow - Category Product Order
 * Description: Adds an ACF "Pinned products" relationship field to product
 *              categories so an admin can drag chosen products to the top of a
 *              category page (e.g. softgels first in Clearance). The pinned
 *              products are forced ahead of everything else on the category
 *              archive, in the order set in the backend; the rest keep the
 *              store's normal sorting. Editable entirely from wp-admin.
 * Version: 1.0.0
 * Requires Plugins: advanced-custom-fields-pro, woocommerce
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'acf/init', 'mf_register_category_product_order_fields' );

function mf_register_category_product_order_fields() {
    if ( ! function_exists( 'acf_add_local_field_group' ) ) {
        return;
    }

    acf_add_local_field_group( [
        'key'      => 'group_mf_category_product_order',
        'title'    => 'Category Product Order',
        'fields'   => [
            [
                'key'           => 'field_mf_cpo_pinned_products',
                'label'         => 'Pinned products (shown first)',
                'name'          => 'mf_pinned_products',
                'type'          => 'relationship',
                'instructions'  => 'Search for products and drag them into the order you want. These appear first on this category page, before all other products. Leave empty to use the normal sorting.',
                'post_type'     => [ 'product' ],
                'filters'       => [ 'search' ],
                'elements'      => [ 'featured_image' ],
                'return_format' => 'id',
            ],
        ],
        'location' => [
            [
                [
                    'param'    => 'taxonomy',
                    'operator' => '==',
                    'value'    => 'product_cat',
                ],
            ],
        ],
    ] );
}

add_filter( 'posts_clauses', 'mf_category_product_order_clauses', 20, 2 );

function mf_category_product_order_clauses( $clauses, $query ) {
    if ( is_admin() || ! $query->is_main_query() ) {
        return $clauses;
    }

    if ( ! function_exists( 'is_tax' ) || ! is_tax( 'product_cat' ) ) {
        return $clauses;
    }

    // Respect a shopper-chosen sort (price, popularity, etc.). Only pin on the
    // default catalog ordering.
    if ( isset( $_GET['orderby'] ) ) {
        return $clauses;
    }

    if ( ! function_exists( 'get_field' ) ) {
        return $clauses;
    }

    $term = get_queried_object();
    if ( ! $term || empty( $term->term_id ) ) {
        return $clauses;
    }

    $pinned = get_field( 'mf_pinned_products', 'product_cat_' . $term->term_id );
    if ( empty( $pinned ) ) {
        return $clauses;
    }

    $ids = array_values( array_unique( array_filter( array_map( 'intval', (array) $pinned ) ) ) );
    if ( ! $ids ) {
        return $clauses;
    }

    global $wpdb;
    $idlist = implode( ',', $ids );
    $field  = "FIELD( {$wpdb->posts}.ID, {$idlist} )";
    $pinned_order = "( {$field} = 0 ), {$field}";

    $clauses['orderby'] = ! empty( $clauses['orderby'] )
        ? $pinned_order . ', ' . $clauses['orderby']
        : $pinned_order;

    return $clauses;
}
