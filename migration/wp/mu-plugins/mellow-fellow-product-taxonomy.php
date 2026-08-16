<?php
/**
 * Plugin Name: Mellow Fellow - Product Taxonomy Metaboxes
 * Description: Adds taxonomy-related metaboxes (e.g. Mellow Meter) for products.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action('add_meta_boxes', function () {
    // Remove both hierarchical and non-hierarchical taxonomy meta boxes if present
    remove_meta_box('mellow-meterdiv', 'product', 'side');
    remove_meta_box('tagsdiv-mellow-meter', 'product', 'side');

    add_meta_box(
        'mellow-meter-slider',
        'Mellow Meter',
        'mellow_meter_slider_metabox',
        'product',
        'side',
        'default'
    );
}, 100);

function mellow_meter_slider_metabox($post) {
    $taxonomy = 'mellow-meter';
    $terms = get_terms(['taxonomy' => $taxonomy, 'hide_empty' => false]);

    // Sort terms by their meter_value ACF field, ascending
    usort($terms, function ($a, $b) {
        return (int) get_field('meter_value', $a) <=> (int) get_field('meter_value', $b);
    });

    $current = wp_get_object_terms($post->ID, $taxonomy, ['fields' => 'ids']);
    $selected_id = !empty($current) ? $current[0] : ($terms[0]->term_id ?? 0);

    $selected_index = 1;
    $term_data = [];
    foreach ($terms as $i => $term) {
        $term_data[] = [
            'id'    => $term->term_id,
            'name'  => $term->name,
            'value' => (int) get_field('meter_value', $term),
        ];
        if ($term->term_id == $selected_id) {
            $selected_index = $i + 1;
        }
    }

    wp_nonce_field('mellow_meter_nonce', 'mellow_meter_nonce_field');
    ?>
    <div id="mellow-meter-slider-wrap" style="padding:10px 4px;">
        <div id="mellow-meter-preview-label" style="font-weight:600;text-align:center;margin-bottom:8px;">
            <?php echo esc_html($term_data[$selected_index - 1]['name'] ?? ''); ?>
        </div>
        <input type="range" id="mellow-meter-range" min="1" max="<?php echo count($term_data); ?>" step="1"
               value="<?php echo esc_attr($selected_index); ?>" style="width:100%;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#888;margin-top:4px;">
            <?php foreach ($term_data as $t) : ?>
                <span><?php echo esc_html($t['value']); ?></span>
            <?php endforeach; ?>
        </div>
        <input type="hidden" name="mellow_meter_term" id="mellow-meter-term-input" value="<?php echo esc_attr($selected_id); ?>">
    </div>

    <script>
    (function () {
        var termData = <?php echo wp_json_encode($term_data); ?>;
        var range = document.getElementById('mellow-meter-range');
        var label = document.getElementById('mellow-meter-preview-label');
        var hidden = document.getElementById('mellow-meter-term-input');

        range.addEventListener('input', function () {
            var t = termData[this.value - 1];
            if (!t) return;
            hidden.value = t.id;
            label.textContent = t.name;
        });
    })();
    </script>
    <?php
}

add_action('save_post_product', function ($post_id) {
    if (!isset($_POST['mellow_meter_nonce_field']) ||
        !wp_verify_nonce($_POST['mellow_meter_nonce_field'], 'mellow_meter_nonce')) {
        return;
    }
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
        return;
    }
    if (isset($_POST['mellow_meter_term'])) {
        wp_set_object_terms($post_id, (int) $_POST['mellow_meter_term'], 'mellow-meter', false);
    }
});
