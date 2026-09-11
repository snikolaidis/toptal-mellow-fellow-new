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

if (!defined('MF_SUBS_META')) {
    define('MF_SUBS_META', '_wcsatt_schemes');
    define('MF_SUBS_FORCE_META', '_wcsatt_force_subscription');
    define('MF_SUBS_PER_PAGE', 50);
}

function mf_subs_scheme_entry($period, $interval, $discount, $price) {
    $period   = in_array($period, array('day', 'week', 'month', 'year'), true) ? $period : 'month';
    $interval = max(1, (int) $interval);
    $override = $price !== '' && $price !== null;
    $id       = $interval . '_' . $period . '_0';
    return array($id => array(
        'subscription_period'          => $period,
        'subscription_period_interval' => (string) $interval,
        'subscription_length'          => '0',
        'subscription_trial_period'    => 'day',
        'subscription_trial_length'    => '0',
        'subscription_pricing_method'  => $override ? 'override' : 'inherit',
        'subscription_regular_price'   => $override ? (string) (float) $price : '',
        'subscription_sale_price'      => '',
        'subscription_discount'        => $override ? '' : (string) (float) $discount,
        'id'                           => $id,
    ));
}

// Resolve many slugs to product ids in one query so a large CSV stays fast.
function mf_subs_ids_by_slug(array $slugs) {
    global $wpdb;
    $slugs = array_values(array_unique(array_filter(array_map('sanitize_title', $slugs))));
    if (empty($slugs)) {
        return array();
    }
    $placeholders = implode(',', array_fill(0, count($slugs), '%s'));
    $sql = $wpdb->prepare(
        "SELECT post_name, ID FROM {$wpdb->posts} " .
        "WHERE post_type = 'product' AND post_status IN ('publish','draft','pending','private') " .
        "AND post_name IN ($placeholders) ORDER BY (post_status = 'publish') DESC",
        $slugs
    );
    $out = array();
    foreach ($wpdb->get_results($sql) as $row) {
        if (!isset($out[$row->post_name])) {
            $out[$row->post_name] = (int) $row->ID;
        }
    }
    return $out;
}

// Resolve many SKUs to product ids in one query. A SKU on a variation maps to
// its parent product, since the subscribe plan lives on the parent.
function mf_subs_ids_by_sku(array $skus) {
    global $wpdb;
    $skus = array_values(array_unique(array_filter(array_map('trim', $skus), 'strlen')));
    if (empty($skus)) {
        return array();
    }
    $placeholders = implode(',', array_fill(0, count($skus), '%s'));
    $sql = $wpdb->prepare(
        "SELECT pm.meta_value AS sku, " .
        "CASE WHEN p.post_type = 'product_variation' THEN p.post_parent ELSE p.ID END AS pid " .
        "FROM {$wpdb->postmeta} pm " .
        "JOIN {$wpdb->posts} p ON p.ID = pm.post_id " .
        "WHERE pm.meta_key = '_sku' AND pm.meta_value IN ($placeholders) " .
        "AND p.post_type IN ('product','product_variation') " .
        "AND p.post_status IN ('publish','draft','pending','private') " .
        "ORDER BY (p.post_status = 'publish') DESC, (p.post_type = 'product') DESC",
        $skus
    );
    $out = array();
    foreach ($wpdb->get_results($sql) as $row) {
        if (!isset($out[$row->sku]) && (int) $row->pid > 0) {
            $out[$row->sku] = (int) $row->pid;
        }
    }
    return $out;
}

// Columns (case-insensitive): sku (primary key), slug (fallback when no sku),
// period, interval, discount, price (optional fixed price), remove (yes/1 clears).
function mf_subs_parse_csv($path) {
    $fh = fopen($path, 'r');
    if (!$fh) {
        return new WP_Error('mf_subs_csv', 'Could not open the uploaded file.');
    }
    $header = fgetcsv($fh);
    if (!$header) {
        fclose($fh);
        return new WP_Error('mf_subs_csv', 'The file is empty.');
    }
    $cols = array();
    foreach ($header as $i => $name) {
        $cols[strtolower(trim($name))] = $i;
    }
    if (!isset($cols['sku']) && !isset($cols['slug'])) {
        fclose($fh);
        return new WP_Error('mf_subs_csv', 'The file needs a "sku" column (a "slug" column also works).');
    }
    $get = function ($row, $key) use ($cols) {
        return isset($cols[$key], $row[$cols[$key]]) ? trim($row[$cols[$key]]) : '';
    };
    $applySku = array();
    $applySlug = array();
    $removeSku = array();
    $removeSlug = array();
    while (($row = fgetcsv($fh)) !== false) {
        $sku  = $get($row, 'sku');
        $slug = sanitize_title($get($row, 'slug'));
        $useSku = $sku !== '';
        if (!$useSku && $slug === '') {
            continue;
        }
        $remove = strtolower($get($row, 'remove'));
        if ($remove === 'yes' || $remove === '1' || $remove === 'true') {
            if ($useSku) {
                $removeSku[$sku] = true;
            } else {
                $removeSlug[$slug] = true;
            }
            continue;
        }
        $entry = mf_subs_scheme_entry(
            strtolower($get($row, 'period')) ?: 'month',
            $get($row, 'interval') ?: 1,
            preg_replace('/[^0-9.]/', '', $get($row, 'discount')),
            preg_replace('/[^0-9.]/', '', $get($row, 'price'))
        );
        if ($useSku) {
            if (!isset($applySku[$sku])) {
                $applySku[$sku] = array();
            }
            $applySku[$sku] = array_merge($applySku[$sku], $entry);
        } else {
            if (!isset($applySlug[$slug])) {
                $applySlug[$slug] = array();
            }
            $applySlug[$slug] = array_merge($applySlug[$slug], $entry);
        }
    }
    fclose($fh);
    return array(
        'apply_sku'   => $applySku,
        'apply_slug'  => $applySlug,
        'remove_sku'  => $removeSku,
        'remove_slug' => $removeSlug,
    );
}

function mf_subs_apply_csv($path) {
    $parsed = mf_subs_parse_csv($path);
    if (is_wp_error($parsed)) {
        return $parsed;
    }
    @set_time_limit(0);
    $idsBySku  = mf_subs_ids_by_sku(array_merge(array_keys($parsed['apply_sku']), array_keys($parsed['remove_sku'])));
    $idsBySlug = mf_subs_ids_by_slug(array_merge(array_keys($parsed['apply_slug']), array_keys($parsed['remove_slug'])));
    $applied = 0;
    $cleared = 0;
    $missing = array();

    $apply_to = function ($pid, $schemes) {
        update_post_meta($pid, MF_SUBS_META, $schemes);
        update_post_meta($pid, MF_SUBS_FORCE_META, 'no');
        if (function_exists('wc_delete_product_transients')) {
            wc_delete_product_transients($pid);
        }
    };
    $clear_from = function ($pid) {
        delete_post_meta($pid, MF_SUBS_META);
        delete_post_meta($pid, MF_SUBS_FORCE_META);
        if (function_exists('wc_delete_product_transients')) {
            wc_delete_product_transients($pid);
        }
    };

    foreach ($parsed['apply_sku'] as $sku => $schemes) {
        if (!isset($idsBySku[$sku])) {
            $missing[] = $sku;
            continue;
        }
        $apply_to($idsBySku[$sku], $schemes);
        $applied++;
    }
    foreach ($parsed['apply_slug'] as $slug => $schemes) {
        if (!isset($idsBySlug[$slug])) {
            $missing[] = $slug;
            continue;
        }
        $apply_to($idsBySlug[$slug], $schemes);
        $applied++;
    }
    foreach (array_keys($parsed['remove_sku']) as $sku) {
        if (!isset($idsBySku[$sku])) {
            $missing[] = $sku;
            continue;
        }
        $clear_from($idsBySku[$sku]);
        $cleared++;
    }
    foreach (array_keys($parsed['remove_slug']) as $slug) {
        if (!isset($idsBySlug[$slug])) {
            $missing[] = $slug;
            continue;
        }
        $clear_from($idsBySlug[$slug]);
        $cleared++;
    }
    return array('applied' => $applied, 'cleared' => $cleared, 'missing' => $missing);
}

function mf_subs_counts() {
    global $wpdb;
    $total = (int) $wpdb->get_var(
        "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'product' AND post_status = 'publish'"
    );
    $active = (int) $wpdb->get_var(
        "SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p " .
        "JOIN {$wpdb->postmeta} pm ON pm.post_id = p.ID AND pm.meta_key = '" . MF_SUBS_META . "' " .
        "WHERE p.post_type = 'product' AND p.post_status = 'publish' AND pm.meta_value != '' AND pm.meta_value != 'a:0:{}'"
    );
    return array('total' => $total, 'active' => $active, 'inactive' => max(0, $total - $active));
}

function mf_subs_list($active, $page) {
    global $wpdb;
    $offset = max(0, ($page - 1) * MF_SUBS_PER_PAGE);
    if ($active) {
        $sql = $wpdb->prepare(
            "SELECT p.ID, p.post_title, p.post_name, sku.meta_value AS sku, pm.meta_value AS schemes " .
            "FROM {$wpdb->posts} p " .
            "JOIN {$wpdb->postmeta} pm ON pm.post_id = p.ID AND pm.meta_key = '" . MF_SUBS_META . "' " .
            "LEFT JOIN {$wpdb->postmeta} sku ON sku.post_id = p.ID AND sku.meta_key = '_sku' " .
            "WHERE p.post_type = 'product' AND p.post_status = 'publish' AND pm.meta_value != '' AND pm.meta_value != 'a:0:{}' " .
            "ORDER BY p.post_title ASC LIMIT %d OFFSET %d",
            MF_SUBS_PER_PAGE,
            $offset
        );
    } else {
        $sql = $wpdb->prepare(
            "SELECT p.ID, p.post_title, p.post_name, sku.meta_value AS sku, '' AS schemes " .
            "FROM {$wpdb->posts} p " .
            "LEFT JOIN {$wpdb->postmeta} pm ON pm.post_id = p.ID AND pm.meta_key = '" . MF_SUBS_META . "' " .
            "LEFT JOIN {$wpdb->postmeta} sku ON sku.post_id = p.ID AND sku.meta_key = '_sku' " .
            "WHERE p.post_type = 'product' AND p.post_status = 'publish' " .
            "AND (pm.meta_id IS NULL OR pm.meta_value = '' OR pm.meta_value = 'a:0:{}') " .
            "ORDER BY p.post_title ASC LIMIT %d OFFSET %d",
            MF_SUBS_PER_PAGE,
            $offset
        );
    }
    return $wpdb->get_results($sql);
}

function mf_subs_tiers_label($serialized) {
    $schemes = maybe_unserialize($serialized);
    if (!is_array($schemes) || empty($schemes)) {
        return '';
    }
    $parts = array();
    foreach ($schemes as $s) {
        if (!is_array($s)) {
            continue;
        }
        $interval = isset($s['subscription_period_interval']) ? (int) $s['subscription_period_interval'] : 1;
        $period   = isset($s['subscription_period']) ? $s['subscription_period'] : 'month';
        $every    = $interval > 1 ? "every {$interval} {$period}s" : "every {$period}";
        if (isset($s['subscription_pricing_method']) && $s['subscription_pricing_method'] === 'override') {
            $parts[] = $every . ' at $' . $s['subscription_regular_price'];
        } else {
            $disc = isset($s['subscription_discount']) && $s['subscription_discount'] !== '' ? (string) (float) $s['subscription_discount'] : '';
            $parts[] = $every . ($disc !== '' ? " ({$disc}% off)" : '');
        }
    }
    return implode(', ', $parts);
}

function mf_subs_export_csv() {
    global $wpdb;
    $rows = $wpdb->get_results(
        "SELECT p.post_name, p.post_title, sku.meta_value AS sku, pm.meta_value AS schemes " .
        "FROM {$wpdb->posts} p " .
        "JOIN {$wpdb->postmeta} pm ON pm.post_id = p.ID AND pm.meta_key = '" . MF_SUBS_META . "' " .
        "LEFT JOIN {$wpdb->postmeta} sku ON sku.post_id = p.ID AND sku.meta_key = '_sku' " .
        "WHERE p.post_type = 'product' AND p.post_status = 'publish' AND pm.meta_value != '' AND pm.meta_value != 'a:0:{}' " .
        "ORDER BY p.post_title ASC"
    );
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename=subscription-plans.csv');
    $out = fopen('php://output', 'w');
    fputcsv($out, array('sku', 'name', 'slug', 'period', 'interval', 'discount', 'price'));
    foreach ($rows as $row) {
        $schemes = maybe_unserialize($row->schemes);
        if (!is_array($schemes)) {
            continue;
        }
        foreach ($schemes as $s) {
            if (!is_array($s)) {
                continue;
            }
            $override = isset($s['subscription_pricing_method']) && $s['subscription_pricing_method'] === 'override';
            fputcsv($out, array(
                $row->sku,
                $row->post_title,
                $row->post_name,
                isset($s['subscription_period']) ? $s['subscription_period'] : 'month',
                isset($s['subscription_period_interval']) ? $s['subscription_period_interval'] : 1,
                $override ? '' : (isset($s['subscription_discount']) ? $s['subscription_discount'] : ''),
                $override ? $s['subscription_regular_price'] : '',
            ));
        }
    }
    fclose($out);
    exit;
}

add_action('admin_init', function () {
    if (
        isset($_GET['page'], $_GET['mf_subs_export']) &&
        $_GET['page'] === 'mf-subscription-bulk' &&
        current_user_can('manage_woocommerce') &&
        check_admin_referer('mf_subs_export')
    ) {
        mf_subs_export_csv();
    }
});

// CSV import + status view. Rendered at the top of the bulk-plans admin page;
// admin-only, so it never runs on the storefront.
function mf_subs_render_csv_section() {
    $notice = '';
    $notice_class = 'notice-success';
    if (
        !empty($_POST['mf_subs_nonce']) &&
        wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['mf_subs_nonce'])), 'mf_subs_import') &&
        !empty($_FILES['mf_subs_csv']['tmp_name']) &&
        is_uploaded_file($_FILES['mf_subs_csv']['tmp_name'])
    ) {
        $result = mf_subs_apply_csv($_FILES['mf_subs_csv']['tmp_name']);
        if (is_wp_error($result)) {
            $notice = $result->get_error_message();
            $notice_class = 'notice-error';
        } else {
            $notice = sprintf(
                'Applied plans to %d products%s. %d rows had no matching slug.',
                (int) $result['applied'],
                $result['cleared'] ? sprintf(', cleared %d', (int) $result['cleared']) : '',
                count($result['missing'])
            );
            if (!empty($result['missing'])) {
                $notice .= ' Unmatched: ' . esc_html(implode(', ', array_slice($result['missing'], 0, 30)));
            }
        }
    }

    $counts  = mf_subs_counts();
    $view    = (isset($_GET['view']) && $_GET['view'] === 'inactive') ? 'inactive' : 'active';
    $page_no = isset($_GET['pnum']) ? max(1, (int) $_GET['pnum']) : 1;
    $list    = mf_subs_list($view === 'active', $page_no);
    $base    = admin_url('admin.php?page=mf-subscription-bulk');

    echo '<hr /><h2>Import plans from CSV</h2>';
    echo '<p>Set Subscribe &amp; Save plans by SKU. Columns: <code>sku</code> (required, the product SKU), <code>period</code> (day/week/month/year), <code>interval</code>, <code>discount</code> (percent off), optional <code>price</code> (fixed price instead of a discount), optional <code>remove</code> (yes to clear). A <code>slug</code> column is accepted as a fallback when a row has no SKU. One row per plan; a product can have several rows for multiple frequencies.</p>';

    if ($notice) {
        echo '<div class="notice ' . esc_attr($notice_class) . ' is-dismissible"><p>' . wp_kses_post($notice) . '</p></div>';
    }

    echo '<div style="display:flex;gap:16px;margin:12px 0">';
    echo '<div style="background:#fff;border:1px solid #dcdcde;padding:10px 16px"><strong style="font-size:20px">' . (int) $counts['active'] . '</strong><br />with a plan</div>';
    echo '<div style="background:#fff;border:1px solid #dcdcde;padding:10px 16px"><strong style="font-size:20px">' . (int) $counts['inactive'] . '</strong><br />no plan yet</div>';
    echo '<div style="background:#fff;border:1px solid #dcdcde;padding:10px 16px"><strong style="font-size:20px">' . (int) $counts['total'] . '</strong><br />products total</div>';
    echo '</div>';

    echo '<form method="post" enctype="multipart/form-data" style="margin-bottom:8px">';
    wp_nonce_field('mf_subs_import', 'mf_subs_nonce');
    echo '<input type="file" name="mf_subs_csv" accept=".csv" required /> ';
    echo '<button type="submit" class="button button-primary">Upload and apply</button>';
    echo '</form>';
    echo '<p><a class="button" href="' . esc_url(wp_nonce_url($base . '&mf_subs_export=1', 'mf_subs_export')) . '">Download current plans as CSV</a></p>';

    echo '<h3 style="margin-top:20px">Products</h3>';
    echo '<p>';
    echo '<a href="' . esc_url($base . '&view=active') . '"' . ($view === 'active' ? ' style="font-weight:700"' : '') . '>With a plan (' . (int) $counts['active'] . ')</a> &nbsp;|&nbsp; ';
    echo '<a href="' . esc_url($base . '&view=inactive') . '"' . ($view === 'inactive' ? ' style="font-weight:700"' : '') . '>No plan (' . (int) $counts['inactive'] . ')</a>';
    echo '</p>';

    echo '<table class="wp-list-table widefat fixed striped"><thead><tr><th>Product</th><th>SKU</th><th>Slug</th><th>Plan</th></tr></thead><tbody>';
    if (empty($list)) {
        echo '<tr><td colspan="4">No products.</td></tr>';
    } else {
        foreach ($list as $row) {
            echo '<tr>';
            echo '<td><a href="' . esc_url(get_edit_post_link($row->ID)) . '">' . esc_html($row->post_title) . '</a></td>';
            echo '<td><code>' . esc_html($row->sku) . '</code></td>';
            echo '<td><code>' . esc_html($row->post_name) . '</code></td>';
            echo '<td>' . esc_html($view === 'active' ? mf_subs_tiers_label($row->schemes) : 'not active') . '</td>';
            echo '</tr>';
        }
    }
    echo '</tbody></table>';

    $count_for_view = $view === 'active' ? $counts['active'] : $counts['inactive'];
    $pages = (int) ceil($count_for_view / MF_SUBS_PER_PAGE);
    if ($pages > 1) {
        echo '<p style="margin-top:12px">Page ' . (int) $page_no . ' of ' . $pages . ' &nbsp; ';
        if ($page_no > 1) {
            echo '<a class="button" href="' . esc_url($base . '&view=' . $view . '&pnum=' . ($page_no - 1)) . '">Prev</a> ';
        }
        if ($page_no < $pages) {
            echo '<a class="button" href="' . esc_url($base . '&view=' . $view . '&pnum=' . ($page_no + 1)) . '">Next</a>';
        }
        echo '</p>';
    }
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

    mf_subs_render_csv_section();

    echo '<hr /><h2>Apply by collection</h2>';
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
