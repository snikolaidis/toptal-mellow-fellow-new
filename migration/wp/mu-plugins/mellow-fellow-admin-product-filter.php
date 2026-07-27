<?php
/**
 * MU Plugin: Mellow Fellow Admin Product Filter
 * Description: Adds a product-type taxonomy dropdown to the Products admin list and hides the default WooCommerce product type filter.
 * Author: Hanan Abu Kwaider
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Add `product-type` filter dropdown to WooCommerce products admin list.
 */
function mf_filter_products_by_product_type_dropdown()
{
    // Determine current post type reliably
    $post_type = '';
    if (isset($GLOBALS['typenow']) && $GLOBALS['typenow']) {
        $post_type = $GLOBALS['typenow'];
    } elseif (isset($_GET['post_type'])) {
        $post_type = sanitize_text_field($_GET['post_type']);
    } else {
        $screen = function_exists('get_current_screen') ? get_current_screen() : null;
        if ($screen && !empty($screen->post_type)) {
            $post_type = $screen->post_type;
        }
    }

    if ('product' !== $post_type) {
        return;
    }

    $taxonomy = 'product-type';
    if (!taxonomy_exists($taxonomy)) {
        return;
    }

    $selected = isset($_GET[$taxonomy]) ? sanitize_text_field($_GET[$taxonomy]) : '';
    echo '<div class="mf-product-type-filter-wrap">';
    wp_dropdown_categories(array(
        'show_option_all' => __('All product types', 'mellow-fellow'),
        'taxonomy' => $taxonomy,
        'name' => $taxonomy,
        'id' => $taxonomy,
        'orderby' => 'name',
        'selected' => $selected,
        'hierarchical' => true,
        'depth' => 1,
        'hide_empty' => false,
        'value_field' => 'slug',
    ));
    echo '</div>';
}
add_action('restrict_manage_posts', 'mf_filter_products_by_product_type_dropdown');


/**
 * Modify the admin products query to filter by selected product-type term (slug).
 */
function mf_filter_products_by_product_type_query($query)
{
    global $pagenow;

    if (!is_admin() || 'edit.php' !== $pagenow) {
        return;
    }

    $post_type = isset($_GET['post_type']) ? $_GET['post_type'] : '';
    if ('product' !== $post_type) {
        return;
    }

    if (!$query->is_main_query()) {
        return;
    }

    $taxonomy = 'product-type';
    if (!empty($_GET[$taxonomy])) {
        $term = sanitize_text_field($_GET[$taxonomy]);
        if ($term !== '0') {
            $tax_query = array(
                array(
                    'taxonomy' => $taxonomy,
                    'field' => 'slug',
                    'terms' => $term,
                ),
            );

            $query->set('tax_query', $tax_query);
        }
    }
}
add_action('pre_get_posts', 'mf_filter_products_by_product_type_query');


/**
 * Attempt to remove WooCommerce's built-in product type filter and add CSS fallback.
 */
// Provide a robust way to hide the original WooCommerce product type filter
// (the one that filters by Simple/Downloadable/etc.). We attempt to remove
// known callbacks, and fall back to CSS if removal isn't possible.
function mf_disable_wc_product_type_filter()
{
    // Only run on admin product list screen
    if (!is_admin()) {
        return;
    }

    $screen = get_current_screen();
    if (!$screen || 'edit-product' !== $screen->id) {
        return;
    }

    // Try common function names first
    remove_action('restrict_manage_posts', 'wc_product_type_dropdown');
    remove_action('restrict_manage_posts', 'woocommerce_product_type_dropdown');
    remove_action('restrict_manage_posts', 'woocommerce_product_filters');
    remove_action('restrict_manage_posts', 'wc_product_filters');
    // Also try removing other known filters like readability_filter
    remove_action('restrict_manage_posts', 'readability_filter');

}
add_action('current_screen', 'mf_disable_wc_product_type_filter', 20);
// JS fallback function defined once to avoid redeclaration errors.
function mf_remove_product_type_select_js()
{
    global $pagenow;
    $post_type = isset($_GET['post_type']) ? $_GET['post_type'] : '';
    if ('edit.php' !== $pagenow || 'product' !== $post_type) {
        return;
    }

    echo '<script>jQuery(function($){ $("select[name=\"product_type\"]").remove(); $("#filter_by_product_type").remove(); $("label[for=\"filter_by_product_type\"]").remove(); $("select[name=\"readability_filter\"]").remove(); $("#readability_filter").remove(); $("label[for=\"readability_filter\"]").remove(); });</script>';
}
add_action('admin_footer', 'mf_remove_product_type_select_js', 50);

/**
 * Make admin filters sit on one row on the Products list screen.
 */
function mf_admin_filters_inline_css()
{
    $screen = function_exists('get_current_screen') ? get_current_screen() : null;
    if (!$screen || 'edit-product' !== $screen->id) {
        return;
    }

    echo '<style>';
    echo '.wrap .tablenav .alignleft { padding-top:10px; }';
    echo '.wrap .tablenav .alignleft select, .wrap .tablenav .alignleft input, .wrap .tablenav .alignleft .mf-product-type-filter-wrap { display:inline-block !important; margin-right:10px; vertical-align:middle; }';
    echo '.wrap .tablenav .alignleft .button { display:inline-block !important; margin-right:10px; margin-top:10px; vertical-align:middle; }';
    echo '.wrap .tablenav .alignleft select, .wrap .tablenav .alignleft input { max-width:200px; }';
    echo '.mf-product-type-filter-wrap { display:inline-block; margin:0; }';
    // Ensure taxonomy-product-type column fits its content and isn't squeezed
    echo '.wp-list-table { table-layout:auto !important; }';
    echo '.wp-list-table th.column-taxonomy-product-type, .wp-list-table td.column-taxonomy-product-type, .wp-list-table th#taxonomy-product-type, .wp-list-table td#taxonomy-product-type {';
    echo ' width:auto !important; min-width:160px !important; max-width:50% !important; padding:8px 10px; white-space:normal !important; word-break:normal !important; overflow-wrap:normal !important; }';
    echo '</style>';
}
add_action('admin_head', 'mf_admin_filters_inline_css', 25);
 
