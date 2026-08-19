<?php
/**
 * Plugin Name: Mellow Fellow Nutrition GraphQL Fix
 * Description: Resolves the Nutrition field group's GraphQL fields directly
 *              via ACF, bypassing WPGraphQL-for-ACF's own resolver.
 *              TEMPORARY DIAGNOSTIC BUILD — see note below.
 * Version: 2.1.0-debug
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * v2.0.0 guessed at the shape of $source (the WPGraphQL Product model
 * passed into a field resolver on SimpleProduct/VariableProduct) to find
 * the post ID, then called get_field('nutrition', $post_id) directly to
 * avoid the bridge plugin's own (location-rule-dependent, empty("0")-prone)
 * resolution. That guess was wrong too — `nutrition` itself now resolves to
 * null, meaning either post_id extraction or get_field() is failing.
 *
 * There's no server log access from this side, so rather than guess a
 * third time, this build reports what $source and get_field() actually
 * look like THROUGH the GraphQL response itself, via the `calories` string
 * field. Query nutrition { calories } on a product of one of the two
 * covered types and read the message back — that tells us the real shape,
 * and the next build drops all of this and resolves properly.
 */
add_action('graphql_register_types', function () {
    $product_types = ['SimpleProduct', 'VariableProduct'];

    foreach ($product_types as $type) {
        register_graphql_field($type, 'nutrition', [
            'type'        => 'Nutrition',
            'description' => 'Nutrition field group (calories, sugar, carbs). [debug build]',
            'resolve'     => function ($source) {
                $debug = [];
                $debug[] = 'source_type=' . gettype($source);

                if (is_object($source)) {
                    $debug[] = 'class=' . get_class($source);
                    $props = array_keys(get_object_vars($source));
                    $debug[] = 'public_props=[' . implode(',', $props) . ']';
                } elseif (is_array($source)) {
                    $debug[] = 'array_keys=[' . implode(',', array_keys($source)) . ']';
                } else {
                    $debug[] = 'value=' . var_export($source, true);
                }

                $post_id = null;
                $tried = [];
                if (is_object($source)) {
                    if (isset($source->databaseId)) {
                        $post_id = (int) $source->databaseId;
                        $tried[] = 'databaseId=' . $source->databaseId;
                    } elseif (isset($source->ID)) {
                        $post_id = (int) $source->ID;
                        $tried[] = 'ID=' . $source->ID;
                    } elseif (method_exists($source, 'get_id')) {
                        $post_id = (int) $source->get_id();
                        $tried[] = 'get_id()=' . $post_id;
                    }
                } elseif (is_array($source) && isset($source['databaseId'])) {
                    $post_id = (int) $source['databaseId'];
                    $tried[] = 'array[databaseId]=' . $source['databaseId'];
                }
                $debug[] = 'post_id_found=' . ($post_id ?: 'NONE') . ' (' . implode(', ', $tried) . ')';

                if (!$post_id) {
                    return [
                        'calories' => 'DEBUG: ' . implode(' || ', $debug),
                        'sugar'    => null,
                        'carbs'    => null,
                    ];
                }

                $fields = get_field('nutrition', $post_id);
                $debug[] = 'get_field(nutrition,' . $post_id . ')_type=' . gettype($fields);
                $debug[] = 'get_field_value=' . substr(print_r($fields, true), 0, 300);

                if (!is_array($fields)) {
                    // Also try reading the sub-fields individually in case
                    // this group isn't registered as a nested "group" field
                    // (get_field on the group name only works for that
                    // layout) — some ACF setups attach sub-fields directly
                    // to the post instead.
                    $direct_calories = get_field('calories', $post_id);
                    $direct_sugar = get_field('sugar', $post_id);
                    $debug[] = 'direct_get_field(calories)=' . var_export($direct_calories, true);
                    $debug[] = 'direct_get_field(sugar)=' . var_export($direct_sugar, true);

                    return [
                        'calories' => 'DEBUG: ' . implode(' || ', $debug),
                        'sugar'    => null,
                        'carbs'    => null,
                    ];
                }

                return [
                    'calories' => $fields['calories'] ?? null,
                    'sugar'    => $fields['sugar'] ?? null,
                    'carbs'    => $fields['carbs'] ?? null,
                ];
            },
        ]);
    }

    foreach (['calories', 'sugar', 'carbs'] as $field_name) {
        register_graphql_field('Nutrition', $field_name, [
            'type'        => 'String',
            'description' => "Nutrition {$field_name} value (ACF text field).",
            'resolve'     => function ($source) use ($field_name) {
                $value = is_array($source) ? ($source[$field_name] ?? null) : null;

                if ($value === null || $value === false || $value === '') {
                    return null;
                }

                return (string) $value;
            },
        ]);
    }
});
