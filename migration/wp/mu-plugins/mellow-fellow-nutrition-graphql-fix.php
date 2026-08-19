<?php
/**
 * Plugin Name: Mellow Fellow Nutrition GraphQL Fix
 * Description: Correctly resolves the Nutrition field group's GraphQL
 *              fields. Replaces v1.0.0, which guessed wrong about $source's
 *              shape and returned null unconditionally for every field.
 * Version: 2.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * WPGraphQL-for-ACF's default scalar-field resolver discards a value when
 * empty($value) is true. In PHP, empty("0") — and empty(0), empty("") — all
 * evaluate to true, so a text/number field genuinely saved as "0" resolves
 * to null over GraphQL even though wp_postmeta holds "0", not an empty
 * string. Re-registering these three fields with an explicit null/''-only
 * check fixes it without touching how the value is stored or fetched.
 *
 * $source for a field on the Nutrition type is the array of already-fetched
 * sub-field values the parent (`nutrition` on each product type) resolver
 * produced — so this reads $source[$field] directly rather than re-querying
 * ACF, keeping it consistent with whatever fetched the group in the first
 * place. Falls back to get_field() only if $source isn't array-like, in
 * case a future plugin version resolves the group differently.
 */
add_action('graphql_register_types', function () {
    $product_types = ['SimpleProduct', 'VariableProduct'];

    foreach ($product_types as $type) {
        register_graphql_field($type, 'nutrition', [
            'type'        => 'Nutrition',
            'description' => 'Nutrition field group (calories, sugar, carbs).',
            'resolve'     => function ($source) {
                $post_id = null;
                if (is_object($source)) {
                    if (isset($source->databaseId)) {
                        $post_id = (int) $source->databaseId;
                    } elseif (isset($source->ID)) {
                        $post_id = (int) $source->ID;
                    }
                } elseif (is_array($source) && isset($source['databaseId'])) {
                    $post_id = (int) $source['databaseId'];
                }

                if (!$post_id) {
                    return null;
                }

                $fields = get_field('nutrition', $post_id);
                if (!is_array($fields)) {
                    return null;
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
