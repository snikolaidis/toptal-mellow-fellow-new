<?php
/**
 * Plugin Name: Mellow Fellow Nutrition GraphQL Fix
 * Description: Resolves the Nutrition field group's GraphQL fields directly
 *              via ACF, bypassing WPGraphQL-for-ACF's own resolver.
 * Version: 3.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('graphql_register_types', function () {
    $product_types = ['SimpleProduct', 'VariableProduct'];

    foreach ($product_types as $type) {
        register_graphql_field($type, 'nutrition', [
            'type'        => 'Nutrition',
            'description' => 'Nutrition field group (calories, sugar, carbs).',
            'resolve'     => function ($source) {
                $post_id = is_object($source) && isset($source->databaseId)
                    ? (int) $source->databaseId
                    : null;

                if (!$post_id) {
                    return null;
                }

                return [
                    'calories' => get_field('calories', $post_id),
                    'sugar'    => get_field('sugar', $post_id),
                    'carbs'    => get_field('carbs', $post_id),
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
