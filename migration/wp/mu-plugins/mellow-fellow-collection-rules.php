<?php
/**
 * Plugin Name: Mellow Fellow - Collection Rules
 * Description: Auto-populate collections based on product attribute rules.
 *              Rules are stored as term meta on collection terms and evaluated
 *              on product save and via a bulk sync action.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

// ─── Admin: collection rule fields on edit term screen ───────────────────────

add_action('collection_edit_form_fields', function ($term) {
    $rules = get_term_meta($term->term_id, '_mf_collection_rules', true);
    if (!is_array($rules)) {
        $rules = [];
    }

    $all_categories = get_terms(['taxonomy' => 'product_cat', 'hide_empty' => false, 'orderby' => 'name']);
    if (is_wp_error($all_categories)) {
        $all_categories = [];
    }
    $all_tags = get_terms(['taxonomy' => 'product_tag', 'hide_empty' => false, 'orderby' => 'name']);
    if (is_wp_error($all_tags)) {
        $all_tags = [];
    }
    $all_types = get_terms(['taxonomy' => 'product_type', 'hide_empty' => false, 'orderby' => 'name']);
    if (is_wp_error($all_types)) {
        $all_types = [];
    }

    $rule_categories = isset($rules['categories']) ? (array) $rules['categories'] : [];
    $rule_tags       = isset($rules['tags']) ? (array) $rules['tags'] : [];
    $rule_types      = isset($rules['product_types']) ? (array) $rules['product_types'] : [];
    $rule_min_price  = isset($rules['min_price']) ? $rules['min_price'] : '';
    $rule_max_price  = isset($rules['max_price']) ? $rules['max_price'] : '';
    $rule_enabled    = !empty($rules['enabled']);
    ?>
    <tr class="form-field">
        <th scope="row">Auto-populate rules</th>
        <td>
            <label>
                <input type="checkbox" name="mf_collection_rules[enabled]" value="1" <?php checked($rule_enabled); ?> />
                Enable rule-based auto-population for this collection
            </label>
            <p class="description">When enabled, products matching ALL specified rules will be auto-assigned to this collection on save.</p>
        </td>
    </tr>
    <tr class="form-field">
        <th scope="row"><label>Match categories</label></th>
        <td>
            <select name="mf_collection_rules[categories][]" multiple="multiple" class="wc-enhanced-select" style="width:50%;" data-placeholder="Any category">
                <?php foreach ($all_categories as $cat) : ?>
                    <option value="<?php echo esc_attr($cat->slug); ?>" <?php echo in_array($cat->slug, $rule_categories) ? 'selected' : ''; ?>>
                        <?php echo esc_html($cat->name); ?>
                    </option>
                <?php endforeach; ?>
            </select>
            <p class="description">Product must be in at least one of these categories. Leave empty to skip this rule.</p>
        </td>
    </tr>
    <tr class="form-field">
        <th scope="row"><label>Match tags</label></th>
        <td>
            <select name="mf_collection_rules[tags][]" multiple="multiple" class="wc-enhanced-select" style="width:50%;" data-placeholder="Any tag">
                <?php foreach ($all_tags as $tag) : ?>
                    <option value="<?php echo esc_attr($tag->slug); ?>" <?php echo in_array($tag->slug, $rule_tags) ? 'selected' : ''; ?>>
                        <?php echo esc_html($tag->name); ?>
                    </option>
                <?php endforeach; ?>
            </select>
            <p class="description">Product must have at least one of these tags. Leave empty to skip this rule.</p>
        </td>
    </tr>
    <tr class="form-field">
        <th scope="row"><label>Match product types</label></th>
        <td>
            <select name="mf_collection_rules[product_types][]" multiple="multiple" class="wc-enhanced-select" style="width:50%;" data-placeholder="Any type">
                <?php foreach ($all_types as $type) : ?>
                    <option value="<?php echo esc_attr($type->slug); ?>" <?php echo in_array($type->slug, $rule_types) ? 'selected' : ''; ?>>
                        <?php echo esc_html($type->name); ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </td>
    </tr>
    <tr class="form-field">
        <th scope="row"><label>Price range</label></th>
        <td>
            <input type="number" name="mf_collection_rules[min_price]" value="<?php echo esc_attr($rule_min_price); ?>" step="0.01" min="0" style="width:100px;" placeholder="Min" />
            &ndash;
            <input type="number" name="mf_collection_rules[max_price]" value="<?php echo esc_attr($rule_max_price); ?>" step="0.01" min="0" style="width:100px;" placeholder="Max" />
            <p class="description">Product price must fall within this range. Leave empty to skip.</p>
        </td>
    </tr>
    <?php
}, 20);

// ─── Admin: save collection rules ───────────────────────────────────────────

add_action('edited_collection', function ($term_id) {
    if (!isset($_POST['mf_collection_rules'])) {
        return;
    }
    $input = $_POST['mf_collection_rules'];
    $rules = [
        'enabled'       => !empty($input['enabled']),
        'categories'    => isset($input['categories']) ? array_map('sanitize_text_field', (array) $input['categories']) : [],
        'tags'          => isset($input['tags']) ? array_map('sanitize_text_field', (array) $input['tags']) : [],
        'product_types' => isset($input['product_types']) ? array_map('sanitize_text_field', (array) $input['product_types']) : [],
        'min_price'     => isset($input['min_price']) && $input['min_price'] !== '' ? (float) $input['min_price'] : '',
        'max_price'     => isset($input['max_price']) && $input['max_price'] !== '' ? (float) $input['max_price'] : '',
    ];
    update_term_meta($term_id, '_mf_collection_rules', $rules);
});

// ─── Runtime: evaluate rules on product save ─────────────────────────────────

add_action('woocommerce_update_product', 'mf_collection_rules_evaluate_product');
add_action('woocommerce_new_product', 'mf_collection_rules_evaluate_product');

function mf_collection_rules_evaluate_product($product_id) {
    $product = wc_get_product($product_id);
    if (!$product || $product->get_status() !== 'publish') {
        return;
    }

    $collections = get_terms([
        'taxonomy'   => 'collection',
        'hide_empty' => false,
        'meta_key'   => '_mf_collection_rules',
    ]);

    if (is_wp_error($collections) || empty($collections)) {
        return;
    }

    foreach ($collections as $collection) {
        $rules = get_term_meta($collection->term_id, '_mf_collection_rules', true);
        if (!is_array($rules) || empty($rules['enabled'])) {
            continue;
        }

        $matches = mf_collection_rules_product_matches($product, $rules);
        $current_terms = wp_get_object_terms($product_id, 'collection', ['fields' => 'ids']);
        $is_in = in_array($collection->term_id, $current_terms);

        if ($matches && !$is_in) {
            wp_set_object_terms($product_id, $collection->term_id, 'collection', true);
        } elseif (!$matches && $is_in) {
            $remaining = array_diff($current_terms, [$collection->term_id]);
            wp_set_object_terms($product_id, array_values($remaining), 'collection');
        }
    }
}

function mf_collection_rules_product_matches($product, $rules) {
    if (!empty($rules['categories'])) {
        $cat_slugs = wp_get_object_terms($product->get_id(), 'product_cat', ['fields' => 'slugs']);
        if (!array_intersect($rules['categories'], $cat_slugs)) {
            return false;
        }
    }

    if (!empty($rules['tags'])) {
        $tag_slugs = wp_get_object_terms($product->get_id(), 'product_tag', ['fields' => 'slugs']);
        if (!array_intersect($rules['tags'], $tag_slugs)) {
            return false;
        }
    }

    if (!empty($rules['product_types'])) {
        $type_slugs = wp_get_object_terms($product->get_id(), 'product_type', ['fields' => 'slugs']);
        if (!array_intersect($rules['product_types'], $type_slugs)) {
            return false;
        }
    }

    $price = (float) $product->get_price();
    if ($rules['min_price'] !== '' && $price < (float) $rules['min_price']) {
        return false;
    }
    if ($rules['max_price'] !== '' && $price > (float) $rules['max_price']) {
        return false;
    }

    return true;
}

// ─── Admin: bulk sync action ─────────────────────────────────────────────────

add_action('admin_post_mf_sync_collection_rules', function () {
    if (!current_user_can('manage_options')) {
        wp_die('Unauthorized');
    }
    check_admin_referer('mf_sync_collection_rules');

    $products = wc_get_products([
        'status' => 'publish',
        'limit'  => -1,
        'return' => 'ids',
    ]);

    $count = 0;
    foreach ($products as $pid) {
        mf_collection_rules_evaluate_product($pid);
        $count++;
    }

    wp_safe_redirect(add_query_arg(
        ['page' => 'mf-collection-rules-sync', 'synced' => $count],
        admin_url('admin.php')
    ));
    exit;
});

add_action('admin_menu', function () {
    add_management_page(
        'Sync Collection Rules',
        'Sync Collection Rules',
        'manage_options',
        'mf-collection-rules-sync',
        function () {
            $synced = isset($_GET['synced']) ? (int) $_GET['synced'] : null;
            ?>
            <div class="wrap">
                <h1>Sync Collection Rules</h1>
                <?php if ($synced !== null) : ?>
                    <div class="notice notice-success"><p>Evaluated rules for <?php echo $synced; ?> products.</p></div>
                <?php endif; ?>
                <p>Run collection rules against all published products. Products will be added to or removed from rule-based collections accordingly.</p>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                    <input type="hidden" name="action" value="mf_sync_collection_rules" />
                    <?php wp_nonce_field('mf_sync_collection_rules'); ?>
                    <?php submit_button('Sync Now', 'primary', 'submit', false); ?>
                </form>
            </div>
            <?php
        }
    );
});
