<?php
/**
 * Plugin Name: Mellow Fellow - Product Taxonomy  and ACF edits
 * Description: Adds taxonomy-related and ACF-related functionality.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;


/**
 * ============================================================
 * TOP 3 CANNABINOIDS
 * Source: cannabinoid_mg_per_serving > cannabinoid
 * ============================================================
 */


/**
 * Resolve the field key for the repeater's 'cannabinoid' sub-field by
 * name, rather than hardcoding the key. get_field() with
 * $format_value = false returns repeater rows keyed by field key (not
 * name) in this setup, so we need the key to read the row — this
 * looks it up dynamically instead of hardcoding it, so the code
 * doesn't silently break if the field group is ever rebuilt/re-synced
 * with new keys.
 */
function top3_get_cannabinoid_field_key() {

    static $key = null;

    if ($key !== null) {
        return $key;
    }

    $repeater = acf_get_field('cannabinoid_mg_per_serving');

    if ($repeater && !empty($repeater['sub_fields'])) {

        foreach ($repeater['sub_fields'] as $sub_field) {

            if ($sub_field['name'] === 'cannabinoid') {
                $key = $sub_field['key'];
                return $key;
            }
        }
    }

    $key = false;

    return $key;
}


/**
 * Compute the current cannabinoid choices from the repeater for a
 * given post. Shared by both hooks below.
 */
function top3_get_cannabinoid_choices($post_id) {

    $choices = [];

    if (!$post_id || $post_id === 'new_post') {
        return $choices;
    }

    $cannabinoid_key = top3_get_cannabinoid_field_key();

    if (!$cannabinoid_key) {
        return $choices;
    }

    $rows = get_field(
        'cannabinoid_mg_per_serving',
        $post_id,
        false
    );

    if (empty($rows) || !is_array($rows)) {
        return $choices;
    }

    foreach ($rows as $row) {

        if (!is_array($row) || !isset($row[$cannabinoid_key])) {
            continue;
        }

        $cannabinoid = trim((string) $row[$cannabinoid_key]);

        if ($cannabinoid === '') {
            continue;
        }

        $choices[$cannabinoid] = $cannabinoid;
    }

    return $choices;
}


/**
 * Resolve the current post ID across the contexts ACF's hooks can
 * fire in (edit screen render, AJAX, save/validation).
 */
function top3_resolve_post_id() {

    $post_id = acf_get_form_data('post_id');

    if (!$post_id && !empty($_GET['post'])) {
        $post_id = absint($_GET['post']);
    }

    if (!$post_id && !empty($_POST['post_ID'])) {
        $post_id = absint($_POST['post_ID']);
    }

    if (!$post_id) {
        global $post;

        if ($post && !empty($post->ID)) {
            $post_id = $post->ID;
        }
    }

    return $post_id;
}


/**
 * Populate choices at save/validation time — required so ACF doesn't
 * silently strip submitted values that aren't in the field's static
 * (empty) choices list from the field group config.
 */
add_filter('acf/load_field/name=top_3_cannabinoids', function ($field) {

    $post_id = top3_resolve_post_id();
    $choices = top3_get_cannabinoid_choices($post_id);

    if (!empty($choices)) {
        $field['choices'] = $choices;
    }

    return $field;
});


/**
 * Populate choices at render time — kept alongside load_field in case
 * of caching differences between the two hooks in ACF's pipeline.
 */
add_filter('acf/prepare_field/name=top_3_cannabinoids', function ($field) {

    $post_id = top3_resolve_post_id();
    $choices = top3_get_cannabinoid_choices($post_id);

    if (!empty($choices)) {
        $field['choices'] = $choices;
    }

    return $field;
});


/**
 * Live update without saving.
 */
add_action('acf/input/admin_footer', function () {
    ?>
    <script>
    (function($) {

        if (typeof acf === 'undefined') {
            return;
        }

        const repeaterName    = 'cannabinoid_mg_per_serving';
        const cannabinoidName = 'cannabinoid';
        const top3Name        = 'top_3_cannabinoids';


        function getRepeaterField() {
            return $('.acf-field[data-name="' + repeaterName + '"]').first();
        }


        function getTop3Field() {
            return $('.acf-field[data-name="' + top3Name + '"]').first();
        }


        /**
         * Read all cannabinoid values currently in the repeater DOM.
         */
        function getCannabinoids() {

            const values = [];
            const $repeater = getRepeaterField();

            if (!$repeater.length) {
                return values;
            }

            $repeater
                .find('.acf-row:not(.acf-clone)')
                .each(function() {

                    const $row = $(this);

                    const $field = $row
                        .find('.acf-field[data-name="' + cannabinoidName + '"]')
                        .first();

                    if (!$field.length) {
                        return;
                    }

                    let value = null;

                    /*
                     * Select field.
                     */
                    const $select = $field.find('select').first();

                    if ($select.length) {
                        value = $select.val();
                    }

                    /*
                     * Text-like field.
                     */
                    if (value === null || value === undefined) {
                        const $input = $field
                            .find(
                                'input[type="text"], ' +
                                'input[type="number"], ' +
                                'input:not([type]), textarea'
                            )
                            .first();

                        if ($input.length) {
                            value = $input.val();
                        }
                    }

                    if (value === null || value === undefined) {
                        return;
                    }

                    /*
                     * In case cannabinoid itself is multiple.
                     */
                    if (Array.isArray(value)) {

                        value.forEach(function(item) {

                            item = String(item).trim();

                            if (item && !values.includes(item)) {
                                values.push(item);
                            }

                        });

                        return;
                    }

                    value = String(value).trim();

                    if (value && !values.includes(value)) {
                        values.push(value);
                    }
                });

            return values;
        }


        /**
         * Destroy the Select2 instance on $select (if one exists) and
         * return a function that reinitializes it with the same options
         * ACF originally configured it with. This is required because
         * Select2 caches its own copy of the option list at init time —
         * appending native <option> elements to the underlying <select>
         * does not make them appear in the Select2 dropdown on its own.
         */
        function prepareSelect2Refresh($select) {

            const hasSelect2 = $select.hasClass('select2-hidden-accessible');
            let select2Options = {};

            if (hasSelect2) {

                const instance = $select.data('select2');

                if (instance && instance.options && instance.options.options) {
                    select2Options = instance.options.options;
                }

                $select.select2('destroy');
            }

            return function reinit() {

                if (hasSelect2 && $.fn.select2) {
                    $select.select2(select2Options);
                } else {
                    $select.trigger('change');
                }
            };
        }


        /**
         * Sync repeater values into top_3_cannabinoids.
         */
        function syncTop3Cannabinoids() {

            const $field = getTop3Field();

            if (!$field.length) {
                return;
            }

            const $select = $field.find('select').first();

            if (!$select.length) {
                return;
            }

            /*
             * Preserve selections.
             */
            let selected = $select.val() || [];

            if (!Array.isArray(selected)) {
                selected = [selected];
            }

            selected = selected.map(String);

            const cannabinoids = getCannabinoids();

            /*
             * IMPORTANT:
             * On initial loading, don't erase PHP-loaded choices if
             * ACF hasn't rendered the repeater rows yet.
             */
            if (!cannabinoids.length && !getRepeaterField().length) {
                return;
            }

            const reinitSelect2 = prepareSelect2Refresh($select);

            $select.empty();

            cannabinoids.forEach(function(value) {

                const isSelected = selected.includes(value);

                $select.append(
                    new Option(
                        value,
                        value,
                        isSelected,
                        isSelected
                    )
                );

            });

            reinitSelect2();
        }


        /**
         * Initial ACF initialization.
         */
        acf.addAction('ready', function() {
            setTimeout(function() {
                syncTop3Cannabinoids();
                observeRepeaterMutations();
            }, 100);
        });


        /**
         * Repeater row added — also (re)starts the mutation observer,
         * in case the repeater wasn't yet on the page during 'ready'
         * (e.g. it's inside a tab that hadn't rendered its content yet).
         */
        acf.addAction('append', function($el) {

            if (
                $el.closest(
                    '.acf-field[data-name="' + repeaterName + '"]'
                ).length
            ) {
                setTimeout(function() {
                    syncTop3Cannabinoids();
                    observeRepeaterMutations();
                }, 50);
            }

        });


        /**
         * Watch the repeater for structural DOM changes (rows added or
         * removed) rather than relying on a specific click selector for
         * ACF's remove-row button. Row removal doesn't fire any input/
         * change event, and the exact remove-button markup can differ
         * between ACF versions, so a MutationObserver is the reliable
         * way to catch it regardless of how the row was removed.
         */
        function observeRepeaterMutations() {

            const $repeater = getRepeaterField();

            if (!$repeater.length || typeof MutationObserver === 'undefined') {
                return;
            }

            const repeaterEl = $repeater.get(0);

            if (!repeaterEl || repeaterEl.dataset.top3Observed) {
                return;
            }

            repeaterEl.dataset.top3Observed = '1';

            const observer = new MutationObserver(function(mutations) {

                const hasStructuralChange = mutations.some(function(m) {
                    return m.type === 'childList' &&
                        (m.addedNodes.length || m.removedNodes.length);
                });

                if (hasStructuralChange) {
                    syncTop3Cannabinoids();
                }
            });

            observer.observe(repeaterEl, {
                childList: true,
                subtree: true
            });
        }


        /**
         * Live changes.
         */
        $(document).on(
            'input change',
            '.acf-field[data-name="' + repeaterName + '"] ' +
            '.acf-field[data-name="' + cannabinoidName + '"] input, ' +

            '.acf-field[data-name="' + repeaterName + '"] ' +
            '.acf-field[data-name="' + cannabinoidName + '"] select, ' +

            '.acf-field[data-name="' + repeaterName + '"] ' +
            '.acf-field[data-name="' + cannabinoidName + '"] textarea',

            function() {
                syncTop3Cannabinoids();
            }
        );

    })(jQuery);
    </script>
    <?php
});
