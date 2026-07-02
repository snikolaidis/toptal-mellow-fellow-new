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

function mf_subscription_bulk_taxonomies() {
    $out = array();
    foreach (get_object_taxonomies('product') as $tx) {
        $probe = get_terms(array('taxonomy' => $tx, 'hide_empty' => true, 'number' => 1, 'fields' => 'ids'));
        if (is_wp_error($probe) || empty($probe)) {
            continue;
        }
        $obj = get_taxonomy($tx);
        $out[$tx] = $obj && isset($obj->labels->singular_name) ? $obj->labels->singular_name : $tx;
    }
    asort($out);
    return $out;
}

function mf_subscription_bulk_default_tax($taxonomies) {
    foreach ($taxonomies as $slug => $label) {
        if (strtolower($label) === 'collection' || $slug === 'collection') {
            return $slug;
        }
    }
    if (isset($taxonomies['product_cat'])) {
        return 'product_cat';
    }
    $keys = array_keys($taxonomies);
    return $keys ? $keys[0] : '';
}

function mf_subscription_bulk_terms_for($taxonomy) {
    $terms = get_terms(array('taxonomy' => $taxonomy, 'hide_empty' => true));
    if (is_wp_error($terms) || empty($terms)) {
        return array();
    }
    $out = array();
    foreach ($terms as $t) {
        if ((int) $t->count < 1) {
            continue;
        }
        $out[] = array('id' => (int) $t->term_id, 'name' => $t->name, 'count' => (int) $t->count);
    }
    return $out;
}

function mf_subscription_bulk_apply($taxonomy, $term_ids, $scheme, $remove) {
    $term_ids = array_values(array_filter(array_map('intval', (array) $term_ids)));
    if (empty($term_ids)) {
        return 0;
    }
    $q = new WP_Query(array(
        'post_type' => 'product',
        'post_status' => 'any',
        'posts_per_page' => -1,
        'fields' => 'ids',
        'no_found_rows' => true,
        'tax_query' => array(array(
            'taxonomy' => $taxonomy,
            'field' => 'term_id',
            'terms' => $term_ids,
            'operator' => 'IN',
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
                    'subscription_regular_price'   => $scheme['pricing'] === 'override' ? $scheme['price'] : '',
                    'subscription_sale_price'      => '',
                    'subscription_discount'        => $scheme['pricing'] === 'inherit' ? $scheme['discount'] : '',
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

    $taxonomies = mf_subscription_bulk_taxonomies();
    $current_tax = '';
    if (isset($_REQUEST['mf_tax'])) {
        $maybe = sanitize_key(wp_unslash($_REQUEST['mf_tax']));
        if (isset($taxonomies[$maybe])) {
            $current_tax = $maybe;
        }
    }
    if (!$current_tax) {
        $current_tax = mf_subscription_bulk_default_tax($taxonomies);
    }

    $notice = '';
    $notice_class = 'notice-success';
    if (!empty($_POST['mf_sub_bulk_nonce']) && wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['mf_sub_bulk_nonce'])), 'mf_sub_bulk')) {
        $post_tax = isset($_POST['mf_tax']) ? sanitize_key(wp_unslash($_POST['mf_tax'])) : '';
        $term_ids = isset($_POST['mf_terms']) && is_array($_POST['mf_terms']) ? array_map('intval', wp_unslash($_POST['mf_terms'])) : array();
        $remove = isset($_POST['mf_action']) && $_POST['mf_action'] === 'remove';
        $scheme = array(
            'period'   => in_array(($_POST['mf_period'] ?? 'month'), array('day', 'week', 'month', 'year'), true) ? sanitize_key($_POST['mf_period']) : 'month',
            'interval' => max(1, (int) ($_POST['mf_interval'] ?? 1)),
            'pricing'  => (($_POST['mf_pricing'] ?? 'inherit') === 'override') ? 'override' : 'inherit',
            'price'    => preg_replace('/[^0-9.]/', '', (string) ($_POST['mf_price'] ?? '')),
            'discount' => preg_replace('/[^0-9.]/', '', (string) ($_POST['mf_discount'] ?? '')),
            'force'    => isset($_POST['mf_force']) ? 'yes' : 'no',
        );
        if (isset($taxonomies[$post_tax]) && !empty($term_ids)) {
            $current_tax = $post_tax;
            $count = mf_subscription_bulk_apply($post_tax, $term_ids, $scheme, $remove);
            $notice = ($remove ? 'Removed subscription plans from ' : 'Applied subscription plan to ') . (int) $count . ' products.';
        } else {
            $notice = 'Check at least one collection first.';
            $notice_class = 'notice-warning';
        }
    }

    $terms = $current_tax ? mf_subscription_bulk_terms_for($current_tax) : array();

    echo '<div class="wrap"><h1>Subscription Bulk Plans</h1>';
    echo '<p>Apply or remove a subscribe &amp; save plan across every product in the collections you check.</p>';
    if ($notice) {
        echo '<div class="notice ' . esc_attr($notice_class) . ' is-dismissible"><p>' . esc_html($notice) . '</p></div>';
    }

    echo '<form method="get" style="margin:12px 0">';
    echo '<input type="hidden" name="page" value="mf-subscription-bulk" />';
    echo '<label for="mf_tax"><strong>Group by</strong></label> ';
    echo '<select id="mf_tax" name="mf_tax" onchange="this.form.submit()">';
    foreach ($taxonomies as $slug => $label) {
        echo '<option value="' . esc_attr($slug) . '"' . selected($slug, $current_tax, false) . '>' . esc_html($label) . '</option>';
    }
    echo '</select>';
    echo '</form>';

    echo '<form method="post">';
    wp_nonce_field('mf_sub_bulk', 'mf_sub_bulk_nonce');
    echo '<input type="hidden" name="mf_tax" value="' . esc_attr($current_tax) . '" />';

    echo '<h2 style="margin-bottom:6px">Collections</h2>';
    if (empty($terms)) {
        echo '<p>No collections with products in this group.</p>';
    } else {
        echo '<p style="margin:6px 0"><label><input type="checkbox" id="mf_select_all" /> <strong>Select all</strong></label> &nbsp; <span id="mf_sel_count" style="color:#646970"></span></p>';
        echo '<div style="max-height:340px;overflow:auto;border:1px solid #dcdcde;background:#fff;padding:10px 14px;max-width:680px">';
        echo '<div style="column-width:260px;column-gap:24px">';
        foreach ($terms as $t) {
            echo '<label style="display:block;margin:5px 0;break-inside:avoid"><input type="checkbox" class="mf_term" name="mf_terms[]" value="' . esc_attr($t['id']) . '" data-count="' . esc_attr($t['count']) . '" /> ' . esc_html($t['name']) . ' <span style="color:#646970">(' . (int) $t['count'] . ')</span></label>';
        }
        echo '</div></div>';
    }

    echo '<table class="form-table" role="presentation">';
    echo '<tr><th scope="row">Billing period</th><td><select name="mf_period">';
    foreach (array('day', 'week', 'month', 'year') as $p) {
        echo '<option value="' . esc_attr($p) . '"' . selected($p, 'month', false) . '>' . esc_html($p) . '</option>';
    }
    echo '</select> &nbsp; every <input type="number" name="mf_interval" value="1" min="1" step="1" style="width:70px" /></td></tr>';
    echo '<tr><th scope="row">Pricing</th><td>';
    echo '<label><input type="radio" name="mf_pricing" value="inherit" checked /> Product price minus <input type="number" name="mf_discount" value="15" min="0" max="100" step="1" style="width:70px" /> %</label><br />';
    echo '<label style="display:inline-block;margin-top:6px"><input type="radio" name="mf_pricing" value="override" /> Fixed price <input type="text" name="mf_price" placeholder="9.99" style="width:110px" /></label>';
    echo '</td></tr>';
    echo '<tr><th scope="row">Force subscription only</th><td><label><input type="checkbox" name="mf_force" value="1" /> Remove the one-time purchase option</label></td></tr>';
    echo '</table>';

    echo '<p class="submit"><button type="submit" class="button button-primary" name="mf_action" value="apply">Apply plan to checked collections</button> ';
    echo '<button type="submit" class="button" name="mf_action" value="remove" onclick="return confirm(\'Remove subscribe plans from all products in the checked collections?\');">Remove plans</button></p>';
    echo '</form></div>';

    echo '<script>(function(){var all=document.getElementById("mf_select_all");var boxes=[].slice.call(document.querySelectorAll(".mf_term"));var out=document.getElementById("mf_sel_count");function upd(){var n=0,c=0;boxes.forEach(function(b){if(b.checked){n++;c+=parseInt(b.getAttribute("data-count"),10)||0;}});if(out){out.textContent=n?(n+" collections checked, ~"+c+" products (before overlap)"):"";}if(all){all.checked=(n===boxes.length&&n>0);}}boxes.forEach(function(b){b.addEventListener("change",upd);});if(all){all.addEventListener("change",function(){boxes.forEach(function(b){b.checked=all.checked;});upd();});}upd();})();</script>';
}
