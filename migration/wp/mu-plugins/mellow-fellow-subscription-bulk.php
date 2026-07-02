<?php
/* Plugin Name: Mellow Fellow Subscription Bulk Plans */

if (!defined('ABSPATH')) {
    exit;
}

add_action('admin_menu', function () {
    add_submenu_page(
        'woocommerce',
        'Subscription Bulk Plans',
        'Subscription Bulk Plans',
        'manage_woocommerce',
        'mf-subscription-bulk',
        'mf_subscription_bulk_page'
    );
});

function mf_subscription_bulk_terms() {
    $taxes = array('product_cat');
    foreach (get_object_taxonomies('product') as $tx) {
        if (!in_array($tx, $taxes, true)) {
            $taxes[] = $tx;
        }
    }
    $grouped = array();
    foreach ($taxes as $tx) {
        $tax_obj = get_taxonomy($tx);
        $label = $tax_obj && isset($tax_obj->labels->singular_name) ? $tax_obj->labels->singular_name : $tx;
        $terms = get_terms(array('taxonomy' => $tx, 'hide_empty' => false));
        if (is_wp_error($terms) || empty($terms)) {
            continue;
        }
        $items = array();
        foreach ($terms as $t) {
            $items[] = array(
                'value' => $tx . '|' . $t->term_id,
                'label' => $t->name . ' (' . (int) $t->count . ')',
            );
        }
        $grouped[$label] = $items;
    }
    return $grouped;
}

function mf_subscription_bulk_apply($taxonomy, $term_id, $scheme, $remove) {
    $q = new WP_Query(array(
        'post_type' => 'product',
        'post_status' => 'any',
        'posts_per_page' => -1,
        'fields' => 'ids',
        'no_found_rows' => true,
        'tax_query' => array(array(
            'taxonomy' => $taxonomy,
            'field' => 'term_id',
            'terms' => (int) $term_id,
        )),
    ));

    $count = 0;
    foreach ($q->posts as $pid) {
        if ($remove) {
            delete_post_meta($pid, '_wcsatt_schemes');
            delete_post_meta($pid, '_wcsatt_force_subscription');
        } else {
            $sid = $scheme['interval'] . '_' . $scheme['period'] . '_0';
            update_post_meta($pid, '_wcsatt_schemes', array(
                $sid => array(
                    'subscription_period'          => $scheme['period'],
                    'subscription_period_interval' => (string) $scheme['interval'],
                    'subscription_length'          => '0',
                    'subscription_trial_period'    => 'day',
                    'subscription_trial_length'    => '0',
                    'subscription_pricing_method'  => $scheme['pricing'],
                    'subscription_regular_price'   => $scheme['price'],
                    'subscription_sale_price'      => '',
                    'id'                           => $sid,
                ),
            ));
            update_post_meta($pid, '_wcsatt_force_subscription', $scheme['force']);
        }
        if (function_exists('wc_delete_product_transients')) {
            wc_delete_product_transients($pid);
        }
        $count++;
    }
    return $count;
}

function mf_subscription_bulk_page() {
    if (!current_user_can('manage_woocommerce')) {
        return;
    }

    $notice = '';
    if (!empty($_POST['mf_sub_bulk_nonce']) && wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['mf_sub_bulk_nonce'])), 'mf_sub_bulk')) {
        $target = isset($_POST['mf_target']) ? sanitize_text_field(wp_unslash($_POST['mf_target'])) : '';
        $parts = explode('|', $target);
        if (count($parts) === 2) {
            $taxonomy = sanitize_key($parts[0]);
            $term_id = (int) $parts[1];
            $remove = isset($_POST['mf_action']) && $_POST['mf_action'] === 'remove';
            $scheme = array(
                'period'   => in_array(($_POST['mf_period'] ?? 'month'), array('day', 'week', 'month', 'year'), true) ? $_POST['mf_period'] : 'month',
                'interval' => max(1, (int) ($_POST['mf_interval'] ?? 1)),
                'pricing'  => (($_POST['mf_pricing'] ?? 'inherit') === 'override') ? 'override' : 'inherit',
                'price'    => preg_replace('/[^0-9.]/', '', (string) ($_POST['mf_price'] ?? '')),
                'force'    => isset($_POST['mf_force']) ? 'yes' : 'no',
            );
            if ($taxonomy && $term_id) {
                $count = mf_subscription_bulk_apply($taxonomy, $term_id, $scheme, $remove);
                $notice = ($remove ? 'Removed subscription plans from ' : 'Applied subscription plan to ') . (int) $count . ' products.';
            }
        }
    }

    $grouped = mf_subscription_bulk_terms();

    echo '<div class="wrap"><h1>Subscription Bulk Plans</h1>';
    echo '<p>Apply or remove an All Products for WooCommerce Subscriptions plan across every product in a collection, category, or any product taxonomy term.</p>';
    if ($notice) {
        echo '<div class="notice notice-success is-dismissible"><p>' . esc_html($notice) . '</p></div>';
    }
    echo '<form method="post">';
    wp_nonce_field('mf_sub_bulk', 'mf_sub_bulk_nonce');
    echo '<table class="form-table" role="presentation">';
    echo '<tr><th scope="row"><label for="mf_target">Collection / taxonomy term</label></th><td><select id="mf_target" name="mf_target" required>';
    foreach ($grouped as $group => $items) {
        echo '<optgroup label="' . esc_attr($group) . '">';
        foreach ($items as $it) {
            echo '<option value="' . esc_attr($it['value']) . '">' . esc_html($it['label']) . '</option>';
        }
        echo '</optgroup>';
    }
    echo '</select></td></tr>';
    echo '<tr><th scope="row">Billing period</th><td><select name="mf_period">';
    foreach (array('day', 'week', 'month', 'year') as $p) {
        echo '<option value="' . esc_attr($p) . '"' . selected($p, 'month', false) . '>' . esc_html($p) . '</option>';
    }
    echo '</select></td></tr>';
    echo '<tr><th scope="row">Interval</th><td><input type="number" name="mf_interval" value="1" min="1" step="1" /></td></tr>';
    echo '<tr><th scope="row">Pricing</th><td><select name="mf_pricing"><option value="inherit">Use each product price</option><option value="override">Override price</option></select> <input type="text" name="mf_price" placeholder="9.99 (override only)" /></td></tr>';
    echo '<tr><th scope="row">Force subscription only</th><td><label><input type="checkbox" name="mf_force" value="1" /> Remove the one-time purchase option</label></td></tr>';
    echo '</table>';
    echo '<p class="submit"><button type="submit" class="button button-primary" name="mf_action" value="apply">Apply plan to all products in term</button> ';
    echo '<button type="submit" class="button" name="mf_action" value="remove" onclick="return confirm(\'Remove subscription plans from all products in this term?\');">Remove plans from term</button></p>';
    echo '</form></div>';
}
